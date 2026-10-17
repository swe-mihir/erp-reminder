"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "./actions";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, undefined);
  return (
    <div className="auth card">
      <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="sub">
        {mode === "login" ? "Log in to see your upcoming deadlines." : "Alerts are sent to this email. You'll connect your ERP in the next step."}
      </p>
      <form action={action}>
        {state?.error && <div className="msg error" role="alert">{state.error}</div>}
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" defaultValue={state?.values?.email} key={state?.values?.email} />
        </label>
        <label className="field">
          <span>{mode === "login" ? "Password" : "Choose a password for this site"}</span>
          <input type="password" name="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          {mode === "signup" && <div className="hint">At least 8 characters. Please don't reuse your ERP password here.</div>}
        </label>
        <button className="btn block" disabled={pending}>
          {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
      <div className="switch">
        {mode === "login" ? (
          <>New here? <Link href="/signup">Create an account</Link></>
        ) : (
          <>Already have an account? <Link href="/login">Log in</Link></>
        )}
      </div>
    </div>
  );
}
