/* =========================================================
   Leitura dos dados da e-CNH (OCR)

   No PDF da Carteira Digital de Trânsito os dados do condutor não
   existem como texto: a frente e o verso da carteira são imagens, e o
   QR code tem conteúdo binário proprietário. Por isso a leitura é por
   OCR (tesseract.js, rodando neste processo - o documento não sai do
   servidor), feito sobre a imagem da FRENTE da carteira:

     1. uma passada na imagem inteira acha os rótulos impressos
        (NOME, Nº REGISTRO, VALIDADE, CAT. HAB.);
     2. cada valor é lido na caixa logo abaixo do seu rótulo, como uma
        linha só e com lista restrita de caracteres (só dígitos no
        registro, dígitos e "/" na validade etc.).

   Ancorar nos rótulos, e não em coordenadas fixas, tolera as diferenças
   de layout entre estados, resoluções e os dois modelos de CNH em
   circulação - o antigo (verde) e o novo nacional (com MRZ no verso),
   em que os rótulos mudam de linha (ver findLabels).

   Tudo acontece em memória: o PDF, as imagens decodificadas e o PNG
   entregue ao OCR nunca são gravados em disco, e o tesseract roda com
   cacheMethod:'none'.

   Quem chama (./index.js) só deve fazer isso DEPOIS de conferir a
   assinatura digital: é ela que garante que a imagem lida é a original
   do DETRAN.
   ========================================================= */
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { ECnhError } = require('./errors');

const MIN_FIELD_CONFIDENCE = 70;
const WORKER_IDLE_MS = 5 * 60 * 1000;

const unreadable = () => new ECnhError(
  'Não foi possível ler os dados desta e-CNH com segurança. Exporte o PDF novamente pelo aplicativo ' +
  'Carteira Digital de Trânsito e tente de novo. Se o problema continuar, avise o administrador do sistema.',
  'LEITURA_FALHOU'
);

/* ---------------- PDF -> imagem da carteira ---------------- */

let pdfjsPromise = null;
function loadPdfjs(){
  if(!pdfjsPromise){
    // pdfjs-dist só é distribuído como ES module.
    pdfjsPromise = import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  }
  return pdfjsPromise;
}

