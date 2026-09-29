const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { verifyPdfSignature, readTLV, decodeOid, TRUSTED_ROOT_FINGERPRINTS } = require('../server/ecnh/signature');
const { cnhNumberIsValid, parseBrazilianDate, namesMatch, validateFields } = require('../server/ecnh');
const { findLabels, fieldBoxes, overviewValue } = require('../server/ecnh/card-reader');

// PDFs sintéticos (sem dado pessoal), assinados por uma AC de teste - ver
// tests/fixtures/ecnh/generate-fixtures.js.
const fixtures = path.join(__dirname, 'fixtures', 'ecnh');
const readFixture = name => fs.readFileSync(path.join(fixtures, name));
const testRoot = new crypto.X509Certificate(readFixture('test-root.pem'));
const trustAnchors = [testRoot];
// Posterior à geração das fixtures (a assinatura não pode estar no futuro) e
// dentro da validade dos certificados de teste (100 anos).
const NOW = new Date('2090-01-01T00:00:00Z');
// Data "de hoje" para as regras dos campos (plausibilidade da validade).
const TODAY = new Date('2026-09-27T12:00:00Z');
const CATEGORIAS = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];

const codeOf = fn => {
  try{
    fn();
  }catch(error){
    return error.code;
  }
  return 'ACEITO';
};

/* ---------------- Assinatura ---------------- */

test('PDF assinado por DETRAN em cadeia confiável é aceito', () => {
  const result = verifyPdfSignature(readFixture('signed-detran.pdf'), { trustAnchors, now:NOW });
  assert.equal(result.signerName, 'DETRAN XX TESTE');
  assert.ok(result.signingTime instanceof Date);
});

test('qualquer byte alterado depois da assinatura é recusado', () => {
  const pdf = readFixture('signed-detran.pdf');
  for(const position of [10, 200, pdf.length - 5]){
    const tampered = Buffer.from(pdf);
    tampered[position] ^= 0x01;
    assert.equal(codeOf(() => verifyPdfSignature(tampered, { trustAnchors, now:NOW })), 'ASSINATURA_INVALIDA');
  }
});

test('conteúdo anexado depois da assinatura é recusado', () => {
  const pdf = Buffer.concat([readFixture('signed-detran.pdf'), Buffer.from('\n1 0 obj << >> endobj\n%%EOF\n')]);
  assert.equal(codeOf(() => verifyPdfSignature(pdf, { trustAnchors, now:NOW })), 'ASSINATURA_INVALIDA');
});

test('assinatura de quem não é órgão de trânsito é recusada', () => {
  assert.equal(
    codeOf(() => verifyPdfSignature(readFixture('signed-empresa.pdf'), { trustAnchors, now:NOW })),
    'SIGNATARIO_NAO_AUTORIZADO'
  );
});

test('cadeia que não chega à raiz ICP-Brasil fixada é recusada', () => {
  // Sem trustAnchors vale a raiz ICP-Brasil real, que não emitiu a AC de teste.
  assert.equal(codeOf(() => verifyPdfSignature(readFixture('signed-detran.pdf'), { now:NOW })), 'CADEIA_NAO_RECONHECIDA');
});

test('PDF sem assinatura é recusado com mensagem própria', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
  assert.equal(codeOf(() => verifyPdfSignature(pdf, { now:NOW })), 'SEM_ASSINATURA');
});

test('assinatura com data no futuro é recusada', () => {
  const past = new Date('2000-01-01T00:00:00Z');
  assert.equal(codeOf(() => verifyPdfSignature(readFixture('signed-detran.pdf'), { trustAnchors, now:past })), 'ASSINATURA_INVALIDA');
});

test('a raiz ICP-Brasil fixada é a do arquivo versionado', () => {
  const pem = fs.readFileSync(path.join(__dirname, '..', 'server', 'certs', 'icp-brasil', 'ac-raiz-icp-brasil-v5.pem'));
  assert.ok(TRUSTED_ROOT_FINGERPRINTS.has(new crypto.X509Certificate(pem).fingerprint256));
});

