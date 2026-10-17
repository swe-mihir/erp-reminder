import "./env";
import { createInterface } from "node:readline/promises";
import { ErpClient } from "../lib/erp/client";
import { fetchStudentItems } from "../lib/erp/parse";
import { formatIST } from "../lib/time";

// Quick manual check that the scraper works with YOUR ERP login. Nothing is saved.
//   npm run erp:test
const rl = createInterface({ input: process.stdin, output: process.stdout });
const username = process.env.ERP_USER || (await rl.question("ERP username: "));
const password = process.env.ERP_PASS || (await rl.question("ERP password (visible): "));
rl.close();

const client = new ErpClient();
try {
  await client.login(username, password);
  console.log("✓ Logged in");
  const { termId, items, studentName } = await fetchStudentItems(client);
  console.log(`✓ Student: ${studentName ?? "?"}  current term id: ${termId}`);
  const now = new Date();
  const pending = items.filter((i) => !i.completed && i.dueAt > now).sort((a, b) => +a.dueAt - +b.dueAt);
  console.log(`✓ ${items.length} items (${items.filter((i) => i.kind === "assignment").length} assignments, ${items.filter((i) => i.kind === "quiz").length} recent quizzes)`);
  console.log(`\nPending (${pending.length}):`);
  for (const i of pending) console.log(`  ${formatIST(i.dueAt).padEnd(26)} [${i.kind}] ${i.subjectName}: ${i.title}`);
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.logout();
}
