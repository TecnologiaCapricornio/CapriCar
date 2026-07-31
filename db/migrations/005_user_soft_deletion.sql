ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason VARCHAR(500);

CREATE INDEX IF NOT EXISTS users_deleted_at_idx
  ON users (deleted_at)
  WHERE deleted_at IS NULL;

