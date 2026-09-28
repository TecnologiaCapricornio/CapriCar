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

   Ancorar nos rótulos, e não em coordenadas fixas, tolera pequenas
   diferenças de layout entre estados e resoluções.

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

function findLabels(words){
  const byText = text => words.filter(word => normalizeWord(word.text) === text).sort((a, b) => a.y0 - b.y0);
  const nome = byText('NOME')[0];
  const registro = byText('REGISTRO')[0];
  const validade = byText('VALIDADE')[0];
  // "CAT. HAB." - só a palavra exatamente "HAB" (não "HABILITAÇÃO").
  const categoria = byText('HAB')[0];
  if(!nome || !registro || !validade || !categoria) return null;
  // "1ª HABILITAÇÃO", na mesma linha da validade, limita a caixa dela à direita.
  const primeiraHabilitacao = byText('HABILITACAO')
    .find(word => Math.abs(word.y0 - validade.y0) < (validade.y1 - validade.y0) * 1.5 && word.x0 > validade.x1);
  return { nome, registro, validade, categoria, primeiraHabilitacao };
}

const FIELD_WHITELIST = {
  nome:'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÀÂÃÉÊÍÓÔÕÚÜÇ ',
  numero:'0123456789',
  validade:'0123456789/',
  categoria:'ABCDE'
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
  return {
    nome:box(nome.x0 - 15 * s, nome.y1 + 4 * s, width * 0.95),
    numero:box(registro.x0 - 45 * s, registro.y1 + 4 * s, validade.x0 - 30 * s),
    validade:box(
      validade.x0 - 15 * s,
      validade.y1 + 4 * s,
      primeiraHabilitacao ? primeiraHabilitacao.x0 - 45 * s : validade.x0 + 175 * s
    ),
    categoria:box(categoria.x0 - 50 * s, categoria.y1 + 4 * s, Math.min(width, categoria.x1 + 25 * s))
  };
}

function flattenWords(data){
  const words = [];
  for(const block of data.blocks || []){
    for(const paragraph of block.paragraphs || []){
      for(const line of paragraph.lines || []){
        for(const word of line.words || []) words.push({ text:word.text, ...word.bbox });
      }
    }
  }
  return words;
}

// Devolve os valores CRUS lidos da frente da carteira (sem validar o
// formato - isso é com ./index.js), ou lança ECnhError.
async function readCardFields(pdfBuffer){
  const images = await extractCardImages(pdfBuffer);
  if(!images.length) throw unreadable();

  return withWorker(async worker => {
    const { PSM } = require('tesseract.js');
    for(const image of images){
      // A imagem não traz DPI; sem isto o tesseract estima e escreve um aviso no stderr.
      await worker.setParameters({ tessedit_char_whitelist:'', tessedit_pageseg_mode:PSM.AUTO, user_defined_dpi:'300' });
      const overview = await worker.recognize(image.png, {}, { blocks:true, text:false });
      const labels = findLabels(flattenWords(overview.data));
      if(!labels) continue;

      const values = {};
      const boxes = fieldBoxes(labels, image.width, image.height);
      for(const [field, rectangle] of Object.entries(boxes)){
        await worker.setParameters({
          tessedit_char_whitelist:FIELD_WHITELIST[field],
          tessedit_pageseg_mode:PSM.SINGLE_LINE
        });
        const { data } = await worker.recognize(image.png, { rectangle }, { text:true });
        if(data.confidence < MIN_FIELD_CONFIDENCE) throw unreadable();
        values[field] = String(data.text || '').replace(/\s+/g, ' ').trim();
      }
      return values;
    }
    throw unreadable();
  });
}

module.exports = {
  readCardFields,
  shutdownOcr,
  // Expostos para testes.
  findLabels,
  fieldBoxes,
  encodePng
};
