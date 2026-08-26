BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_manage_integrations BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
   SET can_manage_integrations = TRUE
 WHERE role = 'admin';

COMMIT;
