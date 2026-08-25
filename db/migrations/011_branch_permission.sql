BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_branches BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users SET can_manage_branches = can_manage_fleet WHERE can_manage_fleet = TRUE;

COMMIT;
