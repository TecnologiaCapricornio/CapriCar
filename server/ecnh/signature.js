/* =========================================================
   Assinatura digital da e-CNH

   O PDF exportado pela Carteira Digital de Trânsito vem assinado
   (PAdES básico: /SubFilter adbe.pkcs7.detached) com certificado
   ICP-Brasil do DETRAN emissor. Conferir essa assinatura é o que
   transforma a leitura dos dados em prova: se um único byte do
   arquivo for alterado depois da assinatura - inclusive a imagem da
   carteira de onde o OCR tira validade e categoria - a verificação
   falha.

   O que é conferido, nesta ordem:
     1. o PDF tem exatamente UMA assinatura, e o /ByteRange dela cobre
        o arquivo inteiro (nada acrescentado depois de assinar);
     2. o resumo SHA-2 dos bytes assinados bate com o atributo
        messageDigest do CMS;
     3. a assinatura RSA sobre os atributos assinados confere com a
        chave pública do certificado do signatário;
     4. o certificado encadeia, criptograficamente, até uma raiz
        ICP-Brasil cuja impressão digital está fixada abaixo, e todos
        os certificados da cadeia eram válidos no momento da assinatura;
     5. o signatário é um órgão de trânsito (CN "DETRAN ..." ou
        SENATRAN/DENATRAN) dentro da ICP-Brasil.

   Não há consulta de revogação (LCR/OCSP): exigiria acesso de rede
   do servidor aos repositórios do SERPRO a cada importação.

   Só usa node:crypto - o CMS é lido pelo leitor BER mínimo daqui,
   que aceita o comprimento indefinido que o CDT usa.
   ========================================================= */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ECnhError } = require('./errors');

// AC Raiz Brasileira v5 (ITI). Ver server/certs/icp-brasil/README.md.
const TRUSTED_ROOT_FINGERPRINTS = new Set([
  'CA:A5:3F:C6:09:1C:69:51:88:7C:97:6E:37:8F:6E:F8:9A:A6:37:7C:55:D9:7B:64:75:42:2B:71:ED:7E:9B:17'
]);

const CERTS_DIR = path.join(__dirname, '..', 'certs', 'icp-brasil');

const OID = {
  signedData:'1.2.840.113549.1.7.2',
  data:'1.2.840.113549.1.7.1',
  contentType:'1.2.840.113549.1.9.3',
  messageDigest:'1.2.840.113549.1.9.4',
  signingTime:'1.2.840.113549.1.9.5'
};

const DIGEST_ALGORITHMS = {
  '2.16.840.1.101.3.4.2.1':'sha256',
  '2.16.840.1.101.3.4.2.2':'sha384',
  '2.16.840.1.101.3.4.2.3':'sha512'
};

// rsaEncryption usa o hash de digestAlgorithm; os sha*WithRSA trazem o próprio.
const SIGNATURE_ALGORITHMS = {
  '1.2.840.113549.1.1.1':null,
  '1.2.840.113549.1.1.11':'sha256',
  '1.2.840.113549.1.1.12':'sha384',
  '1.2.840.113549.1.1.13':'sha512'
};

const SIGNER_CN_PATTERN = /^(DETRAN\b|.*\b(SENATRAN|DENATRAN)\b)/i;

// Folga para relógio do servidor atrasado em relação ao do signatário.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const invalid = (message) => new ECnhError(
  message || 'A assinatura digital da e-CNH não é válida. Exporte o PDF novamente pelo aplicativo Carteira Digital de Trânsito, sem editar o arquivo.',
  'ASSINATURA_INVALIDA'
);

/* =========================================================
   Leitor BER/DER mínimo
   ========================================================= */

const MAX_DEPTH = 32;

