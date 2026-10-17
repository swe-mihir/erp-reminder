import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type http from "node:http";
import { startMockErp } from "./mock-erp";
import { ErpAuthError, ErpClient } from "../lib/erp/client";
import { fetchStudentItems } from "../lib/erp/parse";

let server: http.Server;
const BASE = "http://localhost:4199";
before(async () => { server = await startMockErp(4199); });
after(() => server.close());

test("login + fetch items from (mock) ERP", async () => {
  const c = new ErpClient(BASE);
  await c.login("student1", "pass1");
  const { termId, items, studentName } = await fetchStudentItems(c);
  await c.logout();
  assert.equal(termId, 7);
  assert.equal(studentName, "Test Student One");
  assert.equal(items.filter((i) => i.kind === "assignment").length, 5);
  assert.equal(items.filter((i) => i.kind === "quiz").length, 2, "very old quiz dropped");
  assert.equal(items.filter((i) => !i.completed && i.dueAt > new Date()).length, 4);
});

test("wrong password raises ErpAuthError", async () => {
  await assert.rejects(new ErpClient(BASE).login("student1", "nope"), ErpAuthError);
});

test("unauthenticated data call raises ErpAuthError", async () => {
  await assert.rejects(new ErpClient(BASE).getJson("stu_getTermsOfStudentForCourceFile.json"), ErpAuthError);
});
