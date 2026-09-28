BEGIN;

-- A CNH passa a entrar no sistema apenas pela importação da e-CNH (PDF
-- assinado digitalmente pelo DETRAN - ver server/ecnh/). Duas decisões
-- tomadas junto com essa mudança:
--
--   1. As CNHs digitadas pelos próprios usuários até aqui deixam de valer:
--      não há como saber se os dados eram verdadeiros. Cada usuário volta
--      a "sem CNH" (apenas passageiro) até importar a sua e-CNH.
--   2. As fotos de CNH deixam de existir: o sistema não guarda mais imagem
--      do documento (LGPD - minimização). As linhas saem aqui; os arquivos
--      em server/uploads/cnh são apagados por server/scripts/migrate.js
--      logo depois das migrações.
DELETE FROM driver_license_photos;
DROP TABLE IF EXISTS driver_license_photos;
DELETE FROM driver_licenses;

ALTER TABLE driver_licenses
  ADD COLUMN IF NOT EXISTS origem VARCHAR(10) NOT NULL DEFAULT 'e-cnh'
    CHECK (origem IN ('e-cnh')),
  -- Órgão que assinou o PDF (CN do certificado, ex.: "DETRAN SP").
  ADD COLUMN IF NOT EXISTS emissor VARCHAR(120),
  ADD COLUMN IF NOT EXISTS verificada_em TIMESTAMPTZ;

-- A tabela está vazia neste ponto, então pode endurecer as colunas: toda
-- CNH gravada daqui em diante vem completa da e-CNH.
ALTER TABLE driver_licenses
  ALTER COLUMN numero SET NOT NULL,
  ALTER COLUMN categoria SET NOT NULL,
  ALTER COLUMN validade SET NOT NULL,
  ALTER COLUMN emissor SET NOT NULL,
  ALTER COLUMN verificada_em SET NOT NULL;

-- A mesma CNH não pode liberar dois usuários como motorista.
CREATE UNIQUE INDEX IF NOT EXISTS driver_licenses_numero_unique
  ON driver_licenses (numero);

COMMIT;
