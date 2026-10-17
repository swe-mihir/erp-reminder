-- ERP Reminder schema. Safe to run multiple times.
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  verify_token    TEXT,
  alert_days      INTEGER[] NOT NULL DEFAULT '{3,1}',
  alerts_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  include_quizzes BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS erp_accounts (
  user_id          BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  erp_username     TEXT NOT NULL,
  erp_password_enc TEXT NOT NULL,
  student_name     TEXT,
  last_sync_at     TIMESTAMPTZ,
  last_sync_ok     BOOLEAN,
  last_error       TEXT,
  fail_count       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('assignment','quiz')),
  external_id   TEXT NOT NULL,
  subject_code  TEXT,
  subject_name  TEXT NOT NULL,
  title         TEXT NOT NULL,
  opens_at      TIMESTAMPTZ,
  due_at        TIMESTAMPTZ NOT NULL,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  note          TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, external_id)
);
CREATE INDEX IF NOT EXISTS items_user_due_idx ON items(user_id, due_at);

CREATE TABLE IF NOT EXISTS alerts_sent (
  item_id      BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  days_before  INTEGER NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, days_before)
);
