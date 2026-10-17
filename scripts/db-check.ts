/**
 * Check that DATABASE_URL points at a database with the app's schema applied.
 *   npx tsx scripts/db-check.ts            (reads DATABASE_URL from env or .env)
 *   npx tsx scripts/db-check.ts .env.neon  (reads it from another env file)
 * Read-only: prints server info, tables, columns and row counts.
 */
import fs from "node:fs";
import postgres from "postgres";

const envFile = process.argv[2] || ".env";
if (!process.env.DATABASE_URL && fs.existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`DATABASE_URL not set (looked in env and ${envFile}).`);
  process.exit(1);
}

const EXPECTED = ["users", "sessions", "erp_accounts", "items", "alerts_sent"];

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
try {
  const [info] = await sql`select current_database() as db, current_user as "user", version() as version`;
  console.log(`✓ Connected to "${info.db}" as ${info.user}`);
  console.log(`  ${String(info.version).split(",")[0]}`);
  console.log(`  Host: ${new URL(url).hostname}${new URL(url).hostname.includes("-pooler") ? "  (pooled ✓)" : "  (NOT the pooled endpoint)"}`);

  const tables = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
  const have = new Set(tables.map((t) => t.table_name as string));
  let ok = true;
  console.log("\nTables:");
  for (const t of EXPECTED) {
    if (!have.has(t)) {
      console.log(`  ✗ ${t}  MISSING`);
      ok = false;
      continue;
    }
    const cols = await sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${t} order by ordinal_position`;
    const [{ n }] = await sql`select count(*)::int as n from ${sql(t)}`;
    console.log(`  ✓ ${t.padEnd(13)} ${String(n).padStart(4)} rows   (${cols.map((c) => c.column_name).join(", ")})`);
  }
  const indexes = await sql`select indexname from pg_indexes where schemaname = 'public' and indexname in ('sessions_user_idx', 'items_user_due_idx')`;
  console.log(`\nIndexes: ${indexes.map((i) => i.indexname).join(", ") || "none"}${indexes.length === 2 ? "  ✓" : "  ✗ expected sessions_user_idx, items_user_due_idx"}`);
  if (indexes.length !== 2) ok = false;
  console.log(ok ? "\n✓ Schema looks complete." : "\n✗ Schema incomplete: run all of db/schema.sql in the Neon SQL Editor (it's safe to re-run).");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error("✗ Couldn't query the database:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
