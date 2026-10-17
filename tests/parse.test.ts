import { test } from "node:test";
import assert from "node:assert/strict";
import { currentTermId, parseAssessments, parseQuizzes, splitSchedule } from "../lib/erp/parse";
import { parseErpDateTime, parseQuizDateTime } from "../lib/time";
import { planAlerts, buildDigest, type AlertableItem } from "../lib/alerts";

// Samples copied from the real ERP responses (structure preserved, trimmed)
const assessments = [
  { subjectCode: "CSC701", subjectName: "Deep Learning", assessmentName: "Assignments (ContinuousEvaluation)-2", docId: "124002", startTime: "2026-09-01 18:00:00.0", endTime: "2026-09-22 23:55:00.0", subjectCategory: "CORE_SUBJECT", extensionGiven: "", submissionDate: "2026-09-21", subStudId: "1087890", remark: "" },
  { subjectCode: "CSC701", subjectName: "Deep Learning", assessmentName: "Assignments (ContinuousEvaluation)-4", docId: "124004", startTime: "2026-09-23 18:00:00.0", endTime: "2026-10-16 23:55:00.0", subjectCategory: "CORE_SUBJECT", extensionGiven: "", submissionDate: "0", subStudId: "1087890", remark: "" },
  { subjectCode: "X", subjectName: "Major Project", assessmentName: "Report", docId: "9", endTime: "2026-10-30 23:55:00.0", subjectCategory: "PROJECT", submissionDate: "0" },
];

const quizzes = [
  { testQuestioPaperSettingStudentConfigurationId: "1213117", Name: "Quiz for all LOs", SubjectName: "Deep Learning Lab", SubjectShortName: "DL LAB", TestStatus: "end", count: "10", Schedule: "30 Sep, 2026 (12:06 PM)&nbsp;<br/>to<br/> 10 Oct, 2026 (11:55 PM) ", Duration: "60", TotalMarks: "10" },
  { testQuestioPaperSettingStudentConfigurationId: "1203715", Name: "QUIZ 6", SubjectName: "DAV Lab", TestStatus: "", count: "0", Schedule: "24 Apr, 2026 (09:00 AM)&nbsp;<br/>to<br/> 06 May, 2026 (12:00 PM) " },
  { testQuestioPaperSettingStudentConfigurationId: "2000001", Name: "QUIZ 7 MIS", SubjectName: "MIS", TestStatus: "", count: "0", Schedule: "15 Oct, 2026 (03:57 PM)&nbsp;<br/>to<br/> 20 Oct, 2026 (06:00 PM) " },
];

test("IST date parsing", () => {
  assert.equal(parseErpDateTime("2026-10-16 23:55:00.0")?.toISOString(), "2026-10-16T18:25:00.000Z");
  assert.equal(parseQuizDateTime("10 Oct, 2026 (11:55 PM)")?.toISOString(), "2026-10-10T18:25:00.000Z");
  assert.equal(parseQuizDateTime("6 May, 2026 (12:00 PM)")?.toISOString(), "2026-05-06T06:30:00.000Z");
  assert.equal(parseQuizDateTime("06 May, 2026 (12:00 AM)")?.toISOString(), "2026-05-05T18:30:00.000Z");
  assert.equal(parseErpDateTime("garbage"), null);
});

test("schedule split", () => {
  const { from, to } = splitSchedule(quizzes[0].Schedule);
  assert.equal(from?.toISOString(), "2026-09-30T06:36:00.000Z");
  assert.equal(to?.toISOString(), "2026-10-10T18:25:00.000Z");
});

test("current term picks the active one", () => {
  assert.equal(currentTermId([{ semesterId: 6, terms2Status: false }, { semesterId: 7, terms2Status: true }, { semesterId: 5 }]), 7);
  assert.equal(currentTermId([{ semesterId: 2 }, { semesterId: 3 }]), 3);
  assert.equal(currentTermId([]), null);
});

test("assessments → items", () => {
  const items = parseAssessments(assessments);
  assert.equal(items.length, 2, "PROJECT category is skipped");
  assert.equal(items[0].completed, true);
  assert.equal(items[1].completed, false);
  assert.equal(items[1].externalId, "124004:1087890");
  assert.equal(items[1].dueAt.toISOString(), "2026-10-16T18:25:00.000Z");
});

test("quizzes → items (old ones dropped, attempted detection)", () => {
  const items = parseQuizzes(quizzes, new Date("2026-09-01T00:00:00Z"));
  assert.deepEqual(items.map((i) => i.title), ["Quiz for all LOs", "QUIZ 7 MIS"]);
  assert.equal(items[0].completed, true);
  assert.equal(items[1].completed, false);
  assert.equal(items[1].note, null);
});

const mk = (id: string, hoursLeft: number, completed = false, now = new Date("2026-10-17T12:00:00Z")): AlertableItem => ({
  id, kind: "assignment", subject_name: "DL", title: `T${id}`, completed, due_at: new Date(now.getTime() + hoursLeft * 3600_000),
});

test("alert planning", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const items = [mk("1", 100), mk("2", 60), mk("3", 20), mk("4", 10, true), mk("5", -5)];
  const plan = planAlerts(items, [3, 1], new Set(), now);
  assert.deepEqual(plan.map((p) => [p.item.id, p.daysBefore]), [["3", 1], ["2", 3]]);
  assert.deepEqual(plan[0].coversThresholds, [1, 3], "late-discovered item covers bigger thresholds too");

  // after marking sent, nothing fires again
  const sent = new Set(plan.flatMap((p) => p.coversThresholds.map((d) => `${p.item.id}:${d}`)));
  assert.equal(planAlerts(items, [3, 1], sent, now).length, 0);

  // item 2 moves inside the 1-day window → fires again for threshold 1
  const later = new Date(now.getTime() + 40 * 3600_000);
  const plan2 = planAlerts(items, [3, 1], sent, later);
  assert.deepEqual(plan2.map((p) => [p.item.id, p.daysBefore]), [["2", 1], ["1", 3]]);
});

test("digest email", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const plan = planAlerts([mk("1", 20), mk("2", 50)], [3, 1], new Set(), now);
  const mail = buildDigest("a@b.c", plan, now);
  assert.match(mail.subject, /2 deadlines coming up/);
  assert.match(mail.html, /T1/);
  assert.match(mail.text, /T2/);
});