test('leitor BER aceita comprimento indefinido e decodifica OID', () => {
  // SEQUENCE (indefinido) { OID 1.2.840.113549.1.7.2 } 00 00
  const ber = Buffer.from('3080' + '06092a864886f70d010702' + '0000', 'hex');
  const node = readTLV(ber, 0, ber.length);
  assert.equal(node.indefinite, true);
  assert.equal(node.end, ber.length);
  assert.equal(decodeOid(node.children[0]), '1.2.840.113549.1.7.2');
});

test('leitor BER recusa estrutura truncada', () => {
  const truncated = Buffer.from('3080' + '06092a864886f7', 'hex');
  assert.throws(() => readTLV(truncated, 0, truncated.length));
});

/* ---------------- Regras dos campos ---------------- */

// Cálculo independente dos dígitos verificadores, para gerar números de teste.
function withCheckDigits(base9){
  let sum = 0;
  for(let i = 0; i < 9; i++) sum += Number(base9[i]) * (9 - i);
  let d1 = sum % 11;
  let discount = 0;
  if(d1 >= 10){
    d1 = 0;
    discount = 2;
  }
  sum = 0;
  for(let i = 0; i < 9; i++) sum += Number(base9[i]) * (i + 1);
  let d2 = (sum % 11) - discount;
  if(d2 < 0) d2 += 11;
  if(d2 >= 10) d2 = 0;
  return base9 + d1 + d2;
}

// Trocar um dígito da base quase sempre invalida o número, mas não sempre: o
// algoritmo oficial transforma resto 10 em 0, então há colisões raras. Já
// qualquer alteração nos próprios dígitos verificadores é sempre detectada.
test('número de registro válido passa e dígito verificador trocado falha', () => {
  for(const base of ['123456789', '987654321', '000000001', '555123987']){
    const numero = withCheckDigits(base);
    assert.equal(cnhNumberIsValid(numero), true, numero);
    for(const i of [9, 10]){
      for(let delta = 1; delta <= 9; delta++){
        const changed = numero.slice(0, i) + ((Number(numero[i]) + delta) % 10) + numero.slice(i + 1);
        assert.equal(cnhNumberIsValid(changed), false, changed);
      }
    }
  }
});

test('número de registro com formato errado ou repetido falha', () => {
  assert.equal(cnhNumberIsValid('1234567890'), false);
  assert.equal(cnhNumberIsValid('123456789012'), false);
  assert.equal(cnhNumberIsValid('11111111111'), false);
  assert.equal(cnhNumberIsValid('1234567890A'), false);
});

test('data brasileira vira ISO e datas impossíveis são recusadas', () => {
  assert.equal(parseBrazilianDate('26/05/2031'), '2031-05-26');
  assert.equal(parseBrazilianDate('30/02/2031'), '');
  assert.equal(parseBrazilianDate('2031-05-26'), '');
  assert.equal(parseBrazilianDate(''), '');
});

test('nome confere pelo primeiro e último nome, sem acento nem caixa', () => {
  assert.equal(namesMatch('João da Silva', 'JOAO PEREIRA DA SILVA'), true);
  assert.equal(namesMatch('Maria Conceição', 'MARIA DA CONCEICAO SOUZA'), true);
  assert.equal(namesMatch('Maria Souza', 'MARIA DA CONCEICAO'), false);
  assert.equal(namesMatch('Pedro Alves', 'JOAO ALVES'), false);
  assert.equal(namesMatch('', 'JOAO ALVES'), false);
});

test('campos lidos válidos são normalizados', () => {
  const numero = withCheckDigits('123456789');
  const result = validateFields(
    { nome:'JOAO PEREIRA DA SILVA', numero, validade:'26/05/2031', categoria:'A B' },
    { nomeCadastro:'João Silva', categorias:CATEGORIAS, now:TODAY }
  );
  assert.deepEqual(result, { numero, categoria:'AB', validade:'2031-05-26' });
});

