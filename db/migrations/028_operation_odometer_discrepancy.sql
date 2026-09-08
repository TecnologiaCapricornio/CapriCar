BEGIN;

-- Marca que o usuário confirmou uma quilometragem menor que o esperado
-- (menor que a retirada, na devolução; ou menor que o odômetro atual do
-- veículo, na retirada) mesmo depois do aviso. Sem isto, um dígito a mais
-- digitado por engano deixava a pessoa impedida de registrar a operação -
-- ver o mesmo raciocínio (não travar por um valor que pode estar certo)
-- em server/validation.js. Registros antigos, gravados antes deste campo
-- existir, ficam com o padrão FALSE - correto, já que não passaram por
-- nenhuma confirmação de divergência.
ALTER TABLE vehicle_operations
  ADD COLUMN IF NOT EXISTS odometer_discrepancy_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
