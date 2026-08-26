BEGIN;

CREATE TABLE IF NOT EXISTS email_reminder_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_type VARCHAR(40) NOT NULL,
  reservation_id TEXT NOT NULL,
  dedupe_key VARCHAR(240) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS email_reminder_log_sent_at_idx ON email_reminder_log (sent_at DESC);

COMMIT;
