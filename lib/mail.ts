import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";

export type Mail = { to: string; subject: string; html: string; text: string };

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

/** Captured mails when SMTP is not configured (used by tests / local dev). */
export const outbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<void> {
  if (!process.env.SMTP_HOST) {
    outbox.push(mail);
    console.log(`\n[mail:dev] To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
    const dir = process.env.MAIL_OUTBOX_DIR;
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${mail.to.replace(/[^a-z0-9@._-]/gi, "_")}.html`;
      fs.writeFileSync(path.join(dir, name), `<!-- To: ${mail.to} | Subject: ${mail.subject.replace(/-->/g, "")} -->\n${mail.html}`);
      console.log(`[mail:dev] saved to ${path.join(dir, name)}`);
    }
    return;
  }
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function appUrl(path = ""): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "") + path;
}

/** Simple branded wrapper for all emails. */
export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1b16">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-weight:700;font-size:15px;letter-spacing:.02em;color:#b4441c;margin-bottom:12px">ERP Reminder</div>
  <div style="background:#fff;border:1px solid #e4ddd0;border-radius:12px;padding:22px">
    <h1 style="font-size:19px;margin:0 0 14px">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </div>
  <p style="font-size:12px;color:#7a7365;margin-top:14px">You get this because you signed up for deadline alerts. <a href="${appUrl("/dashboard")}" style="color:#7a7365">Change alert settings</a></p>
</div></body></html>`;
}
