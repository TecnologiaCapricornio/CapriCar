BEGIN;

-- Tipo do veículo. A capacidade já aceitava até 20 lugares, mas nada dizia
-- QUE tipo de veículo era - e o mapa de lugares precisa disso para escolher
-- o desenho (um carro de 5 lugares e uma van de 15 não têm o mesmo layout).
-- É também a base para o transporte coletivo, em que todos os ocupantes são
-- passageiros e ninguém figura como motorista.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(12) NOT NULL DEFAULT 'carro'
    CHECK (vehicle_type IN ('carro', 'van', 'onibus'));

-- Frota própria x alugada: dimensão de custo que o CapriCar não tinha.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS rented BOOLEAN NOT NULL DEFAULT FALSE;

-- Centro de custo, para rateio. Fica no veículo (a quem o custo fixo
-- pertence) e na reserva (quem consumiu naquela viagem) - os dois são
-- necessários, e podem divergir legitimamente.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS cost_center VARCHAR(60);

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS cost_center VARCHAR(60);

COMMIT;
