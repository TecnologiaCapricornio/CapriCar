CREATE TABLE IF NOT EXISTS application_state (
  collection_name VARCHAR(40) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS application_state_updated_at_idx
  ON application_state (updated_at DESC);
