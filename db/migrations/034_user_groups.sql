BEGIN;

-- Grupos de usuários. Um veículo pode ser restrito a um ou mais grupos
-- (campo `grupos` do veículo na coleção application_state.vehicles, com os
-- ids desta tabela): só membros enxergam e reservam; a gestão continua
-- vendo e administrando o veículo. Regra completa em server/vehicle-access.js.
--
-- Ficam em tabela própria (e não numa coleção do application_state, como
-- locais e veículos) porque quem pertence a qual grupo é dado de controle de
-- acesso: o bootstrap entrega as coleções inteiras para todo usuário logado.
CREATE TABLE IF NOT EXISTS user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_groups_name_unique
  ON user_groups (LOWER(name));

CREATE TABLE IF NOT EXISTS user_group_members (
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- A sessão carrega os grupos do usuário a cada requisição (server/auth.js).
CREATE INDEX IF NOT EXISTS user_group_members_user_idx
  ON user_group_members (user_id);

COMMIT;
