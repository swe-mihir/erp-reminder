# ERP Reminder

Web app that emails VCET students before their ERP (erp.vcet.edu.in, JUNO Campus) assignments and quizzes are due. Students sign up, save their ERP login (encrypted), and a scheduled job scrapes the ERP and sends digest emails *n* days before each deadline.

## Commands
- `npm run local`: run everything on this PC (embedded PGlite DB in `.local/`, site on :3000, sync every 3h). On Windows, `start-local.bat` does install + run.
- `npm run dev`: Next.js dev server (needs `.env`; see `.env.example`)
- `npm test`: unit tests + ERP client tests against the mock ERP (`node:test` via tsx)
- `npm run mock-erp`: fake ERP on :4100 (users `student1`/`pass1`, `student2`/`pass2`); set `ERP_BASE_URL=http://localhost:4100`
- `npm run erp:test`: try the scraper against the REAL ERP with your own login (prints pending deadlines, saves nothing)
- `npm run sync`: one sync + alert pass for all users (what GitHub Actions runs)
- `npx tsx tests/e2e.ts <screenshotDir>`: Playwright browser E2E. Needs the app on `APP_URL`, the mock ERP, and the same DB
- `npx tsc --noEmit`: type check

## Stack and layout
Next.js 15 App Router + server actions, React 19, TypeScript, Postgres through the `postgres` driver with plain SQL (no ORM), nodemailer SMTP, bcryptjs. Hand-rolled sessions (random token in the `sessions` table, httpOnly cookie).
- `app/`: pages (`/`, `/signup`, `/login`, `/dashboard`), `actions.ts` (all server actions), `verify/route.ts`, `api/cron/route.ts` (Bearer `CRON_SECRET`)
- `lib/erp/client.ts`: ERP HTTP client (cookie jar, manual redirects)
- `lib/erp/parse.ts`: raw ERP JSON → `ErpItem`
- `lib/sync.ts`: syncUser / saveItems / sendDueAlerts / syncAll
- `lib/alerts.ts`: `planAlerts` (pure) + digest email
- `lib/crypto.ts`: AES-256-GCM for ERP passwords (`ENCRYPTION_KEY`, 32 bytes base64). Never change the key once users exist.
- `db/schema.sql`: idempotent schema (users, sessions, erp_accounts, items, alerts_sent)
- `scripts/local.ts`: local launcher; `.github/workflows/sync.yml`: cron at 07:00–22:00 IST every 3h

## How the real ERP works (discovered by inspecting a logged-in session)
- Login: `GET /login.htm` (sets JSESSIONID), then `POST /j_spring_security_check` with `j_username`, `j_password` (form-urlencoded, no captcha, no JS hashing). Spring Security: a 302 to home.htm on success, back to login on failure. The session id rotates on login. Redirect targets may be `http://`; the client upgrades same-host http→https and doesn't follow login redirects blindly.
- Unauthenticated `stu_*.json` calls → a 302 to login (treated as `ErpAuthError`).
- `GET /stu_getTermsOfStudentForCourceFile.json` → array of terms; the current one has `terms2Status: true` (`semesterId`).
- `GET /stu_getStudentAssessmentbyStudentIdAndTermId.json?termId=<id>&SubjectwiseStudentId=undefined` → assignments/experiments: `subjectCode, subjectName, assessmentName, docId, subStudId, startTime, endTime` ("2026-10-16 23:55:00.0", IST, no offset), `submissionDate` ("0" = not submitted), `extensionGiven`, `subjectCategory` (skip "PROJECT", like the ERP UI does).
- `GET /stu_getOnlineTestDetailsStudentUsingStudentId.json` → all quizzes ever (~240): `testQuestioPaperSettingStudentConfigurationId` (id), `Name, SubjectName, SubjectShortName, TestStatus` ("end" = attempted), `count` (>0 = attempted), `Schedule` ("30 Sep, 2026 (12:06 PM)&nbsp;<br/>to<br/> 10 Oct, 2026 (11:55 PM) "). Only quizzes closed within the last 45 days are kept.
- `GET /logout.json` ends the session.
- The dashboard "Task" tray (`stu_getStudentJobTrayAlerts.json`) has no deadlines, so it isn't used.
- All ERP times are IST (Asia/Kolkata); parse with `lib/time.ts`.

## Behaviour rules
- Alert thresholds are per-user `alert_days` (e.g. {3,1}). Each (item, threshold) fires once; a late-discovered item fires only its smallest matching threshold and marks the larger ones covered. Completed items never alert. One digest email per user per run.
- No alerts until the email is verified (except `SKIP_EMAIL_VERIFICATION=true`, local mode).
- After `MAX_AUTH_FAILURES` (3) consecutive wrong-password syncs, stop syncing that account (avoids ERP lockouts) and pause its alerts; the user gets one email on the first failure.
- No SMTP configured → emails print to the console, plus HTML files in `MAIL_OUTBOX_DIR` if set.

## Gotchas
- React 19 resets uncontrolled form fields after a server action, so actions return `values` and inputs use `defaultValue` + `key` to keep what the user typed.
- Neon's pooled endpoint needs `prepare: false` (already set in `lib/db.ts`).
- When changing ERP parsing, update `tests/mock-erp.ts` to match and keep `npm test` green.