function readTLV(buf, offset, end, depth = 0){
  if(depth > MAX_DEPTH || offset + 2 > end) throw invalid();
  const start = offset;
  const first = buf[offset++];
  const tagClass = first >> 6;
  const constructed = (first & 0x20) !== 0;
  let tagNumber = first & 0x1f;
  if(tagNumber === 0x1f){
    tagNumber = 0;
    let byte;
    do{
      if(offset >= end) throw invalid();
      byte = buf[offset++];
      tagNumber = (tagNumber * 128) + (byte & 0x7f);
    }while(byte & 0x80);
  }
  if(offset >= end) throw invalid();
  const lengthByte = buf[offset++];
  const node = { tagClass, constructed, tagNumber, start, buf, children:null, indefinite:false };

  if(lengthByte === 0x80){
    // Comprimento indefinido: conteúdo termina no par 00 00.
    if(!constructed) throw invalid();
    node.indefinite = true;
    node.contentStart = offset;
    node.children = [];
    let cursor = offset;
    for(;;){
      if(cursor + 2 > end) throw invalid();
      if(buf[cursor] === 0 && buf[cursor + 1] === 0){
        node.contentEnd = cursor;
        node.end = cursor + 2;
        return node;
      }
      const child = readTLV(buf, cursor, end, depth + 1);
      node.children.push(child);
      cursor = child.end;
    }
  }

  let length = lengthByte;
  if(lengthByte & 0x80){
    const count = lengthByte & 0x7f;
    if(count === 0 || count > 4 || offset + count > end) throw invalid();
    length = 0;
    for(let i = 0; i < count; i++) length = (length * 256) + buf[offset++];
  }
  node.contentStart = offset;
  node.contentEnd = offset + length;
  node.end = node.contentEnd;
  if(node.contentEnd > end) throw invalid();
  if(constructed){
    node.children = [];
    let cursor = node.contentStart;
    while(cursor < node.contentEnd){
      const child = readTLV(buf, cursor, node.contentEnd, depth + 1);
      node.children.push(child);
      cursor = child.end;
    }
  }
  return node;
}

const isUniversal = (node, tagNumber) => !!node && node.tagClass === 0 && node.tagNumber === tagNumber;
const isContext = (node, tagNumber) => !!node && node.tagClass === 2 && node.tagNumber === tagNumber;
const rawBytes = (node) => node.buf.subarray(node.start, node.end);

// OCTET STRING pode vir "construída" (em pedaços) no BER.
function octets(node){
  if(!isUniversal(node, 4)) throw invalid();
  if(!node.constructed) return node.buf.subarray(node.contentStart, node.contentEnd);
  return Buffer.concat(node.children.map(octets));
}

function decodeOid(node){
  if(!isUniversal(node, 6) || node.constructed) throw invalid();
  const bytes = node.buf.subarray(node.contentStart, node.contentEnd);
  if(!bytes.length) throw invalid();
  const arcs = [];
  let value = 0;
  for(const byte of bytes){
    value = (value * 128) + (byte & 0x7f);
    if(!(byte & 0x80)){
      arcs.push(value);
      value = 0;
    }
  }
  const firstArc = arcs[0] < 40 ? 0 : (arcs[0] < 80 ? 1 : 2);
  return [firstArc, arcs[0] - (firstArc * 40), ...arcs.slice(1)].join('.');
}

function integerHex(node){
  if(!isUniversal(node, 2) || node.constructed) throw invalid();
  return normalizeSerial(node.buf.subarray(node.contentStart, node.contentEnd).toString('hex'));
}

function normalizeSerial(hex){
  return String(hex || '').replace(/[^0-9a-f]/gi, '').replace(/^0+(?=.)/, '').toUpperCase();
}

function decodeTime(node){
  const text = node.buf.subarray(node.contentStart, node.contentEnd).toString('latin1');
  let match;
  if(isUniversal(node, 23) && (match = text.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/))){
    const year = Number(match[1]) < 50 ? 2000 + Number(match[1]) : 1900 + Number(match[1]);
    return new Date(Date.UTC(year, match[2] - 1, match[3], match[4], match[5], match[6]));
  }
  if(isUniversal(node, 24) && (match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/))){
    return new Date(Date.UTC(match[1], match[2] - 1, match[3], match[4], match[5], match[6]));
  }
  throw invalid();
}

/* =========================================================
   PDF: localizar a assinatura
   ========================================================= */

// Devolve { cms, signedContent }. Recusa PDF com mais de uma assinatura ou
// com bytes fora da faixa assinada (alteração incremental depois de assinar).
function extractPdfSignature(pdf){
  const text = pdf.toString('latin1');
  const ranges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  if(!ranges.length){
    throw new ECnhError(
      'Este PDF não tem assinatura digital. Use o arquivo exportado pelo aplicativo Carteira Digital de Trânsito.',
      'SEM_ASSINATURA'
    );
  }
  if(ranges.length > 1) throw invalid();
  if(!/\/SubFilter\s*\/(adbe\.pkcs7\.detached|ETSI\.CAdES\.detached)/.test(text)) throw invalid();

  const [start1, length1, start2, length2] = ranges[0].slice(1).map(Number);
  if(start1 !== 0 || start2 <= length1 || start2 + length2 !== pdf.length) throw invalid();

  const gap = text.slice(length1, start2);
  if(!/^<[0-9A-Fa-f]+>$/.test(gap)) throw invalid();

  return {
    cms:Buffer.from(gap.slice(1, -1), 'hex'),
    signedContent:Buffer.concat([
      pdf.subarray(start1, start1 + length1),
      pdf.subarray(start2, start2 + length2)
    ])
  };
}

