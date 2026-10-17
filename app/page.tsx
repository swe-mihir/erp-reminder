import Link from "next/link";
import { currentUser } from "@/lib/auth";
import Topbar from "./Topbar";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await currentUser();
  const { deleted } = await searchParams;
  return (
    <>
      <Topbar email={user?.email} />
      <main className="wrap">
        {deleted && <div className="banner ok">Your account and all saved data have been deleted.</div>}
        <section className="hero">
          <div>
            <h1>
              Never miss an <em>ERP deadline</em> again.
            </h1>
            <p className="lead">
              The VCET ERP lists your assignments, experiments and quizzes but never reminds you. Connect your ERP account
              once, and we'll email you a few days before anything is due.
            </p>
            <div className="cta">
              {user ? (
                <Link href="/dashboard" className="btn">Go to dashboard →</Link>
              ) : (
                <>
                  <Link href="/signup" className="btn">Create free account</Link>
                  <Link href="/login" className="btn ghost">Log in</Link>
                </>
              )}
            </div>
          </div>
          <div className="mock-mail" aria-hidden>
            <div className="from">ERP Reminder · 7:00 PM</div>
            <div className="subj">⏰ 2 deadlines coming up, the first is due in 23 hrs</div>
            <div className="mock-row">
              <div className="k">Assignment · Deep Learning</div>
              <div className="t">Assignments (ContinuousEvaluation)-4</div>
              <div className="k" style={{ textTransform: "none", letterSpacing: 0, color: "var(--red)" }}>Due Fri, 16 Oct, 11:55 pm</div>
            </div>
            <div className="mock-row">
              <div className="k">Quiz · Management Information System</div>
              <div className="t">QUIZ 6 MIS</div>
              <div className="k" style={{ textTransform: "none", letterSpacing: 0, color: "var(--amber)" }}>Closes Sun, 18 Oct, 6:00 pm</div>
            </div>
          </div>
        </section>

        <section className="steps">
          <div className="card step">
            <div className="n">1</div>
            <h3>Sign up</h3>
            <p>Create an account with the email address you want alerts sent to.</p>
          </div>
          <div className="card step">
            <div className="n">2</div>
            <h3>Connect your ERP</h3>
            <p>Enter your erp.vcet.edu.in login. We check it once and store it encrypted.</p>
          </div>
          <div className="card step">
            <div className="n">3</div>
            <h3>Get reminded</h3>
            <p>We check your ERP several times a day and email you 1, 2, 3 or 7 days before each deadline, whichever you choose.</p>
          </div>
        </section>

        <p className="fineprint">
          An unofficial student project, not affiliated with VCET or JUNO Campus. Your ERP password is encrypted (AES-256)
          and used only to read your assignment and quiz lists. Delete your account at any time and everything is erased.
        </p>
      </main>
    </>
  );
}
