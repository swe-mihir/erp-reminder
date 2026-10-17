import { db, type ErpAccountRow, type ItemRow, type UserRow } from "./db";
import { decrypt } from "./crypto";
import { ErpAuthError, ErpClient } from "./erp/client";
import { fetchStudentItems, type ErpItem } from "./erp/parse";
import { buildDigest, planAlerts } from "./alerts";
import { sendMail, layout, appUrl } from "./mail";

/** Stop retrying an account after this many consecutive wrong-password failures (avoids ERP lockouts). */
export const MAX_AUTH_FAILURES = 3;

export type SyncResult = { ok: boolean; count?: number; error?: string; authFailed?: boolean };

/** Log into the ERP with the given credentials and pull deadlines. Used for "connect" validation too. */
export async function pullFromErp(username: string, password: string) {
  const client = new ErpClient();
  try {
    await client.login(username, password);
    return await fetchStudentItems(client);
  } finally {
    await client.logout();
  }
}

export async function saveItems(userId: string, items: ErpItem[]) {
  const sql = db();
  await sql.begin(async (tx) => {
    for (const it of items) {
      await tx`
        INSERT INTO items (user_id, kind, external_id, subject_code, subject_name, title, opens_at, due_at, completed, note)
        VALUES (${userId}, ${it.kind}, ${it.externalId}, ${it.subjectCode}, ${it.subjectName}, ${it.title},
                ${it.opensAt}, ${it.dueAt}, ${it.completed}, ${it.note})
        ON CONFLICT (user_id, kind, external_id) DO UPDATE SET
          subject_code = EXCLUDED.subject_code, subject_name = EXCLUDED.subject_name, title = EXCLUDED.title,
          opens_at = EXCLUDED.opens_at, due_at = EXCLUDED.due_at, completed = EXCLUDED.completed,
          note = EXCLUDED.note, updated_at = now()`;
    }
    // Remove items the ERP no longer lists (e.g. new semester, deleted by faculty)
    const keys = items.map((i) => `${i.kind}|${i.externalId}`);
    await tx`
      DELETE FROM items WHERE user_id = ${userId}
        AND NOT ((kind || '|' || external_id) = ANY(${keys}::text[]))`;
  });
}

/** Sync one user from the ERP. Never throws; records status on erp_accounts. */
export async function syncUser(userId: string): Promise<SyncResult> {
  const sql = db();
  const [acct] = await sql<ErpAccountRow[]>`SELECT * FROM erp_accounts WHERE user_id = ${userId}`;
  if (!acct) return { ok: false, error: "ERP account not connected" };
  try {
    const { items, studentName } = await pullFromErp(acct.erp_username, decrypt(acct.erp_password_enc));
    await saveItems(userId, items);
    await sql`
      UPDATE erp_accounts SET last_sync_at = now(), last_sync_ok = true, last_error = NULL, fail_count = 0,
        student_name = COALESCE(${studentName}, student_name)
      WHERE user_id = ${userId}`;
    return { ok: true, count: items.length };
  } catch (e) {
    const authFailed = e instanceof ErpAuthError;
    const msg = e instanceof Error ? e.message : String(e);
    const [row] = await sql<{ fail_count: number }[]>`
      UPDATE erp_accounts SET last_sync_at = now(), last_sync_ok = false, last_error = ${msg},
        fail_count = CASE WHEN ${authFailed} THEN fail_count + 1 ELSE fail_count END
      WHERE user_id = ${userId} RETURNING fail_count`;
    if (authFailed && row?.fail_count === 1) await notifyAuthProblem(userId);
    return { ok: false, error: msg, authFailed };
  }
}

async function notifyAuthProblem(userId: string) {
  const [u] = await db()<UserRow[]>`SELECT * FROM users WHERE id = ${userId}`;
  if (!u) return;
  await sendMail({
    to: u.email,
    subject: "Action needed: your ERP password stopped working",
    text: `We couldn't log into the ERP with your saved password, so deadline alerts are paused. If you changed your ERP password, update it at ${appUrl("/dashboard")}.`,
    html: layout(
      "Your ERP login stopped working",
      `<p style="font-size:14px;line-height:1.5">We couldn't log into the ERP with your saved password, so <b>deadline alerts are paused</b>. If you recently changed your ERP password, update it on your dashboard.</p>
       <p><a href="${appUrl("/dashboard")}" style="background:#b4441c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">Update ERP password</a></p>`,
    ),
  }).catch((err) => console.error("notifyAuthProblem failed", err));
}

/** Work out and send this user's due alerts (one digest email). Returns number of items alerted. */
export async function sendDueAlerts(userId: string, now = new Date()): Promise<number> {
  const sql = db();
  const [u] = await sql<UserRow[]>`SELECT * FROM users WHERE id = ${userId}`;
  if (!u || !u.alerts_enabled || !u.email_verified) return 0;

  const items = await sql<ItemRow[]>`
    SELECT * FROM items WHERE user_id = ${userId} AND completed = false AND due_at > ${now}
      ${u.include_quizzes ? sql`` : sql`AND kind = 'assignment'`}`;
  if (!items.length) return 0;
  const sentRows = await sql<{ item_id: string; days_before: number }[]>`
    SELECT item_id, days_before FROM alerts_sent WHERE item_id = ANY(${items.map((i) => i.id)}::bigint[])`;
  const sent = new Set(sentRows.map((r) => `${r.item_id}:${r.days_before}`));

  const plan = planAlerts(items, u.alert_days, sent, now);
  if (!plan.length) return 0;

  await sendMail(buildDigest(u.email, plan, now));
  for (const p of plan) {
    for (const d of p.coversThresholds) {
      await sql`INSERT INTO alerts_sent (item_id, days_before) VALUES (${p.item.id}, ${d}) ON CONFLICT DO NOTHING`;
    }
  }
  return plan.length;
}

/**
 * Sync every connected, verified account and send alerts.
 * @param budgetMs stop starting new users after this long (for serverless time limits)
 */
export async function syncAll({ budgetMs = Infinity, delayMs = 1500, log = console.log } = {}) {
  const sql = db();
  const started = Date.now();
  const users = await sql<{ user_id: string; email: string }[]>`
    SELECT a.user_id, u.email FROM erp_accounts a JOIN users u ON u.id = a.user_id
    WHERE u.email_verified AND a.fail_count < ${MAX_AUTH_FAILURES}
    ORDER BY a.last_sync_at NULLS FIRST`;
  const summary = { users: users.length, synced: 0, failed: 0, alerts: 0, skipped: 0 };
  for (const [i, u] of users.entries()) {
    if (Date.now() - started > budgetMs) {
      summary.skipped = users.length - i;
      break;
    }
    const r = await syncUser(u.user_id);
    if (r.ok) summary.synced++;
    else summary.failed++;
    try {
      // If the ERP was just briefly unreachable, alert from the last known data.
      // If the password stopped working, the data may be stale, so alerts pause (the user was emailed).
      if (r.ok || !r.authFailed) summary.alerts += await sendDueAlerts(u.user_id);
    } catch (e) {
      log(`alerts failed for user ${u.user_id}: ${e instanceof Error ? e.message : e}`);
    }
    log(`user ${u.user_id}: ${r.ok ? `ok (${r.count} items)` : `FAILED: ${r.error}`}`);
    if (delayMs && i < users.length - 1) await new Promise((res) => setTimeout(res, delayMs));
  }
  return summary;
}
