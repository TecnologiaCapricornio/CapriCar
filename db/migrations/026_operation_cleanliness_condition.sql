BEGIN;

-- Condição de limpeza do veículo, registrada na devolução (retirada não usa
-- esta coluna - fica NULL). Sem valor por padrão de propósito: registros de
-- devolução já existentes, salvos antes deste campo existir, continuam sem
-- essa informação (ver o mesmo raciocínio para "isNewDevolucao" em
-- server/validation.js - só devoluções novas exigem o campo).
ALTER TABLE vehicle_operations
  ADD COLUMN IF NOT EXISTS cleanliness_condition VARCHAR(20);

ALTER TABLE vehicle_operations
  DROP CONSTRAINT IF EXISTS vehicle_operations_cleanliness_condition_check;

ALTER TABLE vehicle_operations
  ADD CONSTRAINT vehicle_operations_cleanliness_condition_check
  CHECK (cleanliness_condition IS NULL OR cleanliness_condition IN ('limpo', 'sujeira_interna', 'sujeira_externa'));

COMMIT;
