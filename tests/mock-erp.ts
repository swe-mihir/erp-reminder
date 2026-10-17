/**
 * A fake JUNO ERP that mimics the real erp.vcet.edu.in behaviour we rely on:
 *  - Spring Security form login with session-id rotation and 302 redirects
 *  - unauthenticated requests redirected to login.htm
 *  - the three stu_*.json endpoints with the same JSON shapes as the real ERP
 * Deadlines are generated relative to "now" so alerts can be tested.
 *
 *   npm run mock-erp            (listens on :4100)
 */
import http from "node:http";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.MOCK_ERP_PORT || 4100);
const USERS: Record<string, string> = { student1: "pass1", student2: "pass2" };
const sessions = new Map<string, string | null>(); // sid -> username (null = anonymous)
export const hits: string[] = [];

const pad = (n: number) => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Format a Date as IST "YYYY-MM-DD HH:mm:ss.0" */
function istSql(d: Date) {
  const t = new Date(d.getTime() + 5.5 * 3600_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00.0`;
}
/** Format a Date as IST "10 Oct, 2026 (11:55 PM)" */
function istQuiz(d: Date) {
  const t = new Date(d.getTime() + 5.5 * 3600_000);
  const h = t.getUTCHours();
  return `${pad(t.getUTCDate())} ${MON[t.getUTCMonth()]}, ${t.getUTCFullYear()} (${pad(h % 12 || 12)}:${pad(t.getUTCMinutes())} ${h >= 12 ? "PM" : "AM"})`;
}
const inH = (h: number) => new Date(Date.now() + h * 3600_000);

function assessments(user: string) {
  const a = (docId: string, subj: string, code: string, name: string, dueH: number, submitted: boolean) => ({
    subjectCode: code, subjectName: subj, assessmentName: name, fromDate: "", ToDate: "",
    docId, eDocId: "x", startTime: istSql(inH(-200)), endTime: istSql(inH(dueH)), ESSDid: "1", remark: "",
    subjectCategory: "CORE_SUBJECT", ToDateWithTime: "", isStudentRemarkRequired: "0", isExamPaper: "0",
    extensionGiven: "", submissionDate: submitted ? "2026-10-01" : "0", subStudId: user === "student1" ? "111" : "222",
    evaluationParameterName: "Assignments", documentPathId: submitted ? 5 : 0,
  });
  return [
    a("1001", "Deep Learning", "CSC701", "Assignments (ContinuousEvaluation)-4", 20, false),
    a("1002", "Deep Learning Lab", "CSL701", "Experiments (ContinuousEvaluation)-6", 60, false),
    a("1003", "Big Data Analytics", "CSC702", "Assignments (ContinuousEvaluation)-1", 200, false),
    a("1004", "Deep Learning", "CSC701", "Assignments (ContinuousEvaluation)-3", 30, true),
    a("1005", "AI for Healthcare Lab", "CSDOL7012", "Experiments (ContinuousEvaluation)-1", -30, false),
  ];
}

function quizzes(user: string) {
  const q = (id: string, name: string, subj: string, openH: number, closeH: number, attempted: boolean) => ({
    testQuestioPaperSettingStudentConfigurationId: id, Name: name, LevelName: "Easy", Duration: "60",
    StudentId: "21264", StudentFullName: user === "student1" ? "Test Student One" : "Test Student Two",
    SubjectName: subj, SubjectShortName: "SUB", TestType: "COURSE_FILE", TestStatus: attempted ? "end" : "",
    PassingMarks: "4.0", NegativeMarks: "Not Configured!", TotalMarks: "10", count: attempted ? "10" : "0",
    activeTest: false, Schedule: `${istQuiz(inH(openH))}&nbsp;<br/>to<br/> ${istQuiz(inH(closeH))} `,
    countDownTime: istSql(inH(openH)),
  });
  return [
    q("9001", "QUIZ 7 MIS", "Management Information System", -48, 30, false),
    q("9002", "QUIZ 6 MIS", "Management Information System", -100, 40, true),
    q("9003", "Old quiz", "Cryptography", -5000, -4900, false),
  ];
}

const terms = [
  { terms2Name: "SEM VI", terms2Status: false, semesterId: 6 },
  { terms2Name: "SEM VII", terms2Status: true, semesterId: 7 },
];

function sidOf(req: http.IncomingMessage) {
  const m = /JSESSIONID=([^;]+)/.exec(req.headers.cookie || "");
  return m && sessions.has(m[1]) ? m[1] : null;
}
function newSid(res: http.ServerResponse, user: string | null) {
  const sid = crypto.randomBytes(12).toString("hex").toUpperCase();
  sessions.set(sid, user);
  res.setHeader("Set-Cookie", `JSESSIONID=${sid}; Path=/; Secure; HttpOnly`);
  return sid;
}
const redirect = (res: http.ServerResponse, loc: string) => { res.writeHead(302, { Location: loc }); res.end(); };

export function startMockErp(port = PORT) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    hits.push(`${req.method} ${url.pathname}`);
    const sid = sidOf(req);
    const user = sid ? sessions.get(sid) : null;

    if (url.pathname === "/login.htm") {
      if (!sid) newSid(res, null);
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<html><body><form id="form-sign-up" action="j_spring_security_check" method="post"></form>${url.searchParams.has("login_error") ? "Bad credentials" : ""}</body></html>`);
    }
    if (url.pathname === "/j_spring_security_check" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const p = new URLSearchParams(body);
        const u = p.get("j_username") || "";
        if (USERS[u] && USERS[u] === p.get("j_password")) {
          if (sid) sessions.delete(sid);
          newSid(res, u); // session fixation protection: new id after login
          return redirect(res, "home.htm");
        }
        return redirect(res, "login.htm?login_error=1");
      });
      return;
    }
    if (url.pathname === "/logout.json") {
      if (sid) sessions.delete(sid);
      return redirect(res, "login.htm");
    }
    // everything else requires auth
    if (!user) return redirect(res, "/login.htm");
    const json = (data: unknown) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    switch (url.pathname) {
      case "/home.htm":
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<html>Student Home</html>");
      case "/stu_getTermsOfStudentForCourceFile.json":
        return json(terms);
      case "/stu_getStudentAssessmentbyStudentIdAndTermId.json":
        if (url.searchParams.get("termId") !== "7") return json([]);
        return json(assessments(user));
      case "/stu_getOnlineTestDetailsStudentUsingStudentId.json":
        return json(quizzes(user));
      default:
        res.writeHead(404);
        return res.end("not found");
    }
  });
  return new Promise<http.Server>((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startMockErp();
  console.log(`Mock ERP listening on http://localhost:${PORT}  (users: student1/pass1, student2/pass2)`);
}
