/* =========================================================
   Importação da e-CNH

   Único ponto de entrada usado pela rota: recebe os bytes do PDF
   (em memória - nunca gravados), confere a assinatura digital,
   lê os campos da carteira e valida o que foi lido. Devolve só o
   que o CapriCar guarda - número de registro, categoria e validade
   - mais quem assinou. Nome, CPF, foto, filiação etc. são lidos ou
   decodificados apenas em memória e descartados junto com o PDF.
   ========================================================= */
const { ECnhError } = require('./errors');
const { verifyPdfSignature } = require('./signature');
const { readCardFields, shutdownOcr } = require('./card-reader');

const MAX_PDF_BYTES = 2 * 1024 * 1024;
const IMPORT_TIMEOUT_MS = 45 * 1000;

// Preposições e conjunções que não identificam ninguém.
const NAME_CONNECTORS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'DI', 'DU', 'E']);

/* ---------------- Regras dos campos (puras) ---------------- */

// Dígitos verificadores do número de registro da CNH (11 dígitos, os dois
// últimos calculados por módulo 11). É o que pega uma leitura errada de
// um único dígito pelo OCR.
function cnhNumberIsValid(numero){
  const digits = String(numero || '');
  if(!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for(let i = 0, weight = 9; i < 9; i++, weight--) sum += Number(digits[i]) * weight;
  let first = sum % 11;
  let discount = 0;
  if(first >= 10){
    first = 0;
    discount = 2;
  }
  sum = 0;
  for(let i = 0, weight = 1; i < 9; i++, weight++) sum += Number(digits[i]) * weight;
  let second = (sum % 11) - discount;
  if(second < 0) second += 11;
  if(second >= 10) second = 0;
  return digits.slice(-2) === `${first}${second}`;
}

// "dd/mm/aaaa" -> "aaaa-mm-dd", ou '' se não for uma data real.
function parseBrazilianDate(text){
  const match = String(text || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!match) return '';
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

function nameTokens(name){
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(token => token.length >= 2 && !NAME_CONNECTORS.has(token));
}

// O primeiro e o último nome do cadastro precisam estar no nome da CNH. Os
// do meio não são exigidos: a CNH abrevia nomes longos e o cadastro
// costuma omitir sobrenomes intermediários.
function namesMatch(registeredName, licenseName){
  const registered = nameTokens(registeredName);
  const license = new Set(nameTokens(licenseName));
  if(!registered.length || !license.size) return false;
  return license.has(registered[0]) && license.has(registered[registered.length - 1]);
}

function validateFields(raw, { nomeCadastro, categorias, now }){
  const numero = String(raw.numero || '').replace(/\D/g, '');
  const categoria = String(raw.categoria || '').replace(/\s/g, '').toUpperCase();
  const validade = parseBrazilianDate(String(raw.validade || '').replace(/\s/g, ''));
  const nome = String(raw.nome || '').trim();

  const currentYear = now.getUTCFullYear();
  const validadeAno = validade ? Number(validade.slice(0, 4)) : 0;
  if(!cnhNumberIsValid(numero) || !categorias.includes(categoria) ||
     !validade || validadeAno < currentYear - 30 || validadeAno > currentYear + 15 ||
     nome.length < 5){
    throw new ECnhError(
      'Não foi possível ler os dados desta e-CNH com segurança. Exporte o PDF novamente pelo aplicativo ' +
      'Carteira Digital de Trânsito e tente de novo. Se o problema continuar, avise o administrador do sistema.',
      'LEITURA_FALHOU'
    );
  }

  if(!namesMatch(nomeCadastro, nome)){
    throw new ECnhError(
      'O nome impresso nesta e-CNH não corresponde ao nome do seu cadastro no CapriCar. ' +
      'Envie a sua própria CNH. Se o nome do seu cadastro estiver incorreto, peça a um gestor para corrigi-lo.',
      'NOME_DIVERGENTE'
    );
  }

  return { numero, categoria, validade };
}

/* ---------------- Orquestração ---------------- */

function withTimeout(promise){
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new ECnhError(
      'A leitura da e-CNH demorou mais que o esperado. Tente novamente em instantes.',
      'TEMPO_ESGOTADO'
    )), IMPORT_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// pdf: Buffer com o arquivo enviado. nomeCadastro: nome do usuário logado.
// categorias: categorias aceitas pelo sistema (ver ../driver-licenses).
async function readECnh(pdf, { nomeCadastro, categorias, now = new Date() }){
  if(!Buffer.isBuffer(pdf) || !pdf.length){
    throw new ECnhError('Selecione o arquivo PDF da sua e-CNH.', 'ARQUIVO_AUSENTE');
  }
  if(pdf.length > MAX_PDF_BYTES){
    throw new ECnhError('O arquivo é maior que 2 MB. Envie o PDF original exportado pelo aplicativo.', 'ARQUIVO_GRANDE');
  }
  if(pdf.subarray(0, 5).toString('latin1') !== '%PDF-'){
    throw new ECnhError('O arquivo enviado não é um PDF. Envie o PDF da e-CNH exportado pelo aplicativo.', 'NAO_E_PDF');
  }

  const assinatura = verifyPdfSignature(pdf, { now });
  const lidos = await withTimeout(readCardFields(pdf));
  const campos = validateFields(lidos, { nomeCadastro, categorias, now });

  return {
    ...campos,
    emissor:assinatura.signerName,
    assinadaEm:assinatura.signingTime
  };
}

module.exports = {
  MAX_PDF_BYTES,
  readECnh,
  shutdownOcr,
  // Expostos para testes.
  cnhNumberIsValid,
  parseBrazilianDate,
  namesMatch,
  validateFields
};
