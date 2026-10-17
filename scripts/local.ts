/**
 * Run the whole app on your own computer with zero setup:
 *   - embedded Postgres (PGlite) stored in ./.local/db
 *   - the website on http://localhost:3000
 *   - an ERP sync + alert pass now and every 3 hours while this window stays open
 *
 *   npm run local        (or double-click start-local.bat on Windows)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const LOCAL = path.join(ROOT, ".local");
const PORT = Number(process.env.PORT || 3000);
const DB_PORT = 54329;
const SYNC_EVERY_MS = 3 * 3600_000;

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 12)) {
  console.error(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org (20.12 or newer).`);
  process.exit(1);
}

// ---- 1. .env with generated secrets (created once, then reused) ----------------
fs.mkdirSync(LOCAL, { recursive: true });
const envPath = path.join(ROOT, ".env");
if (!fs.existsSync(envPath)) {
  const b64 = () => crypto.randomBytes(32).toString("base64");
  fs.writeFileSync(
    envPath,
    [
      "# Created by `npm run local`. Keep this file private; ENCRYPTION_KEY protects the saved ERP passwords.",
      `DATABASE_URL=postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
      `ENCRYPTION_KEY=${b64()}`,
      `CRON_SECRET=${b64()}`,
      `APP_URL=http://localhost:${PORT}`,
      "",
      "# Local mode: no email confirmation needed; emails are saved to .local/outbox (open them in a browser)",
      "SKIP_EMAIL_VERIFICATION=true",
      "MAIL_OUTBOX_DIR=.local/outbox",
      "",
      "# To receive REAL alert emails, fill these in with a Gmail App Password (see README) and restart:",
      "SMTP_HOST=",
      "SMTP_PORT=465",
      "SMTP_USER=",
      "SMTP_PASS=",
      "MAIL_FROM=",
      "",
    ].join("\n"),
  );
  console.log("Created .env with fresh secrets.");
}
process.loadEnvFile(envPath);

// ---- 2. Embedded Postgres ------------------------------------------------------
const { PGlite } = await import("@electric-sql/pglite");
const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
const pg = await PGlite.create(path.join(LOCAL, "db"));
const pgServer = new PGLiteSocketServer({ db: pg, port: DB_PORT, host: "127.0.0.1", maxConnections: 20 });
try {
  await pgServer.start();
} catch (e) {
  console.error(`Couldn't start the local database on port ${DB_PORT}. Is the app already running in another window?`);
  throw e;
}
await pg.exec(fs.readFileSync(path.join(ROOT, "db", "schema.sql"), "utf8"));
console.log("✓ Database ready (.local/db)");

// ---- 3. Build (first run only) and start the website ---------------------------
const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const env: NodeJS.ProcessEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" };
const buildId = path.join(ROOT, ".next", "BUILD_ID");
const stamp = path.join(LOCAL, "built-from");
const srcStamp = String(fs.statSync(path.join(ROOT, "package.json")).mtimeMs) + ":" + latestSourceMtime();
if (!fs.existsSync(buildId) || !fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8") !== srcStamp) {
  console.log("Building the website (first run takes about a minute)…");
  const r = spawnSync(process.execPath, [nextBin, "build"], { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
  fs.writeFileSync(stamp, srcStamp);
}
const web = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], { stdio: ["ignore", "inherit", "inherit"], env });
web.on("exit", (code) => {
  console.log(`Website stopped (code ${code}).`);
  void shutdown();
});

// ---- 4. Periodic sync ----------------------------------------------------------
const { syncAll } = await import("../lib/sync");
let syncing = false;
async function runSync() {
  if (syncing) return;
  syncing = true;
  try {
    const t = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
    const s = await syncAll({ log: (m) => console.log(`  ${m}`) });
    console.log(`[${t}] ERP sync: ${s.synced}/${s.users} accounts OK, ${s.alerts} alert(s) sent`);
  } catch (e) {
    console.error("Sync failed:", e);
  } finally {
    syncing = false;
  }
}
setTimeout(runSync, 60_000);
setInterval(runSync, SYNC_EVERY_MS);

// ---- 5. Open the browser -------------------------------------------------------
const url = `http://localhost:${PORT}`;
setTimeout(() => {
  console.log(`\n  ✓ ERP Reminder is running at ${url}\n    Keep this window open. Close it (or press Ctrl+C) to stop.\n`);
  const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(opener[0] as string, opener[1] as string[], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore */
  }
}, 3000);

async function shutdown() {
  web.kill();
  await pgServer.stop().catch(() => undefined);
  await pg.close().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function latestSourceMtime(): number {
  let max = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else max = Math.max(max, fs.statSync(p).mtimeMs);
    }
  };
  for (const d of ["app", "lib"]) if (fs.existsSync(d)) walk(d);
  return max;
}
