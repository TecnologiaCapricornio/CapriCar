BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(320);

UPDATE users
   SET email = entra_upn
 WHERE email IS NULL
   AND entra_upn IS NOT NULL
   AND auth_provider = 'entra';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (LOWER(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;

COMMIT;
