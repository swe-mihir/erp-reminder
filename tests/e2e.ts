/**
 * End-to-end browser test. Needs: the app running on APP (built with `next start`),
 * the mock ERP on :4100, and the same DATABASE_URL in .env.
 *   npx tsx tests/e2e.ts [screenshotDir]
 */
import "../scripts/env";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { db } from "../lib/db";

const APP = process.env.APP_URL || "http://localhost:3100";
const shots = process.argv[2] || ".";
const email = `e2e${Date.now()}@vcet.edu.in`;
const sql = db();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const step = (s: string) => console.log("•", s);

step("landing");
await page.goto(APP);
await page.screenshot({ path: `${shots}/1-landing.png`, fullPage: true });

step("sign up");
await page.click("text=Create free account");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "supersecret1");
await page.click('button:has-text("Create account")');
await page.waitForURL("**/dashboard");
assert.ok(await page.isVisible("text=Confirm your email"));

step("connect ERP: wrong password");
await page.fill('input[name="erp_username"]', "student1");
await page.fill('input[name="erp_password"]', "wrong");
await page.click('button:has-text("Connect ERP account")');
await page.waitForSelector(".msg.error");
assert.match((await page.textContent(".msg.error"))!, /rejected/);

step("connect ERP: correct password");
await page.fill('input[name="erp_password"]', "pass1");
await page.click('button:has-text("Connect ERP account")');
await page.waitForSelector(".dash", { timeout: 20000 });
const [acct] = await sql`SELECT a.* FROM erp_accounts a JOIN users u ON u.id=a.user_id WHERE u.email=${email}`;
assert.ok(acct.erp_password_enc.startsWith("v1:") && !acct.erp_password_enc.includes("pass1"), "password stored encrypted");
const [{ n }] = await sql`SELECT count(*)::int n FROM items i JOIN users u ON u.id=i.user_id WHERE u.email=${email}`;
assert.equal(n, 7);

step("no alerts before email is verified");
const [{ a0 }] = await sql`SELECT count(*)::int a0 FROM alerts_sent s JOIN items i ON i.id=s.item_id JOIN users u ON u.id=i.user_id WHERE u.email=${email}`;
assert.equal(a0, 0);

step("verify email → alerts sent");
const [u] = await sql`SELECT * FROM users WHERE email=${email}`;
await page.goto(`${APP}/verify?token=${u.verify_token}`);
await page.waitForSelector("text=Email confirmed");
const sent = await sql`SELECT i.title, s.days_before FROM alerts_sent s JOIN items i ON i.id=s.item_id WHERE i.user_id=${u.id} ORDER BY i.due_at, s.days_before`;
console.log("  alerts recorded:", sent.map((r) => `${r.title}@${r.days_before}d`).join(", "));
// defaults [3,1]: assignment due 20h (1d, covers 3d), quiz closing 30h (3d), experiment due 60h (3d)
assert.equal(sent.length, 4);

step("dashboard filters");
const upcoming = await page.locator(".item").count();
assert.equal(upcoming, 4);
await page.click('.seg button:has-text("Overdue")');
assert.equal(await page.locator(".item").count(), 1);
await page.click('.seg button:has-text("Done")');
assert.equal(await page.locator(".item").count(), 2);
await page.click('.seg button:has-text("Upcoming")');
await page.click('.seg button:has-text("Quizzes")');
assert.equal(await page.locator(".item").count(), 1);
await page.click('.seg button:has-text("All")');
await page.screenshot({ path: `${shots}/2-dashboard.png`, fullPage: true });

step("settings save");
await page.check('input[name="alert_days"][value="7"]');
await page.click('button:has-text("Save")');
await page.waitForSelector(".msg.ok");
const [u2] = await sql`SELECT alert_days FROM users WHERE id=${u.id}`;
assert.deepEqual(u2.alert_days, [7, 3, 1]);

step("sync now");
await sql`UPDATE erp_accounts SET last_sync_at = now() - interval '1 hour' WHERE user_id=${u.id}`;
await page.click('button:has-text("Sync now")');
await page.waitForSelector("text=Synced 7 items");

step("mobile layout");
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: `${shots}/3-mobile.png`, fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
assert.equal(overflow, false, "no horizontal scroll on mobile");

step("cron endpoint auth");
assert.equal((await fetch(`${APP}/api/cron`)).status, 401);
const cron = await fetch(`${APP}/api/cron`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
assert.equal(cron.status, 200);
console.log("  cron:", await cron.text());

step("delete account");
await page.setViewportSize({ width: 1280, height: 900 });
await page.click("summary:has-text('Delete account')");
await page.fill('input[name="confirm"]', "delete");
await page.click('button:has-text("Delete my account")');
await page.waitForSelector("text=have been deleted");
const left = await sql`SELECT 1 FROM users WHERE email=${email}`;
assert.equal(left.length, 0);

await browser.close();
await sql.end();
console.log("\nE2E PASSED");