// pdfjs devolve as imagens já decodificadas. kind: 1 = cinza 1 bit por pixel
// (linhas alinhadas em byte), 2 = RGB, 3 = RGBA.
function toRgb(image){
  const { width, height, data, kind } = image;
  if(kind === 2) return Buffer.from(data.buffer, data.byteOffset, width * height * 3);
  const rgb = Buffer.alloc(width * height * 3);
  if(kind === 3){
    for(let i = 0, j = 0; i < width * height; i++, j += 4){
      rgb[i * 3] = data[j];
      rgb[i * 3 + 1] = data[j + 1];
      rgb[i * 3 + 2] = data[j + 2];
    }
    return rgb;
  }
  if(kind === 1){
    const rowBytes = Math.ceil(width / 8);
    for(let y = 0; y < height; y++){
      for(let x = 0; x < width; x++){
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        rgb.fill(bit ? 255 : 0, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    return rgb;
  }
  return null;
}

// PNG RGB sem compressão de filtro - só para entregar a imagem ao OCR, em memória.
function encodePng(width, height, rgb){
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for(let y = 0; y < height; y++){
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(typed) >>> 0);
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Imagens com proporção de cartão (ID-1 ≈ 1,42:1) e resolução suficiente
// para OCR. Frente e verso têm o mesmo formato; quem decide qual é a frente
// é a presença dos rótulos (ver readCardFields).
async function extractCardImages(pdfBuffer){
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data:new Uint8Array(pdfBuffer),
    isEvalSupported:false,
    disableFontFace:true,
    useSystemFonts:false,
    enableXfa:false,
    stopAtErrors:true,
    verbosity:0
  });
  const doc = await loadingTask.promise;
  try{
    if(doc.numPages !== 1) throw unreadable();
    const page = await doc.getPage(1);
    const operators = await page.getOperatorList();
    const paintIds = [];
    operators.fnArray.forEach((fn, index) => {
      if(fn === pdfjs.OPS.paintImageXObject) paintIds.push(operators.argsArray[index][0]);
    });

    const images = [];
    for(const id of [...new Set(paintIds)]){
      const store = String(id).startsWith('g_') ? page.commonObjs : page.objs;
      const image = await new Promise(resolve => store.get(id, resolve));
      if(!image || !image.width || !image.height) continue;
      const ratio = image.width / image.height;
      if(image.width < 500 || ratio < 1.3 || ratio > 1.55) continue;
      const rgb = toRgb(image);
      if(!rgb) continue;
      images.push({ width:image.width, height:image.height, png:encodePng(image.width, image.height, rgb) });
    }
    return images;
  }finally{
    await loadingTask.destroy();
  }
}

/* ---------------- OCR ---------------- */

let workerPromise = null;
let idleTimer = null;
let queue = Promise.resolve();

function getWorker(){
  if(!workerPromise){
    const { createWorker, OEM } = require('tesseract.js');
    const por = require('@tesseract.js-data/por');
    workerPromise = createWorker('por', OEM.LSTM_ONLY, {
      langPath:por.langPath,
      gzip:por.gzip,
      cacheMethod:'none',
      logger:() => {},
      errorHandler:() => {}
    }).catch(error => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

// Libera a memória do tesseract (~100 MB) depois de um tempo sem uso.
function scheduleIdleShutdown(){
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const pending = workerPromise;
    workerPromise = null;
    if(pending) pending.then(worker => worker.terminate()).catch(() => {});
  }, WORKER_IDLE_MS);
  idleTimer.unref();
}

// Um worker, um documento por vez - as leituras entram em fila.
function withWorker(task){
  const run = queue.then(async () => {
    const worker = await getWorker();
    try{
      return await task(worker);
    }finally{
      scheduleIdleShutdown();
    }
  });
  queue = run.catch(() => {});
  return run;
}

async function shutdownOcr(){
  clearTimeout(idleTimer);
  const pending = workerPromise;
  workerPromise = null;
  if(pending) await (await pending).terminate();
}

const normalizeWord = text => String(text || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toUpperCase()
  .replace(/[^A-Z]/g, '');

// Palavras na mesma linha de um rótulo (mesma altura, sem ser um valor
// dentro de caixa - esses são bem mais altos que o texto do rótulo).
function rowMates(words, label){
  const labelHeight = label.y1 - label.y0;
  const center = (label.y0 + label.y1) / 2;
  return words
    .filter(word => word !== label &&
      Math.abs((word.y0 + word.y1) / 2 - center) < labelHeight &&
      (word.y1 - word.y0) < labelHeight * 2.5)
    .sort((a, b) => a.x0 - b.x0);
}

// Extensão horizontal do rótulo inteiro ("5 Nº REGISTRO", "2 e 1 NOME E
// SOBRENOME", "4b VALIDADE"...) e onde começa o PRÓXIMO rótulo da mesma
// linha, que limita a caixa do valor à direita. Palavras separadas por menos
// de duas alturas de letra são do mesmo rótulo.
function labelSpan(words, label){
  const maxGap = (label.y1 - label.y0) * 2;
  const row = rowMates(words, label);
  let left = label.x0;
  for(const word of row.filter(item => item.x1 <= left + 1).reverse()){
    if(left - word.x1 > maxGap) break;
    left = Math.min(left, word.x0);
  }
  let right = label.x1;
  let next = null;
  for(const word of row.filter(item => item.x0 >= label.x1 - 1)){
    if(word.x0 - right > maxGap){
      next = word.x0;
      break;
    }
    right = Math.max(right, word.x1);
  }
  return { left, next };
}

// Funciona nos dois modelos de e-CNH:
//  - antigo (verde, até 2022): Nº REGISTRO | VALIDADE | 1ª HABILITAÇÃO na
//    mesma linha, CAT. HAB. acima;
//  - novo (nacional, com MRZ no verso): 4a DATA EMISSÃO | 4b VALIDADE | ACC
//    numa linha e 4d CPF | 5 Nº REGISTRO | 9 CAT HAB na de baixo.
// Por isso nenhuma caixa depende da posição de OUTRO campo: cada uma vai do
// início do seu rótulo até o próximo rótulo da mesma linha.
function findLabels(words){
  const byText = text => words.filter(word => normalizeWord(word.text) === text).sort((a, b) => a.y0 - b.y0);
  const nome = byText('NOME')[0];
  const registro = byText('REGISTRO')[0];
  const validade = byText('VALIDADE')[0];
  // "CAT. HAB." - só a palavra exatamente "HAB" (não "HABILITAÇÃO").
  const categoria = byText('HAB')[0];
  if(!nome || !registro || !validade || !categoria) return null;
  // "1ª HABILITAÇÃO", na mesma linha da validade (modelo antigo).
  const primeiraHabilitacao = byText('HABILITACAO')
    .find(word => Math.abs(word.y0 - validade.y0) < (validade.y1 - validade.y0) * 1.5 && word.x0 > validade.x1);
  const spans = {
    nome:labelSpan(words, nome),
    registro:labelSpan(words, registro),
    validade:labelSpan(words, validade),
    categoria:labelSpan(words, categoria)
  };
  return { nome, registro, validade, categoria, primeiraHabilitacao, spans };
}

const FIELD_WHITELIST = {
  nome:'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÀÂÃÉÊÍÓÔÕÚÜÇ ',
  numero:'0123456789',
  validade:'0123456789/',
  categoria:'ABCDE'
};

// Formato mínimo de cada valor lido - uma leitura fora disso vale uma
// segunda tentativa (ver readField) antes de desistir.
const FIELD_SHAPE = {
  nome:/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]{2,}( [A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]+)+$/,
  numero:/^\d{11}$/,
  validade:/^\d{2}\/\d{2}\/\d{4}$/,
  categoria:/^(A|B|AB|C|D|E|AC|AD|AE)$/
};

// Caixas de valor, relativas aos rótulos. `s` escala as margens pela altura
// da imagem (as medidas de referência são da carteira em 963x680).
function fieldBoxes(labels, width, height){
  const s = height / 680;
  const lineHeight = 40 * s;
  const box = (left, top, right) => {
    const x = Math.max(0, Math.round(left));
    const y = Math.max(0, Math.round(top));
    return {
      left:x,
      top:y,
      width:Math.max(1, Math.min(width, Math.round(right)) - x),
      height:Math.max(1, Math.min(height - y, Math.round(lineHeight)))
    };
  };
  const { nome, registro, validade, categoria, primeiraHabilitacao } = labels;
  const spans = labels.spans || {};
  const leftOf = (label, span, margin) => Math.min(label.x0 - margin * s, (span ? span.left : label.x0) - 15 * s);

  // Direita do número: o próximo rótulo da linha; sem ele, a validade quando
  // está à direita (modelo antigo) ou uma largura fixa.
  const numeroNext = spans.registro && spans.registro.next;
  const numeroRight = numeroNext ? numeroNext - 30 * s
    : validade.x0 > registro.x1 ? validade.x0 - 30 * s
      : registro.x0 + 230 * s;
  const validadeNext = spans.validade && spans.validade.next;
  const validadeRight = primeiraHabilitacao ? primeiraHabilitacao.x0 - 45 * s
    : validadeNext ? validadeNext - 45 * s
      : validade.x0 + 175 * s;
  const nomeNext = spans.nome && spans.nome.next;

  return {
    nome:box(leftOf(nome, spans.nome, 15), nome.y1 + 4 * s, nomeNext ? nomeNext - 30 * s : width * 0.95),
    numero:box(leftOf(registro, spans.registro, 45), registro.y1 + 4 * s, numeroRight),
    validade:box(leftOf(validade, spans.validade, 15), validade.y1 + 4 * s, validadeRight),
    categoria:box(categoria.x0 - 50 * s, categoria.y1 + 4 * s, Math.min(width, categoria.x1 + 25 * s))
  };
}

function flattenWords(data){
  const words = [];
  for(const block of data.blocks || []){
    for(const paragraph of block.paragraphs || []){
      for(const line of paragraph.lines || []){
        for(const word of line.words || []) words.push({ text:word.text, confidence:word.confidence, ...word.bbox });
      }
    }
  }
  return words;
}

const cleanText = text => String(text || '').replace(/\s+/g, ' ').trim();

// Palavras da passada geral que caem dentro da caixa do campo, em ordem de
// leitura, ou null se alguma tiver confiança baixa.
function overviewValue(words, rect){
  const inside = words
    .filter(word => {
      const cx = (word.x0 + word.x1) / 2;
      const cy = (word.y0 + word.y1) / 2;
      return cx >= rect.left && cx <= rect.left + rect.width && cy >= rect.top && cy <= rect.top + rect.height;
    })
    .sort((a, b) => a.x0 - b.x0);
  if(!inside.length || inside.some(word => !(word.confidence >= MIN_FIELD_CONFIDENCE))) return null;
  return cleanText(inside.map(word => word.text).join(' '));
}

// Lê um campo na caixa, como uma linha só e com a lista restrita de
// caracteres. Se essa leitura não sair confiável e no formato esperado, usa o
// que a passada geral (a imagem inteira, sem recorte) leu dentro da mesma
// caixa - no modelo novo a categoria é uma letra só, pequena e vermelha, que
// no recorte isolado o OCR confunde (B vira E), mas no contexto da carteira
// lê certo. Sem nenhuma leitura confiável, devolve null.
async function readField(worker, image, field, rectangle, words){
  const { data } = await worker.recognize(image.png, { rectangle }, { text:true });
  const text = cleanText(data.text);
  if(data.confidence >= MIN_FIELD_CONFIDENCE && FIELD_SHAPE[field].test(text)) return text;

  const fromOverview = overviewValue(words, rectangle);
  if(fromOverview && FIELD_SHAPE[field].test(fromOverview.toUpperCase())) return fromOverview.toUpperCase();

  // Fora do formato mas confiável: a validação de ./index.js decide.
  return data.confidence >= MIN_FIELD_CONFIDENCE ? text : null;
}

// Devolve os valores CRUS lidos da frente da carteira (sem validar o
// formato - isso é com ./index.js), ou lança ECnhError.
async function readFieldsFromImages(images){
  if(!images.length) throw unreadable();

  return withWorker(async worker => {
    const { PSM } = require('tesseract.js');
    for(const image of images){
      // A imagem não traz DPI; sem isto o tesseract estima e escreve um aviso no stderr.
      // Primeiro a segmentação automática (a que sempre leu o modelo antigo);
      // se ela não achar os quatro rótulos, a de texto esparso - no modelo
      // novo os rótulos são miúdos e ficam soltos entre as molduras, e a
      // automática costuma pular a linha "4d CPF | 5 Nº REGISTRO | 9 CAT HAB".
      let labels = null;
      let words = [];
      for(const mode of [PSM.AUTO, PSM.SPARSE_TEXT]){
        await worker.setParameters({ tessedit_char_whitelist:'', tessedit_pageseg_mode:mode, user_defined_dpi:'300' });
        const overview = await worker.recognize(image.png, {}, { blocks:true, text:false });
        words = flattenWords(overview.data);
        labels = findLabels(words);
        if(labels) break;
      }
      if(!labels) continue;

      const values = {};
      const boxes = fieldBoxes(labels, image.width, image.height);
      for(const [field, rectangle] of Object.entries(boxes)){
        await worker.setParameters({
          tessedit_char_whitelist:FIELD_WHITELIST[field],
          tessedit_pageseg_mode:PSM.SINGLE_LINE
        });
        const value = await readField(worker, image, field, rectangle, words);
        if(value === null) throw unreadable();
        values[field] = value;
      }
      return values;
    }
    throw unreadable();
  });
}

async function readCardFields(pdfBuffer){
  return readFieldsFromImages(await extractCardImages(pdfBuffer));
}

module.exports = {
  readCardFields,
  shutdownOcr,
  // Leitura a partir das imagens já extraídas (testes locais com PDFs reais).
  readFieldsFromImages,
  // Expostos para testes.
  findLabels,
  fieldBoxes,
  labelSpan,
  overviewValue
};
