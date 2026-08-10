BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_view_audit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_manage_rules BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
   SET can_view_audit = TRUE,
       can_manage_rules = TRUE,
       can_manage_users = TRUE
 WHERE role = 'admin';

COMMIT;
