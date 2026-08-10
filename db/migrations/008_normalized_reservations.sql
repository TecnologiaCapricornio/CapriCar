ALTER TABLE branches ADD COLUMN IF NOT EXISTS legacy_id VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS branches_legacy_id_unique
  ON branches (legacy_id) WHERE legacy_id IS NOT NULL;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS legacy_id VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_legacy_id_unique
  ON vehicles (legacy_id) WHERE legacy_id IS NOT NULL;

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS legacy_id VARCHAR(120);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reservation_number BIGINT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS requester_name VARCHAR(120);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS requester_email VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS confirmed_passenger_count SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS administrative_closed_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS administrative_closed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS administrative_closed_by_name VARCHAR(120);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS administrative_closure_reason TEXT;

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('confirmed', 'in_use', 'completed', 'cancelled', 'administratively_closed'));

CREATE UNIQUE INDEX IF NOT EXISTS reservations_legacy_id_unique
  ON reservations (legacy_id) WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reservations_number_unique
  ON reservations (reservation_number) WHERE reservation_number IS NOT NULL;

ALTER TABLE reservation_passengers ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservation_passengers ADD COLUMN IF NOT EXISTS sort_order SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE operation_photos ADD COLUMN IF NOT EXISTS data_url TEXT;

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_confirmed_passenger_count_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_confirmed_passenger_count_check
  CHECK (confirmed_passenger_count BETWEEN 0 AND 20);
