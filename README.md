# ERP Reminder (VCET)

Email alerts *n* days before VCET ERP (erp.vcet.edu.in, JUNO Campus) assignments, experiments and online quizzes are due.

Students sign up with their email, connect their ERP login once, and get:

- **Dashboard** of upcoming, overdue and completed assignments and quizzes, with what's due in 24 hours and this week
- **Email digests** 7, 5, 3, 2 or 1 day before each deadline (each student picks)
- An email if their saved ERP password stops working

## How it works

```
GitHub Actions (6× a day, 7am–10pm IST)
   └─ npm run sync ─► for each student:
         log into ERP (POST /j_spring_security_check)
         GET stu_getTermsOfStudentForCourceFile.json           → current semester
         GET stu_getStudentAssessmentbyStudentIdAndTermId.json  → assignments + due time + submitted?
         GET stu_getOnlineTestDetailsStudentUsingStudentId.json → quizzes + window + attempted?
         save to Postgres ─► send one digest email for anything newly inside the alert window
Next.js website (Vercel)  ─► sign up / log in / connect ERP / dashboard / settings
```

Each alert threshold fires only once per item. If an item is first seen late (say 20 hours before it's due, with thresholds 3 and 1), only the 1-day alert is sent. Submitted assignments and attempted quizzes never trigger alerts.

**Security:** ERP passwords are encrypted with AES-256-GCM using `ENCRYPTION_KEY`, which lives only in Vercel and GitHub secrets, never in the database. Site passwords are bcrypt-hashed. After 3 failed ERP logins in a row, an account stops syncing so the app never causes an ERP lockout. "Delete account" erases everything.

## Tech

Next.js 15 (App Router, server actions) · Postgres (`postgres` driver, plain SQL) · nodemailer (SMTP) · TypeScript. No ORM and no auth library: sessions are random tokens in the `sessions` table.

```
app/            pages, server actions, /verify, /api/cron
lib/erp/        ERP HTTP client + JSON parsers   ← adjust here if the ERP changes
lib/sync.ts     sync + alert pipeline
lib/alerts.ts   alert planning + email template
db/schema.sql   database schema
scripts/        migrate, sync (cron), erp-test (manual check)
tests/          unit tests, mock ERP server, browser end-to-end test
```

---

## Run it on your own PC (quickest way to try it)

1. Install **Node.js LTS** from nodejs.org, if you don't have it already.
2. Double-click **`start-local.bat`**. On Mac or Linux, run `npm install` and then `npm run local`.
   - The first run installs packages and builds the site, which takes a few minutes.
   - Your browser opens http://localhost:3000.
3. Sign up (no email confirmation is needed in local mode), then connect your ERP account.

While the window stays open, the app checks the ERP every 3 hours. Alert emails are saved as files in `.local\outbox\`, and you can double-click one to view it. To get **real emails**, put a Gmail App Password in the `SMTP_*` lines of `.env` (see step 1 of "Deploy" below) and restart.

Data is stored in `.local\db`. Delete the `.local` folder to start fresh.

> Local mode only sends alerts while your PC is on and the window is open. For alerts around the clock, and so other students can sign up, deploy it as described below.

---

## Deploy (free, about 30 minutes)

You need free accounts on **GitHub**, **Neon** (database) and **Vercel** (hosting), plus a **Gmail** account to send from.

### 1. Gmail app password (for sending emails)
1. Use a Gmail account for the app (for example, a new `vcet.erp.reminder@gmail.com`).
2. Turn on 2-Step Verification: myaccount.google.com → Security.
3. Go to myaccount.google.com/apppasswords, create one named "ERP Reminder", and copy the 16-character password.

Gmail allows about 500 emails a day, which covers hundreds of students on a digest model. For more, switch the SMTP settings to Brevo or Resend.

### 2. Database (Neon)
1. Go to neon.tech → New project (region: **AWS Asia Pacific (Singapore)** or Mumbai, if offered).
2. Open **SQL Editor**, paste all of `db/schema.sql`, and click Run.
3. Under **Connection string**, select "Pooled connection" and copy it. This is your `DATABASE_URL`.

### 3. Generate secrets
Run this twice, once for `ENCRYPTION_KEY` and once for `CRON_SECRET`. Any terminal with Node works:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
⚠️ Keep `ENCRYPTION_KEY` safe and never change it. If you lose it, every student has to reconnect their ERP account.

### 4. Put the code on GitHub
Create a **private** repo and push this folder to it.

### 5. Website (Vercel)
1. vercel.com → Add New → Project → import the repo. The framework is detected as Next.js.
2. Add these Environment Variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `ENCRYPTION_KEY` | from step 3 |
| `CRON_SECRET` | from step 3 |
| `APP_URL` | `https://<your-project>.vercel.app` (fill in after the first deploy, then redeploy) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | the 16-character app password |
| `MAIL_FROM` | `ERP Reminder <your Gmail address>` |
| `ALLOWED_EMAIL_DOMAINS` | *(optional)* e.g. `vcet.edu.in` to limit sign-ups to college emails |

3. Deploy, then copy the URL into `APP_URL` and redeploy.

### 6. Scheduled sync (GitHub Actions)
In the GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add `DATABASE_URL`, `ENCRYPTION_KEY`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`, with the same values as above.

The workflow in `.github/workflows/sync.yml` runs at 7:00, 10:00, 13:00, 16:00, 19:00 and 22:00 IST. To test it now, go to **Actions → "Sync ERP & send alerts" → Run workflow**.

> GitHub may delay scheduled runs by a few minutes, and pauses schedules on repos with no commits for 60 days. Push any small commit to resume them.
> Alternative trigger: point a free cron service (cron-job.org) at `GET https://<app>/api/cron` with header `Authorization: Bearer <CRON_SECRET>`.

### 7. Try it
Open the site, sign up, click the confirmation link in your email, and connect your ERP account. Your deadlines appear right away, and an alert email arrives if anything is due within your chosen window.

---

## Local development

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL + ENCRYPTION_KEY (leave SMTP_HOST empty → emails print to console)
npm run db:migrate
npm run dev                   # http://localhost:3000

npm run erp:test              # check the scraper against the real ERP with your own login (nothing is saved)
npm run sync                  # run one sync + alert pass manually
npm test                      # unit tests + ERP client tests against the mock ERP
```

To try everything without touching the real ERP, run `npm run mock-erp` (users `student1`/`pass1` and `student2`/`pass2`) and set `ERP_BASE_URL=http://localhost:4100`.

## If the ERP changes

All ERP-specific logic is in `lib/erp/`. If syncs start failing for everyone, log into the ERP in Chrome, open DevTools → Network, visit **Academic Functions → Course File → Assessments** and **Online Assessment**, and compare the JSON responses with the types in `lib/erp/parse.ts`.

## Good to know

- This is an unofficial tool. It's worth getting an OK from the college IT department before inviting other students, because the app stores their ERP passwords.
- If students report being logged out of the ERP around sync times (7, 10, 1, 4, 7 and 10 o'clock), the ERP allows only one session per student. Reduce the sync frequency in `sync.yml`.
