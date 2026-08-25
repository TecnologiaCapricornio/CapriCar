BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_object_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_upn VARCHAR(320);
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'local'
  CHECK (auth_provider IN ('local', 'entra'));

CREATE UNIQUE INDEX IF NOT EXISTS users_entra_object_id_unique
  ON users (entra_object_id) WHERE entra_object_id IS NOT NULL;

COMMIT;