test('leitura com dígito verificador errado é recusada como leitura falha', () => {
  const numero = withCheckDigits('123456789');
  const wrong = numero.slice(0, 10) + ((Number(numero[10]) + 1) % 10);
  assert.equal(codeOf(() => validateFields(
    { nome:'JOAO SILVA', numero:wrong, validade:'26/05/2031', categoria:'AB' },
    { nomeCadastro:'João Silva', categorias:CATEGORIAS, now:TODAY }
  )), 'LEITURA_FALHOU');
});

test('categoria ou validade fora do esperado é recusada', () => {
  const numero = withCheckDigits('123456789');
  const base = { nome:'JOAO SILVA', numero, validade:'26/05/2031', categoria:'AB' };
  const opts = { nomeCadastro:'João Silva', categorias:CATEGORIAS, now:TODAY };
  assert.equal(codeOf(() => validateFields({ ...base, categoria:'F' }, opts)), 'LEITURA_FALHOU');
  assert.equal(codeOf(() => validateFields({ ...base, validade:'26/05/2150' }, opts)), 'LEITURA_FALHOU');
});

test('CNH de outra pessoa é recusada sem repetir o nome lido', () => {
  const numero = withCheckDigits('123456789');
  let error;
  try{
    validateFields(
      { nome:'CARLOS MENEZES', numero, validade:'26/05/2031', categoria:'AB' },
      { nomeCadastro:'João Silva', categorias:CATEGORIAS, now:TODAY }
    );
  }catch(caught){
    error = caught;
  }
  assert.equal(error.code, 'NOME_DIVERGENTE');
  assert.doesNotMatch(error.message, /CARLOS|MENEZES/i);
});

/* ---------------- Localização dos campos na carteira ---------------- */

const word = (text, x0, y0, x1, y1) => ({ text, x0, y0, x1, y1 });
const LAYOUT_WORDS = [
  word('NOME', 171, 156, 216, 168),
  word('Nº', 170, 600, 192, 612),
  word('REGISTRO', 196, 600, 268, 612),
  word('VALIDADE', 495, 600, 569, 612),
  word('1ª', 705, 600, 722, 612),
  word('HABILITAÇÃO', 726, 600, 826, 612),
  word('CAT.', 820, 531, 853, 544),
  word('HAB.', 858, 531, 892, 544),
  word('HABILITAÇÃO', 516, 104, 670, 123)
];

test('rótulos da carteira são encontrados, sem confundir HAB. com HABILITAÇÃO', () => {
  const labels = findLabels(LAYOUT_WORDS);
  assert.equal(labels.nome.x0, 171);
  assert.equal(labels.categoria.text, 'HAB.');
  assert.equal(labels.primeiraHabilitacao.x0, 726);
});

test('sem algum rótulo obrigatório o layout não é reconhecido', () => {
  assert.equal(findLabels(LAYOUT_WORDS.filter(item => item.text !== 'VALIDADE')), null);
});

test('caixas de valor ficam abaixo dos rótulos e dentro da imagem', () => {
  const boxes = fieldBoxes(findLabels(LAYOUT_WORDS), 963, 680);
  for(const box of Object.values(boxes)){
    assert.ok(box.left >= 0 && box.top >= 0 && box.width > 0 && box.height > 0);
    assert.ok(box.left + box.width <= 963 && box.top + box.height <= 680);
  }
  assert.ok(boxes.numero.left + boxes.numero.width <= 495, 'registro não invade a validade');
  assert.ok(boxes.validade.left + boxes.validade.width <= 726, 'validade não invade a 1ª habilitação');
});

/* ---------------- Modelo novo (nacional, com MRZ) ---------------- */

