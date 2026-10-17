import Link from "next/link";
import { logoutAction } from "./actions";

export default function Topbar({ email, name }: { email?: string; name?: string | null }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>⏰</span>
          ERP Reminder
        </Link>
        <div className="topbar-right">
          {email ? (
            <>
              <span className="who">{name || email}</span>
              <form action={logoutAction}>
                <button className="btn ghost small" type="submit">Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn ghost small">Log in</Link>
              <Link href="/signup" className="btn small">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
