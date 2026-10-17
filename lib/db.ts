import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: postgres.Sql | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: process.env.VERCEL ? 1 : 5,
    idle_timeout: 20,
    // Neon's pooled endpoint (pgbouncer) does not support prepared statements
    prepare: false,
  });
}

/** Lazily-created shared connection (re-used across hot reloads / invocations). */
export function db(): postgres.Sql {
  if (!globalThis.__sql) globalThis.__sql = create();
  return globalThis.__sql;
}

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  verify_token: string | null;
  alert_days: number[];
  alerts_enabled: boolean;
  include_quizzes: boolean;
  created_at: Date;
};

export type ErpAccountRow = {
  user_id: string;
  erp_username: string;
  erp_password_enc: string;
  student_name: string | null;
  last_sync_at: Date | null;
  last_sync_ok: boolean | null;
  last_error: string | null;
  fail_count: number;
};

export type ItemRow = {
  id: string;
  user_id: string;
  kind: "assignment" | "quiz";
  external_id: string;
  subject_code: string | null;
  subject_name: string;
  title: string;
  opens_at: Date | null;
  due_at: Date;
  completed: boolean;
  note: string | null;
  first_seen_at: Date;
  updated_at: Date;
};
