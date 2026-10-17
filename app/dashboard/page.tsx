import { requireUser } from "@/lib/auth";
import { db, type ErpAccountRow, type ItemRow } from "@/lib/db";
import { formatIST, relative } from "@/lib/time";
import { MAX_AUTH_FAILURES } from "@/lib/sync";
import Topbar from "../Topbar";
import Deadlines, { type UiItem } from "./Deadlines";
import { ConnectErpForm, DeleteAccountForm, ResendVerification, SettingsForm, SyncButton } from "./Forms";
import { disconnectErpAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ verified?: string }> }) {
  const user = await requireUser();
  const { verified } = await searchParams;
  const sql = db();
  const [acct] = await sql<ErpAccountRow[]>`SELECT * FROM erp_accounts WHERE user_id = ${user.id}`;
  const rows = acct
    ? await sql<ItemRow[]>`
        SELECT * FROM items WHERE user_id = ${user.id}
          AND (completed = false OR due_at > now() - interval '30 days')
        ORDER BY due_at`
    : [];
  const items: UiItem[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject_name,
    code: r.subject_code,
    title: r.title,
    due: r.due_at.toISOString(),
    completed: r.completed,
    note: r.note,
  }));
  const now = new Date();
  const paused = acct && acct.fail_count >= MAX_AUTH_FAILURES;

  return (
    <>
      <Topbar email={user.email} name={acct?.student_name} />
      <main className="wrap">
        {verified === "1" && <div className="banner ok">Email confirmed. Alerts are on.</div>}
        {verified === "0" && <div className="banner err">That confirmation link is invalid or was already used.</div>}
        {!user.email_verified && (
          <div className="banner warn">
            <span>
              📬 Confirm your email (<b>{user.email}</b>) to start receiving alerts. Check your inbox and spam folder.
            </span>
            <ResendVerification />
          </div>
        )}
        {acct && acct.last_sync_ok === false && (
          <div className="banner err">
            <span>
              {paused
                ? "Syncing is paused because the ERP rejected your saved password several times. Update your ERP login in the panel on the right."
                : `The last sync failed: ${acct.last_error ?? "unknown error"}`}
            </span>
          </div>
        )}

        {!acct ? (
          <div style={{ padding: "32px 0 60px" }}>
            <div className="card connect-card">
              <h2>Connect your ERP account</h2>
              <p className="sub">Use the same username and password you use on erp.vcet.edu.in. We'll check it right away and pull your current assignments and quizzes.</p>
              <ConnectErpForm />
            </div>
          </div>
        ) : (
          <div className="dash">
            <Deadlines items={items} nowIso={now.toISOString()} />

            <aside className="side">
              <div className="card">
                <h2>Alerts</h2>
                <p className="sub">One email per check, listing everything that's due soon. We check the ERP about every 3 hours between 7 am and 10 pm.</p>
                <SettingsForm days={user.alert_days} enabled={user.alerts_enabled} quizzes={user.include_quizzes} />
              </div>

              <div className="card">
                <h2>ERP account</h2>
                <dl className="kv">
                  <div><dt>Username</dt><dd>{acct.erp_username}</dd></div>
                  {acct.student_name && <div><dt>Student</dt><dd>{acct.student_name}</dd></div>}
                  <div>
                    <dt>Last synced</dt>
                    <dd>{acct.last_sync_at ? `${relative(acct.last_sync_at, now)} (${formatIST(acct.last_sync_at)})` : "never"}</dd>
                  </div>
                  <div><dt>Status</dt><dd style={{ color: acct.last_sync_ok ? "var(--green)" : "var(--red)" }}>{acct.last_sync_ok ? "OK" : paused ? "Paused" : "Error"}</dd></div>
                </dl>
                <div className="row" style={{ marginBottom: 12 }}>
                  <SyncButton />
                  <form action={disconnectErpAction}>
                    <button className="btn ghost small">Disconnect</button>
                  </form>
                </div>
                <details className="more" open={!!paused}>
                  <summary>Changed your ERP password?</summary>
                  <ConnectErpForm username={acct.erp_username} compact />
                </details>
              </div>

              <div className="card">
                <details className="more">
                  <summary>Delete account</summary>
                  <DeleteAccountForm />
                </details>
              </div>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
