BEGIN;

-- Permissão própria da nova aba "Checklist" do painel de gestão, separada de
-- "Reservas" - dá acesso a ver, aprovar e editar os checklists de avaria
-- preenchidos nas retiradas/devoluções de qualquer reserva, e também a
-- REGISTRAR a retirada ou a devolução de qualquer reserva em nome de outra
-- pessoa (ver server/routes/reservations.js) - usada pelo setor que faz esse
-- registro no lugar de quem reservou, em filiais onde não é a própria pessoa
-- que retira/devolve o carro. Até aqui nenhuma conta tinha essa permissão (a
-- coluna não existia); quem deve acessar a tela nova recebe a permissão
-- manualmente pelo Painel de Administração > Usuários, junto com as demais.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_manage_checklist BOOLEAN NOT NULL DEFAULT FALSE;

-- Conteúdo estruturado do checklist (pontos marcados no diagrama + status
-- C/A/X dos componentes + observações) não era persistido em lugar nenhum -
-- só ia e voltava no JSON da reserva, sem nunca ser salvo no banco.
-- Guardamos como JSONB porque o formato (lista de pontos, mapa de
-- componentes) já é validado em server/validation.js e não precisa de
-- colunas próprias.
--
-- "Aprovar" só marca o checklist como revisado (quem e quando) - não trava
-- nada nem dispara outro efeito. "Editar" sobrescreve o conteúdo original e
-- registra só quem editou por último (sem histórico de valores antigos).
ALTER TABLE vehicle_operations
  ADD COLUMN IF NOT EXISTS checklist JSONB,
  ADD COLUMN IF NOT EXISTS checklist_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checklist_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checklist_edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checklist_edited_at TIMESTAMPTZ;

COMMIT;
