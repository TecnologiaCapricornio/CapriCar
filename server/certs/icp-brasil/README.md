# Cadeia ICP-Brasil usada para validar a e-CNH

Certificados **públicos** usados por `server/ecnh/signature.js` para conferir
a assinatura digital do PDF exportado pela Carteira Digital de Trânsito.
Não há nenhuma chave privada aqui.

| Arquivo | Certificado | SHA-256 | Vence |
|---|---|---|---|
| `ac-raiz-icp-brasil-v5.pem` | AC Raiz Brasileira v5 (ITI) — **âncora de confiança** | `CA:A5:3F:C6:09:1C:69:51:88:7C:97:6E:37:8F:6E:F8:9A:A6:37:7C:55:D9:7B:64:75:42:2B:71:ED:7E:9B:17` | 02/03/2029 |
| `ac-serpro-v4.pem` | AC SERPRO v4 (intermediária) | `35:33:05:81:E9:22:4B:72:CB:34:0F:A4:4B:8F:57:DA:79:AC:0A:3C:95:16:0C:BD:45:19:EC:C1:1B:AB:5C:12` | 02/03/2029 |
| `ac-serpro-final-ssl.pem` | AC SERPRO Final SSL (emite o certificado dos DETRANs) | `A6:62:26:51:19:E9:5E:01:B2:57:A5:AE:FA:C4:B8:E1:C0:97:25:D8:E5:90:81:B7:78:55:22:F3:3B:1A:15:0F` | 15/02/2029 |

Origem:
- Raiz: `https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv5.crt` (ITI, HTTPS).
- Intermediárias: `http://repositorio.serpro.gov.br/cadeias/acserproacfssl.p7b`
  (endereço AIA do próprio certificado do DETRAN). Por virem via HTTP, **não são
  confiáveis por si só**: o código só as aceita porque cada uma é verificada
  criptograficamente até a raiz acima, cuja impressão digital está fixada em
  `server/ecnh/signature.js` (`TRUSTED_ROOT_FINGERPRINTS`).

## Manutenção

- Todos vencem em 2029. Antes disso, baixe as versões novas dos mesmos
  endereços e atualize a impressão digital da raiz no código.
- Se uma e-CNH de outro estado for recusada com "cadeia de certificação não
  reconhecida", o certificado do DETRAN daquele estado provavelmente foi
  emitido por outra AC. Baixe a cadeia dela (endereço "CA Issuers" do
  certificado) e coloque os `.pem` das intermediárias nesta pasta. Qualquer
  intermediária colocada aqui só é aceita se encadear até uma raiz fixada.
