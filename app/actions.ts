"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, type ErpAccountRow, type UserRow } from "@/lib/db";
import { createSession, destroySession, emailAllowed, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { encrypt, randomToken } from "@/lib/crypto";
import { appUrl, layout, sendMail } from "@/lib/mail";
import { ErpAuthError } from "@/lib/erp/client";
import { pullFromErp, saveItems, sendDueAlerts, syncUser } from "@/lib/sync";

export type FormState = { error?: string; ok?: string; values?: Record<string, string> } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendVerification(email: string, token: string) {
  const link = appUrl(`/verify?token=${encodeURIComponent(token)}`);
  await sendMail({
    to: email,
    subject: "Confirm your email for ERP Reminder",
    text: `Confirm your email to start getting deadline alerts: ${link}`,
    html: layout(
      "Confirm your email",
      `<p style="font-size:14px;line-height:1.5">Click below to confirm this address. Deadline alerts start once it's confirmed.</p>
       <p><a href="${link}" style="background:#b4441c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">Confirm email</a></p>
       <p style="font-size:12px;color:#7a7365">Didn't sign up? Ignore this email.</p>`,
    ),
  });
}

// ---------------------------------------------------------------- auth

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const values = { email };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", values };
  if (!emailAllowed(email)) return { error: "Sign-ups are limited to college email addresses.", values };
  if (password.length < 8) return { error: "Password must be at least 8 characters.", values };

  const sql = db();
  const [exists] = await sql`SELECT 1 FROM users WHERE email = ${email}`;
  if (exists) return { error: "An account with this email already exists. Log in instead.", values };

  const skipVerify = process.env.SKIP_EMAIL_VERIFICATION === "true"; // local mode
  const token = skipVerify ? null : randomToken(24);
  const [u] = await sql<UserRow[]>`
    INSERT INTO users (email, password_hash, verify_token, email_verified)
    VALUES (${email}, ${await hashPassword(password)}, ${token}, ${skipVerify}) RETURNING *`;
  if (token) {
    try {
      await sendVerification(email, token);
    } catch (e) {
      console.error("verification email failed", e);
    }
  }
  await createSession(u.id);
  redirect("/dashboard");
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const [u] = await db()<UserRow[]>`SELECT * FROM users WHERE email = ${email}`;
  if (!u || !(await verifyPassword(password, u.password_hash))) return { error: "Wrong email or password.", values: { email } };
  await createSession(u.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function resendVerificationAction(): Promise<FormState> {
  const u = await requireUser();
  if (u.email_verified) return { ok: "Already confirmed." };
  const token = u.verify_token || randomToken(24);
  await db()`UPDATE users SET verify_token = ${token} WHERE id = ${u.id}`;
  await sendVerification(u.email, token);
  return { ok: "Sent. Check your inbox (and spam folder)." };
}

// ---------------------------------------------------------------- ERP account

export async function connectErpAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await requireUser();
  const username = String(form.get("erp_username") || "").trim();
  const password = String(form.get("erp_password") || "");
  const values = { erp_username: username };
  if (!username || !password) return { error: "Enter both your ERP username and password.", values };

  let result;
  try {
    result = await pullFromErp(username, password);
  } catch (e) {
    if (e instanceof ErpAuthError) return { error: "The ERP rejected that username or password. Use the same login you use on erp.vcet.edu.in.", values };
    console.error("ERP connect failed", e);
    return { error: "Couldn't reach the ERP right now. Try again in a few minutes.", values };
  }

  const sql = db();
  await sql`
    INSERT INTO erp_accounts (user_id, erp_username, erp_password_enc, student_name, last_sync_at, last_sync_ok, fail_count)
    VALUES (${u.id}, ${username}, ${encrypt(password)}, ${result.studentName}, now(), true, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      erp_username = EXCLUDED.erp_username, erp_password_enc = EXCLUDED.erp_password_enc,
      student_name = COALESCE(EXCLUDED.student_name, erp_accounts.student_name),
      last_sync_at = now(), last_sync_ok = true, last_error = NULL, fail_count = 0`;
  await saveItems(u.id, result.items);
  await sendDueAlerts(u.id).catch((e) => console.error("alerts after connect failed", e));
  revalidatePath("/dashboard");
  return { ok: `Connected. Found ${result.items.length} assignments and quizzes.` };
}

export async function disconnectErpAction() {
  const u = await requireUser();
  const sql = db();
  await sql`DELETE FROM items WHERE user_id = ${u.id}`;
  await sql`DELETE FROM erp_accounts WHERE user_id = ${u.id}`;
  revalidatePath("/dashboard");
}

export async function syncNowAction(): Promise<FormState> {
  const u = await requireUser();
  const [a] = await db()<ErpAccountRow[]>`SELECT * FROM erp_accounts WHERE user_id = ${u.id}`;
  if (!a) return { error: "Connect your ERP account first." };
  if (a.last_sync_at && Date.now() - a.last_sync_at.getTime() < 5 * 60_000 && a.last_sync_ok)
    return { ok: "Already up to date (synced in the last 5 minutes)." };
  const r = await syncUser(u.id);
  if (r.ok) await sendDueAlerts(u.id).catch(() => undefined);
  revalidatePath("/dashboard");
  if (r.ok) return { ok: `Synced ${r.count} items.` };
  return { error: r.authFailed ? "The ERP rejected your saved password. Update it below." : `Sync failed: ${r.error}` };
}

// ---------------------------------------------------------------- settings

export async function saveSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await requireUser();
  const days = form
    .getAll("alert_days")
    .map((v) => parseInt(String(v), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 14);
  const enabled = form.get("alerts_enabled") === "on";
  const quizzes = form.get("include_quizzes") === "on";
  if (enabled && days.length === 0) return { error: "Pick at least one reminder time, or turn alerts off." };
  await db()`
    UPDATE users SET alert_days = ${[...new Set(days)].sort((a, b) => b - a)}::int[],
      alerts_enabled = ${enabled}, include_quizzes = ${quizzes}
    WHERE id = ${u.id}`;
  revalidatePath("/dashboard");
  return { ok: "Saved." };
}

export async function deleteAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await requireUser();
  if (String(form.get("confirm") || "").trim().toLowerCase() !== "delete")
    return { error: 'Type "delete" to confirm.' };
  await db()`DELETE FROM users WHERE id = ${u.id}`; // cascades to sessions, ERP account, items, alerts
  await destroySession();
  redirect("/?deleted=1");
}
