BEGIN;

-- Campo opcional de texto livre pra quem revisa o checklist na aba "Checklist"
-- do painel de gestão anotar quem fez a vistoria (nem sempre é quem registrou
-- a retirada/devolução, nem quem aprova o checklist depois). Só aparece e é
-- editável ali - não faz parte do formulário de retirada/devolução usado por
-- quem reserva.
ALTER TABLE vehicle_operations
  ADD COLUMN IF NOT EXISTS checklist_inspector_name TEXT;

COMMIT;
