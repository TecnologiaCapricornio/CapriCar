BEGIN;

-- Perfis de acesso pré-definidos no lugar das caixinhas de permissão uma a
-- uma. Três perfis (ver server/profiles.js, onde fica o que cada um libera):
--   usuario  - padrão: só faz reservas (nenhuma permissão de gestão);
--   gestao   - acesso a tudo do painel de Gestão;
--   portaria - só Checklist, Calendário e a lista de Reservas (só leitura);
--              não faz reserva nem cadastra CNH.
--
-- As colunas can_manage_*/can_view_* continuam existindo e são mantidas
-- sempre coerentes com o perfil (o servidor grava as duas coisas juntas):
-- todo o resto do sistema - consultas de destinatários de e-mail, lembretes,
-- visibilidade de reservas etc. - continua lendo as colunas e não precisou
-- mudar.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile TEXT NOT NULL DEFAULT 'usuario';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_profile_check;

ALTER TABLE users
  ADD CONSTRAINT users_profile_check CHECK (profile IN ('usuario', 'gestao', 'portaria'));

-- Conversão das contas existentes (decisão: ninguém perde acesso):
--   admin, ou qualquer permissão de gestão além do Checklist -> gestao;
--   só o Checklist                                           -> portaria;
--   nenhuma permissão                                        -> usuario.
UPDATE users
   SET profile = CASE
     WHEN role = 'admin'
       OR can_manage_reservations OR can_manage_branches OR can_manage_fleet
       OR can_manage_maintenance OR can_manage_blocks OR can_view_reports
       OR can_view_audit OR can_manage_rules OR can_manage_users
       OR can_manage_groups OR can_manage_integrations
       THEN 'gestao'
     WHEN can_manage_checklist THEN 'portaria'
     ELSE 'usuario'
   END
 WHERE deleted_at IS NULL;

-- Deixa as colunas exatamente como o perfil manda (quem tinha só parte da
-- gestão passa a ter a gestão inteira).
UPDATE users
   SET can_manage_reservations = (profile = 'gestao'),
       can_manage_branches = (profile = 'gestao'),
       can_manage_fleet = (profile = 'gestao'),
       can_manage_maintenance = (profile = 'gestao'),
       can_manage_blocks = (profile = 'gestao'),
       can_view_reports = (profile = 'gestao'),
       can_view_audit = (profile = 'gestao'),
       can_manage_rules = (profile = 'gestao'),
       can_manage_users = (profile = 'gestao'),
       can_manage_groups = (profile = 'gestao'),
       can_manage_integrations = (profile = 'gestao'),
       can_manage_checklist = (profile IN ('gestao', 'portaria'))
 WHERE deleted_at IS NULL;

COMMIT;
