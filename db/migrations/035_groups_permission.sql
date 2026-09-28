BEGIN;

-- Permissão própria da aba "Grupos" do painel de gestão (migração 034 criou
-- user_groups/user_group_members, mas a gestão deles ainda dependia da
-- permissão "Usuários" - agora é uma permissão à parte, para quem administra
-- grupos não precisar poder criar/editar/excluir contas, e vice-versa).
-- server/routes/groups.js e o cadastro do veículo (que lista os grupos para
-- escolher quem enxerga/reserva cada veículo - ver server/vehicle-access.js)
-- passam a exigir esta permissão (ou "Veículos", só para leitura).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_manage_groups BOOLEAN NOT NULL DEFAULT FALSE;

-- Quem já administrava usuários também já administrava grupos (a única
-- permissão que dava acesso à aba até aqui); preserva esse acesso em vez de
-- revogá-lo silenciosamente na primeira conta que tinha só "Usuários".
UPDATE users SET can_manage_groups = TRUE WHERE can_manage_users = TRUE;

COMMIT;
