BEGIN;

-- Permissão própria da tela Manutenção, separada de "Veículos"
-- (can_manage_fleet). Até aqui nenhuma conta tinha acesso a lembretes de
-- manutenção por essa coluna não existir - o padrão FALSE preserva esse
-- estado; quem deve acessar a tela nova recebe a permissão manualmente pelo
-- Painel de Administração > Usuários, junto com as demais.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_manage_maintenance BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
