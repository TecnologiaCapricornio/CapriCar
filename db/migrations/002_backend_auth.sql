BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_idx
  ON user_sessions (user_id);

CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx
  ON user_sessions (expires_at);

COMMIT;

