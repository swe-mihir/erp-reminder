import { parseErpDateTime, parseQuizDateTime } from "../time";

/** Normalised deadline item stored in our DB. */
export type ErpItem = {
  kind: "assignment" | "quiz";
  externalId: string;
  subjectCode: string | null;
  subjectName: string;
  title: string;
  opensAt: Date | null;
  dueAt: Date;
  completed: boolean;
  note: string | null;
};

// ---- Raw ERP shapes (only the fields we use) ---------------------------------

export type RawTerm = {
  terms2Name?: string;
  terms2Status?: boolean;
  semesterId?: number;
};

/** stu_getStudentAssessmentbyStudentIdAndTermId.json */
export type RawAssessment = {
  subjectCode?: string;
  subjectName?: string;
  assessmentName?: string;
  docId?: string;
  startTime?: string; // "2026-09-01 18:00:00.0" (IST)
  endTime?: string; // "2026-09-21 23:55:00.0" (IST)
  subjectCategory?: string;
  extensionGiven?: string;
  submissionDate?: string; // "0" when not submitted
  subStudId?: string;
  remark?: string;
};

/** stu_getOnlineTestDetailsStudentUsingStudentId.json */
export type RawQuiz = {
  testQuestioPaperSettingStudentConfigurationId?: string;
  Name?: string;
  SubjectName?: string;
  SubjectShortName?: string;
  TestStatus?: string; // "end" when attempted, "" otherwise
  count?: string; // > 0 when answers were recorded
  Schedule?: string; // "30 Sep, 2026 (12:06 PM)&nbsp;<br/>to<br/> 10 Oct, 2026 (11:55 PM) "
  Duration?: string;
  TotalMarks?: string;
  StudentFullName?: string;
};

// ---- Parsers -------------------------------------------------------------------

/** Pick the current semester: the one flagged active, else the highest id. */
export function currentTermId(terms: RawTerm[]): number | null {
  if (!Array.isArray(terms) || terms.length === 0) return null;
  const active = terms.find((t) => t.terms2Status === true && typeof t.semesterId === "number");
  if (active) return active.semesterId!;
  const ids = terms.map((t) => t.semesterId).filter((n): n is number => typeof n === "number");
  return ids.length ? Math.max(...ids) : null;
}

export function parseAssessments(raw: RawAssessment[]): ErpItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ErpItem[] = [];
  for (const a of raw) {
    if (a.subjectCategory === "PROJECT") continue; // the ERP page hides these too
    const due = parseErpDateTime(a.endTime);
    if (!due || !a.docId) continue;
    const ext = (a.extensionGiven || "").trim();
    const remark = (a.remark || "").trim();
    out.push({
      kind: "assignment",
      externalId: `${a.docId}:${a.subStudId ?? ""}`,
      subjectCode: a.subjectCode?.trim() || null,
      subjectName: a.subjectName?.trim() || "Unknown subject",
      title: a.assessmentName?.trim() || "Assignment",
      opensAt: parseErpDateTime(a.startTime),
      dueAt: due,
      completed: !!a.submissionDate && a.submissionDate !== "0",
      note: [ext && `Extension: ${ext}`, remark && `Remark: ${remark}`].filter(Boolean).join(" · ") || null,
    });
  }
  return out;
}

export function splitSchedule(schedule: string): { from: Date | null; to: Date | null } {
  const clean = schedule.replace(/&nbsp;/g, " ").replace(/<br\s*\/?>/gi, " ");
  const parts = clean.split(/\bto\b/i);
  return {
    from: parts[0] ? parseQuizDateTime(parts[0]) : null,
    to: parts[1] ? parseQuizDateTime(parts[1]) : null,
  };
}

/**
 * @param keepAfter quizzes that closed before this date are dropped (the ERP returns years of history)
 */
export function parseQuizzes(raw: RawQuiz[], keepAfter: Date): ErpItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ErpItem[] = [];
  for (const q of raw) {
    const id = q.testQuestioPaperSettingStudentConfigurationId;
    if (!id || !q.Schedule) continue;
    const { from, to } = splitSchedule(q.Schedule);
    if (!to || to < keepAfter) continue;
    const attempted = (q.TestStatus ?? "") !== "" || Number(q.count ?? 0) > 0;
    const meta = [q.Duration && `${q.Duration} min`, q.TotalMarks && `${q.TotalMarks} marks`].filter(Boolean).join(" · ");
    out.push({
      kind: "quiz",
      externalId: id,
      subjectCode: q.SubjectShortName?.trim() || null,
      subjectName: q.SubjectName?.trim() || "Unknown subject",
      title: q.Name?.trim() || "Quiz",
      opensAt: from,
      dueAt: to,
      completed: attempted,
      note: meta || null,
    });
  }
  return out;
}

// ---- High-level fetch ----------------------------------------------------------

import type { ErpClient } from "./client";

export async function fetchStudentItems(client: ErpClient, now = new Date()) {
  const terms = await client.getJson<RawTerm[]>("stu_getTermsOfStudentForCourceFile.json");
  const termId = currentTermId(terms);

  let assignments: ErpItem[] = [];
  if (termId != null) {
    const raw = await client.getJson<RawAssessment[]>(
      `stu_getStudentAssessmentbyStudentIdAndTermId.json?termId=${termId}&SubjectwiseStudentId=undefined`,
    );
    assignments = parseAssessments(raw);
  }

  const rawQuizzes = await client.getJson<RawQuiz[] | RawQuiz[][]>("stu_getOnlineTestDetailsStudentUsingStudentId.json");
  const flat: RawQuiz[] = Array.isArray(rawQuizzes) && Array.isArray(rawQuizzes[0]) ? (rawQuizzes[0] as RawQuiz[]) : (rawQuizzes as RawQuiz[]);
  const keepAfter = new Date(now.getTime() - 45 * 24 * 3600 * 1000);
  const quizzes = parseQuizzes(flat, keepAfter);

  const studentName = flat.find((q) => q.StudentFullName)?.StudentFullName?.trim() ?? null;
  return { termId, items: [...assignments, ...quizzes], studentName };
}
