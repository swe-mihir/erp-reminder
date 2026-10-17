"use client";

import { useActionState } from "react";
import {
  connectErpAction,
  deleteAccountAction,
  resendVerificationAction,
  saveSettingsAction,
  syncNowAction,
  type FormState,
} from "../actions";

function Msg({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error) return <div className="msg error" role="alert">{state.error}</div>;
  if (state.ok) return <div className="msg ok" role="status">{state.ok}</div>;
  return null;
}

export function ConnectErpForm({ username, compact }: { username?: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectErpAction, undefined);
  return (
    <form action={action}>
      <Msg state={state} />
      {!compact && (
        <div className="lock">
          <span aria-hidden>🔒</span>
          <span>Your ERP password is encrypted before it's saved and is only used to read your assignments and quizzes. It's never shown again.</span>
        </div>
      )}
      <label className="field">
        <span>ERP username</span>
        <input type="text" name="erp_username" required defaultValue={state?.values?.erp_username ?? username} key={state?.values?.erp_username ?? "init"} autoComplete="off" placeholder="As on erp.vcet.edu.in" />
      </label>
      <label className="field">
        <span>ERP password</span>
        <input type="password" name="erp_password" required autoComplete="off" />
      </label>
      <button className="btn block" disabled={pending}>
        {pending ? "Checking with ERP…" : compact ? "Update login" : "Connect ERP account"}
      </button>
    </form>
  );
}

export function SyncButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(syncNowAction, undefined);
  return (
    <form action={action}>
      <Msg state={state} />
      <button className="btn ghost small" disabled={pending}>{pending ? "Syncing…" : "↻ Sync now"}</button>
    </form>
  );
}

export function ResendVerification() {
  const [state, action, pending] = useActionState<FormState, FormData>(resendVerificationAction, undefined);
  if (state?.ok) return <span>{state.ok}</span>;
  return (
    <form action={action}>
      <button className="btn small" disabled={pending}>{pending ? "Sending…" : "Resend email"}</button>
    </form>
  );
}

const DAY_OPTIONS = [7, 5, 3, 2, 1];

export function SettingsForm({ days, enabled, quizzes }: { days: number[]; enabled: boolean; quizzes: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettingsAction, undefined);
  return (
    <form action={action}>
      <Msg state={state} />
      <label className="toggle">
        <input type="checkbox" name="alerts_enabled" defaultChecked={enabled} /> Email alerts on
      </label>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Remind me before a deadline:</div>
      <div className="checks">
        {DAY_OPTIONS.map((d) => (
          <label className="chip" key={d}>
            <input type="checkbox" name="alert_days" value={d} defaultChecked={days.includes(d)} />
            <span>{d} day{d > 1 ? "s" : ""}</span>
          </label>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" name="include_quizzes" defaultChecked={quizzes} /> Include online quizzes
      </label>
      <button className="btn small" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, undefined);
  return (
    <form action={action}>
      <Msg state={state} />
      <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 0 }}>
        This permanently erases your account, your saved ERP login, and all synced deadlines.
      </p>
      <label className="field">
        <span>Type “delete” to confirm</span>
        <input type="text" name="confirm" autoComplete="off" />
      </label>
      <button className="btn danger small" disabled={pending}>Delete my account</button>
    </form>
  );
}
