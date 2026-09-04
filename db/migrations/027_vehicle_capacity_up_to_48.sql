BEGIN;

-- A migration 022 introduziu o tipo "onibus" (até 48 lugares - ver
-- VEHICLE_CAPACITY_LIMITS em server/validation.js e SEAT_LAYOUTS em
-- js/seat-map.js), mas esqueceu de atualizar este teto: a coluna ainda
-- recusava qualquer capacidade acima de 20, mesmo já validada e aceita pela
-- aplicação. A checagem PRECISA por tipo (carro:8, van:20, onibus:48)
-- continua só na aplicação - aqui é só o teto externo, uma rede de segurança
-- caso algo grave direto na coluna sem passar por ali.
ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_capacity_check;

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_capacity_check CHECK (capacity BETWEEN 1 AND 48);

COMMIT;
