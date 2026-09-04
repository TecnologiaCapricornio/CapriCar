BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(40) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  can_manage_reservations BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_branches BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_fleet BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_maintenance BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_blocks BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_reports BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_audit BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_rules BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_users BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deletion_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
  ON users (LOWER(username));

CREATE INDEX IF NOT EXISTS users_deleted_at_idx
  ON users (deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id VARCHAR(120),
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS branches_name_unique
  ON branches (LOWER(name));

CREATE UNIQUE INDEX IF NOT EXISTS branches_legacy_id_unique
  ON branches (legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id VARCHAR(120),
  branch_id UUID NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
  code VARCHAR(40) NOT NULL,
  plate VARCHAR(10),
  brand VARCHAR(120) NOT NULL,
  model VARCHAR(120) NOT NULL,
  -- Teto de 48 pra caber o maior tipo (onibus - ver VEHICLE_CAPACITY_LIMITS
  -- em server/validation.js). A checagem PRECISA por tipo é só na aplicação;
  -- aqui é rede de segurança contra gravação direta na coluna.
  capacity SMALLINT NOT NULL DEFAULT 5
    CHECK (capacity BETWEEN 1 AND 48),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_branch_code_unique
  ON vehicles (branch_id, LOWER(code));

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_unique
  ON vehicles (UPPER(plate))
  WHERE plate IS NOT NULL AND plate <> '';

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_legacy_id_unique
  ON vehicles (legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reservation_rules (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_consecutive_days INTEGER NOT NULL DEFAULT 10
    CHECK (max_consecutive_days > 0),
  max_advance_days INTEGER NOT NULL DEFAULT 30
    CHECK (max_advance_days > 0),
  max_reservations_in_window INTEGER NOT NULL DEFAULT 2
    CHECK (max_reservations_in_window > 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO reservation_rules (
  id,
  max_consecutive_days,
  max_advance_days,
  max_reservations_in_window
) VALUES (1, 10, 30, 2)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id VARCHAR(120) NOT NULL,
  reservation_number BIGINT,
  requester_id UUID NOT NULL REFERENCES users(id),
  requester_name VARCHAR(120) NOT NULL,
  requester_email VARCHAR(160) NOT NULL DEFAULT '',
  responsible_name VARCHAR(120) NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  destination VARCHAR(160) NOT NULL,
  reason TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  confirmed_passenger_count SMALLINT NOT NULL DEFAULT 0
    CHECK (confirmed_passenger_count BETWEEN 0 AND 20),
  status VARCHAR(24) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'in_use', 'completed', 'cancelled', 'administratively_closed')),
  administrative_closed_at TIMESTAMPTZ,
  administrative_closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  administrative_closed_by_name VARCHAR(120),
  administrative_closure_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS reservations_legacy_id_unique
  ON reservations (legacy_id);

CREATE UNIQUE INDEX IF NOT EXISTS reservations_number_unique
  ON reservations (reservation_number)
  WHERE reservation_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS reservations_vehicle_period_idx
  ON reservations (vehicle_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS reservations_requester_period_idx
  ON reservations (requester_id, starts_at);

CREATE INDEX IF NOT EXISTS reservations_status_idx
  ON reservations (status);

CREATE TABLE IF NOT EXISTS reservation_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  passenger_name VARCHAR(120) NOT NULL,
  is_external BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS reservation_passenger_user_unique
  ON reservation_passengers (reservation_id, user_id)
  WHERE user_id IS NOT NULL AND left_at IS NULL;

CREATE TABLE IF NOT EXISTS vehicle_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  block_type VARCHAR(24) NOT NULL
    CHECK (block_type IN ('maintenance', 'inspection', 'documentation', 'unavailable')),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS vehicle_blocks_period_idx
  ON vehicle_blocks (vehicle_id, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS vehicle_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  phase VARCHAR(12) NOT NULL CHECK (phase IN ('pickup', 'return')),
  odometer_km BIGINT NOT NULL CHECK (odometer_km >= 0),
  fuel_level VARCHAR(20) NOT NULL,
  damages_notes TEXT,
  -- Condição de limpeza do veículo, registrada na devolução (retirada não usa
  -- esta coluna - fica NULL).
  cleanliness_condition VARCHAR(20)
    CHECK (cleanliness_condition IS NULL OR cleanliness_condition IN ('limpo', 'sujeira_interna', 'sujeira_externa')),
  recorded_by UUID NOT NULL REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reservation_id, phase)
);

CREATE INDEX IF NOT EXISTS vehicle_operations_recorded_at_idx
  ON vehicle_operations (recorded_at);

CREATE TABLE IF NOT EXISTS operation_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES vehicle_operations(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  original_name VARCHAR(255),
  content_type VARCHAR(100),
  file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  data_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
  ON audit_logs (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  reservation_id TEXT,
  dedupe_key VARCHAR(240) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dedupe_key)
);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS brand VARCHAR(120);

UPDATE vehicles
   SET brand = SPLIT_PART(BTRIM(model), ' ', 1),
       model = CASE
         WHEN POSITION(' ' IN BTRIM(model)) > 0
           THEN SUBSTRING(BTRIM(model) FROM POSITION(' ' IN BTRIM(model)) + 1)
         ELSE model
       END
 WHERE brand IS NULL OR BTRIM(brand) = '';

ALTER TABLE vehicles ALTER COLUMN brand SET NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reservation_number_counter (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

INSERT INTO reservation_number_counter (id, last_number)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS branches_set_updated_at ON branches;
CREATE TRIGGER branches_set_updated_at
BEFORE UPDATE ON branches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS vehicles_set_updated_at ON vehicles;
CREATE TRIGGER vehicles_set_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reservations_set_updated_at ON reservations;
CREATE TRIGGER reservations_set_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
