BEGIN;

-- Permissão separada de "Checklist" (030): aquela dá acesso a APROVAR/EDITAR
-- um checklist já enviado; esta dá acesso a REGISTRAR a retirada ou a
-- devolução de uma reserva de outra pessoa - fluxo pedido pelo usuário
-- porque em algumas filiais quem faz esse registro é um setor específico
-- (não quem reservou o carro). Continua funcionando do jeito antigo também:
-- sem essa permissão, só quem criou a reserva pode registrar sua própria
-- retirada/devolução (ver server/routes/reservations.js e
-- js/management-operations.js) - as duas opções ficam disponíveis ao mesmo
-- tempo, e cada filial usa a que fizer sentido pra ela.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_manage_operacao BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
