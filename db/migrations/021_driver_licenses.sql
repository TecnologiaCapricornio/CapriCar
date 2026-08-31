BEGIN;

-- CNH do usuário. Documento pessoal: as imagens NÃO ficam nesta tabela e
-- nunca são servidas por rota estática - ver driver_license_photos abaixo e
-- a rota autorizada em server/routes/users.js.
CREATE TABLE IF NOT EXISTS driver_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  numero VARCHAR(20),
  categoria VARCHAR(8),
  validade DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- As imagens ficam em tabela própria, e não em colunas de driver_licenses,
-- porque a varredura diária de vencimento lê todas as CNHs: manter o data_url
-- (que pode ter ~1 MB por foto) fora da linha principal evita arrastar
-- megabytes numa consulta que só precisa da data de validade.
-- Mesmo formato de operation_photos, para reaproveitar server/photo-storage.js.
CREATE TABLE IF NOT EXISTS driver_license_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES driver_licenses(id) ON DELETE CASCADE,
  lado VARCHAR(6) NOT NULL CHECK (lado IN ('frente', 'verso')),
  storage_key TEXT NOT NULL,
  original_name VARCHAR(255),
  content_type VARCHAR(100),
  file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (license_id, lado)
);

-- A varredura de vencimento filtra por validade; sem índice ela faria
-- sequential scan em toda a tabela a cada execução.
CREATE INDEX IF NOT EXISTS driver_licenses_validade_idx
  ON driver_licenses (validade)
  WHERE validade IS NOT NULL;

COMMIT;
