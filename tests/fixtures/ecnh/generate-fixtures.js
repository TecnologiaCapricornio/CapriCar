#!/usr/bin/env node
/*
 * Gera os PDFs assinados usados por tests/ecnh.test.js.
 *
 * São documentos SINTÉTICOS, sem nenhum dado pessoal, assinados por uma AC de
 * teste criada aqui mesmo (não é ICP-Brasil). Servem para exercitar a
 * verificação de assinatura (server/ecnh/signature.js) sem versionar uma e-CNH
 * real. Precisa do `openssl` no PATH só para REGERAR - os testes usam os
 * arquivos já gerados.
 *
 *   node tests/fixtures/ecnh/generate-fixtures.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const out = __dirname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capricar-ecnh-'));
const openssl = (...args) => execFileSync('openssl', args, { cwd:tmp, stdio:['ignore', 'pipe', 'pipe'] });

// AC raiz de teste (100 anos) e dois signatários: um "DETRAN" e um que não é
// órgão de trânsito, ambos com O=ICP-Brasil para isolar a regra do CN.
openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'root.key', '-out', 'root.pem',
  '-days', '36500', '-subj', '/C=BR/O=ICP-Brasil/CN=AC Raiz de Teste CapriCar',
  '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');

function issueLeaf(name, cn){
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`,
    '-subj', `/C=BR/O=ICP-Brasil/CN=${cn}`);
  fs.writeFileSync(path.join(tmp, `${name}.ext`), 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\n');
  openssl('x509', '-req', '-in', `${name}.csr`, '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial',
    '-out', `${name}.pem`, '-days', '36500', '-sha256', '-extfile', `${name}.ext`);
}
issueLeaf('detran', 'DETRAN XX TESTE');
issueLeaf('empresa', 'EMPRESA QUALQUER TESTE');

// PDF mínimo de uma página com dicionário de assinatura. O /Contents é
// reservado com zeros e preenchido depois com o CMS em hexadecimal.
const PLACEHOLDER = 8192;
function buildSignedPdf(signer){
  const head = '%PDF-1.5\n' +
    '1 0 obj << /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /SigFlags 3 >> >> endobj\n' +
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [4 0 R] >> endobj\n' +
    '4 0 obj << /Type /Annot /Subtype /Widget /FT /Sig /Rect [0 0 0 0] /V 5 0 R /T (Assinatura) >> endobj\n' +
    '5 0 obj << /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ' +
    '/ByteRange [0 0000000000 0000000000 0000000000] /Contents <';
  const tail = '> >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n';
  // A faixa não assinada vai do "<" ao ">" do /Contents, inclusive; `tail`
  // começa pelo ">".
  const contentsStart = Buffer.byteLength(head, 'latin1') - 1; // posição do "<"
  const contentsEnd = contentsStart + 1 + PLACEHOLDER * 2 + 1;  // logo após o ">"
  const total = contentsEnd + Buffer.byteLength(tail, 'latin1') - 1;
  const pad = n => String(n).padStart(10, '0');
  const withRange = head.replace('[0 0000000000 0000000000 0000000000]',
    `[0 ${pad(contentsStart)} ${pad(contentsEnd)} ${pad(total - contentsEnd)}]`);

  const before = Buffer.from(withRange, 'latin1');
  const after = Buffer.from(tail, 'latin1');
  const signed = Buffer.concat([before.subarray(0, contentsStart), after.subarray(1)]);
  fs.writeFileSync(path.join(tmp, 'content.bin'), signed);
  openssl('cms', '-sign', '-binary', '-in', 'content.bin', '-signer', `${signer}.pem`, '-inkey', `${signer}.key`,
    '-md', 'sha256', '-nosmimecap', '-outform', 'DER', '-out', 'sig.der');
  const cmsHex = fs.readFileSync(path.join(tmp, 'sig.der')).toString('hex');
  if(cmsHex.length > PLACEHOLDER * 2) throw new Error('Assinatura maior que o espaço reservado.');
  return Buffer.concat([before, Buffer.from(cmsHex.padEnd(PLACEHOLDER * 2, '0'), 'latin1'), after]);
}

fs.writeFileSync(path.join(out, 'test-root.pem'), fs.readFileSync(path.join(tmp, 'root.pem')));
fs.writeFileSync(path.join(out, 'signed-detran.pdf'), buildSignedPdf('detran'));
fs.writeFileSync(path.join(out, 'signed-empresa.pdf'), buildSignedPdf('empresa'));
fs.rmSync(tmp, { recursive:true, force:true });
console.log('Fixtures geradas em', out);