/* =========================================================
   CMS (PKCS#7 SignedData, destacado)
   ========================================================= */

function parseSignedData(cms){
  const contentInfo = readTLV(cms, 0, cms.length);
  // O espaço reservado no PDF é maior que o CMS; o resto é preenchido com zeros.
  for(let i = contentInfo.end; i < cms.length; i++) if(cms[i] !== 0) throw invalid();

  const [typeNode, explicitContent] = contentInfo.children || [];
  if(!isUniversal(contentInfo, 16) || decodeOid(typeNode) !== OID.signedData || !isContext(explicitContent, 0)){
    throw invalid();
  }
  const signedData = explicitContent.children[0];
  if(!isUniversal(signedData, 16)) throw invalid();

  const parts = signedData.children;
  const encapContentInfo = parts[2];
  if(!isUniversal(encapContentInfo, 16) || decodeOid(encapContentInfo.children[0]) !== OID.data){
    throw invalid();
  }
  // Assinatura destacada: o conteúdo é o próprio PDF, não pode vir embutido.
  if(encapContentInfo.children.length !== 1) throw invalid();

  const certificatesNode = parts.find(part => isContext(part, 0));
  const certificates = certificatesNode
    ? certificatesNode.children.filter(child => isUniversal(child, 16)).map(child => Buffer.from(rawBytes(child)))
    : [];

  const signerInfos = parts[parts.length - 1];
  if(!isUniversal(signerInfos, 17) || signerInfos.children.length !== 1) throw invalid();
  return { certificates, signerInfo:parseSignerInfo(signerInfos.children[0]) };
}

function parseSignerInfo(node){
  if(!isUniversal(node, 16)) throw invalid();
  const [, sid, digestAlgorithm, ...rest] = node.children;

  // Só IssuerAndSerialNumber (SignerInfo v1), que é o que o CDT usa.
  if(!isUniversal(sid, 16) || sid.children.length !== 2) throw invalid();
  const serial = integerHex(sid.children[1]);

  const digest = DIGEST_ALGORITHMS[decodeOid(digestAlgorithm.children[0])];
  if(!digest) throw invalid();

  const signedAttrsNode = rest[0];
  // Os atributos assinados são obrigatórios e precisam estar em DER - são
  // exatamente os bytes que o signatário assinou.
  if(!isContext(signedAttrsNode, 0) || signedAttrsNode.indefinite) throw invalid();
  const signatureAlgorithm = rest[1];
  const signatureNode = rest[2];
  if(!isUniversal(signatureAlgorithm, 16)) throw invalid();
  const signatureOid = decodeOid(signatureAlgorithm.children[0]);
  if(!(signatureOid in SIGNATURE_ALGORITHMS)) throw invalid();

  const attributes = new Map();
  for(const attribute of signedAttrsNode.children){
    const oid = decodeOid(attribute.children[0]);
    if(attributes.has(oid)) throw invalid();
    attributes.set(oid, attribute.children[1].children);
  }

  // Para verificar, a tag [0] IMPLICIT volta a ser SET OF (0x31).
  const signedAttrsDer = Buffer.from(rawBytes(signedAttrsNode));
  signedAttrsDer[0] = 0x31;

  return {
    serial,
    digest,
    signatureHash:SIGNATURE_ALGORITHMS[signatureOid] || digest,
    signedAttrsDer,
    signature:octets(signatureNode),
    attributes
  };
}

/* =========================================================
   Cadeia de certificação
   ========================================================= */

let bundledCertificates = null;

function loadBundledCertificates(){
  if(bundledCertificates) return bundledCertificates;
  const pems = fs.readdirSync(CERTS_DIR)
    .filter(name => name.endsWith('.pem'))
    .flatMap(name => fs.readFileSync(path.join(CERTS_DIR, name), 'utf8')
      .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []);
  bundledCertificates = pems.map(pem => new crypto.X509Certificate(pem));
  return bundledCertificates;
}

const validFrom = cert => cert.validFromDate || new Date(cert.validFrom);
const validTo = cert => cert.validToDate || new Date(cert.validTo);

function subjectField(cert, field){
  const match = String(cert.subject).match(new RegExp('(?:^|\\n)' + field + '=([^\\n]+)'));
  return match ? match[1].trim() : '';
}