// Rótulos da frente do modelo novo, nas posições reais em 963x680 (sem dado
// pessoal): VALIDADE fica ACIMA do registro, e não à direita dele.
const NEW_LAYOUT_WORDS = [
  word('2', 183, 177, 208, 187),
  word('NOME', 214, 178, 247, 187),
  word('E', 252, 178, 256, 187),
  word('SOBRENOME', 261, 178, 330, 187),
  word('1º', 798, 178, 807, 186),
  word('HABILITAÇÃO', 812, 176, 883, 189),
  word('4a', 453, 289, 466, 298),
  word('DATA', 472, 290, 498, 299),
  word('EMISSÃO', 502, 288, 550, 299),
  word('4b', 629, 288, 642, 298),
  word('VALIDADE', 649, 289, 701, 298),
  word('ACC', 819, 289, 840, 298),
  word('4d', 453, 399, 466, 409),
  word('CPF', 471, 400, 490, 409),
  word('5', 648, 399, 654, 409),
  word('Nº', 660, 400, 671, 408),
  word('REGISTRO', 676, 400, 728, 409),
  word('9', 828, 399, 834, 409),
  word('CAT', 842, 400, 860, 408),
  word('HAB', 864, 400, 885, 408),
  // Valores dentro das molduras: mais altos que os rótulos, não entram na linha.
  word('00000000000', 633, 402, 757, 442),
  word('HABILITAÇÃO', 382, 127, 511, 165)
];

const right = box => box.left + box.width;
const contains = (box, x0, x1) => box.left <= x0 && right(box) >= x1;

test('modelo novo: rótulos encontrados e cada caixa fica sob o próprio rótulo', () => {
  const labels = findLabels(NEW_LAYOUT_WORDS);
  assert.ok(labels);
  const boxes = fieldBoxes(labels, 963, 680);
  for(const box of Object.values(boxes)){
    assert.ok(box.left >= 0 && box.top >= 0 && box.width > 20 && box.height > 0);
    assert.ok(right(box) <= 963 && box.top + box.height <= 680);
  }
  // Onde os valores estão impressos no modelo novo.
  assert.ok(contains(boxes.nome, 179, 510), 'nome inteiro, desde a 1ª letra');
  assert.ok(right(boxes.nome) < 794, 'nome não invade a data da 1ª habilitação');
  assert.ok(contains(boxes.numero, 645, 757), 'número de registro inteiro');
  assert.ok(right(boxes.numero) < 828, 'registro não invade a categoria');
  assert.ok(contains(boxes.validade, 615, 715), 'validade inteira');
  assert.ok(right(boxes.validade) < 777, 'validade não invade o ACC');
  assert.ok(boxes.validade.top > 298 && boxes.numero.top > 409, 'caixas abaixo dos rótulos');
  assert.ok(contains(boxes.categoria, 828, 837), 'categoria');
});

test('modelo antigo: caixas continuam as mesmas de antes', () => {
  // Valores calculados pela versão anterior (só modelo antigo) de fieldBoxes.
  assert.deepEqual(fieldBoxes(findLabels(LAYOUT_WORDS), 963, 680), {
    nome:{ left:156, top:172, width:759, height:40 },
    numero:{ left:151, top:616, width:314, height:40 },
    validade:{ left:480, top:616, width:201, height:40 },
    categoria:{ left:808, top:548, width:109, height:40 }
  });
});

test('valor da passada geral: só palavras dentro da caixa e confiáveis', () => {
  const rect = { left:814, top:412, width:96, height:40 };
  const at = (text, x0, confidence) => ({ text, x0, y0:420, x1:x0 + 9, y1:433, confidence });
  assert.equal(overviewValue([at('B', 828, 91), at('X', 700, 99)], rect), 'B');
  assert.equal(overviewValue([at('B', 828, 40)], rect), null);
  assert.equal(overviewValue([at('X', 700, 99)], rect), null);
});
