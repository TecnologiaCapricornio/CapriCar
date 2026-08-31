BEGIN;

-- Centro de custo do usuário. Já existe preenchido no cadastro do Entra ID
-- (normalmente no atributo "department"), então a importação passa a trazê-lo
-- - ver o atributo configurável em Integrações > Login via Microsoft.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cost_center VARCHAR(60);

COMMIT;
