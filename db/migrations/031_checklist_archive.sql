BEGIN;

-- Botão "Arquivar" na aba Checklist do painel de gestão: tira um item
-- pendente (retirada/devolução ainda sem registro, ou já registrada mas
-- ainda sem revisão) da lista normal sem preencher nem aprovar nada - ele
-- vai para uma aba discreta de arquivados, pra quando não faz sentido
-- cobrar aquele registro (reserva antiga, no-show etc.). Fica em pares de
-- colunas na própria reservations (uma por fase) em vez de em
-- vehicle_operations, porque o arquivamento precisa funcionar mesmo antes
-- da retirada/devolução ter sido registrada - nesse caso ainda não existe
-- nenhuma linha em vehicle_operations pra guardar a informação.
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS checklist_archived_retirada_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checklist_archived_retirada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checklist_archived_devolucao_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checklist_archived_devolucao_at TIMESTAMPTZ;

COMMIT;
