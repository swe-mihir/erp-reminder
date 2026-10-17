import "./env";
import { db } from "../lib/db";
import { syncAll } from "../lib/sync";

// Runs the full sync + alert pass for every connected student.
// Scheduled by .github/workflows/sync.yml
const summary = await syncAll();
console.log("Sync finished:", JSON.stringify(summary));
await db().end();
if (summary.users > 0 && summary.synced === 0) process.exitCode = 1; // surface total outages in CI