// Monta a cadeia do signatário até uma raiz fixada. Intermediárias podem vir
// do próprio CMS ou da pasta de certificados - nenhuma é confiável por si só,
// cada elo é conferido pela assinatura do emissor.
// `trust` = { roots:Set de fingerprints, certificates:[X509Certificate] }.
function verifyChain(leaf, extraCertificates, at, trust){
  if(leaf.ca) throw invalid();
  const pool = [...trust.certificates, ...extraCertificates];
  let current = leaf;
  for(let depth = 0; depth < 6; depth++){
    if(at < validFrom(current) || at > validTo(current)){
      throw invalid('O certificado que assinou esta e-CNH não era válido na data da assinatura.');
    }
    if(trust.roots.has(current.fingerprint256)) return;
    const issuer = pool.find(candidate =>
      candidate.ca &&
      candidate.subject === current.issuer &&
      current.checkIssued(candidate) &&
      current.verify(candidate.publicKey)
    );
    if(!issuer){
      throw new ECnhError(
        'A e-CNH foi assinada por uma cadeia de certificação não reconhecida pelo CapriCar. ' +
        'Avise o administrador do sistema.',
        'CADEIA_NAO_RECONHECIDA'
      );
    }
    current = issuer;
  }
  throw invalid();
}

/* =========================================================
   API
   ========================================================= */

// Âncoras de confiança: por padrão, a raiz ICP-Brasil fixada + as
// intermediárias da pasta de certificados. `trustAnchors` (lista de
// X509Certificate) substitui as duas - existe só para os testes usarem uma
// AC própria em vez da ICP-Brasil real.
function trustStore(trustAnchors){
  if(!trustAnchors) return { roots:TRUSTED_ROOT_FINGERPRINTS, certificates:loadBundledCertificates() };
  return {
    roots:new Set(trustAnchors.filter(cert => cert.ca && cert.checkIssued(cert)).map(cert => cert.fingerprint256)),
    certificates:trustAnchors
  };
}

// Confere a assinatura do PDF inteiro e devolve quem assinou e quando.
// Lança ECnhError em qualquer divergência.
function verifyPdfSignature(pdf, options = {}){
  const now = options.now || new Date();
  const { cms, signedContent } = extractPdfSignature(pdf);

  let parsed;
  try{
    parsed = parseSignedData(cms);
  }catch(error){
    if(error instanceof ECnhError) throw error;
    throw invalid();
  }
  const { certificates, signerInfo } = parsed;

  const contentType = signerInfo.attributes.get(OID.contentType);
  const messageDigest = signerInfo.attributes.get(OID.messageDigest);
  if(!contentType || decodeOid(contentType[0]) !== OID.data || !messageDigest) throw invalid();

  const expected = octets(messageDigest[0]);
  const actual = crypto.createHash(signerInfo.digest).update(signedContent).digest();
  if(expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)){
    throw invalid('O arquivo da e-CNH foi alterado depois de assinado. Exporte o PDF novamente pelo aplicativo Carteira Digital de Trânsito.');
  }

  const x509 = certificates.map(der => new crypto.X509Certificate(der));
  const signer = x509.find(cert => normalizeSerial(cert.serialNumber) === signerInfo.serial);
  if(!signer) throw invalid();

  const signatureOk = crypto.verify(signerInfo.signatureHash, signerInfo.signedAttrsDer, signer.publicKey, signerInfo.signature);
  if(!signatureOk) throw invalid();

  const signingTimeAttr = signerInfo.attributes.get(OID.signingTime);
  const signingTime = signingTimeAttr ? decodeTime(signingTimeAttr[0]) : now;
  if(signingTime.getTime() > now.getTime() + CLOCK_SKEW_MS) throw invalid();

  verifyChain(signer, x509.filter(cert => cert !== signer), signingTime, trustStore(options.trustAnchors));

  const signerName = subjectField(signer, 'CN');
  if(subjectField(signer, 'O') !== 'ICP-Brasil' || !SIGNER_CN_PATTERN.test(signerName)){
    throw new ECnhError(
      'Este PDF está assinado, mas não por um órgão de trânsito. Use a e-CNH exportada pelo aplicativo Carteira Digital de Trânsito.',
      'SIGNATARIO_NAO_AUTORIZADO'
    );
  }

  return { signerName, signingTime };
}

module.exports = {
  TRUSTED_ROOT_FINGERPRINTS,
  verifyPdfSignature,
  // Expostos para testes.
  extractPdfSignature,
  readTLV,
  decodeOid,
  normalizeSerial
};
