const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const uploadsDir = path.join(__dirname, 'uploads', 'operacoes');
const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.(png|jpeg|jpg|gif|webp)$/i;

function extensionForSubtype(subtype){
  if(subtype === 'jpeg' || subtype === 'jpg') return 'jpg';
  return subtype;
}

// Grava a foto já validada (ver decodeImageDataUrl em ./validation) em
// server/uploads/operacoes e devolve a chave a salvar em
// operation_photos.storage_key.
function savePhotoFile(buffer, subtype){
  fs.mkdirSync(uploadsDir, { recursive:true });
  const storageKey = `${crypto.randomUUID()}.${extensionForSubtype(subtype)}`;
  fs.writeFileSync(path.join(uploadsDir, storageKey), buffer);
  return storageKey;
}

// Lê uma foto gravada por savePhotoFile. Retorna null se a chave não tiver
// o formato esperado (evita path traversal) ou o arquivo não existir -
// nunca resolve um caminho fora de uploadsDir.
function readPhotoFile(storageKey){
  if(!STORAGE_KEY_PATTERN.test(String(storageKey || ''))) return null;
  const filePath = path.join(uploadsDir, storageKey);
  if(!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return fs.readFileSync(filePath);
}

function deletePhotoFile(storageKey){
  if(!STORAGE_KEY_PATTERN.test(String(storageKey || ''))) return;
  const filePath = path.join(uploadsDir, storageKey);
  if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

module.exports = { uploadsDir, savePhotoFile, readPhotoFile, deletePhotoFile };
