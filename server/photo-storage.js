const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const uploadsDir = path.join(__dirname, 'uploads', 'operacoes');
// CNH é documento pessoal: fica em diretório separado das fotos de ocorrência
// para que uma eventual exposição acidental de um diretório não arraste o outro.
const licenseUploadsDir = path.join(__dirname, 'uploads', 'cnh');
const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.(png|jpeg|jpg|gif|webp)$/i;

function extensionForSubtype(subtype){
  if(subtype === 'jpeg' || subtype === 'jpg') return 'jpg';
  return subtype;
}

// Grava a foto já validada (ver decodeImageDataUrl em ./validation) no
// diretório indicado e devolve a chave a salvar na coluna storage_key.
function saveFileTo(dir, buffer, subtype){
  fs.mkdirSync(dir, { recursive:true });
  const storageKey = `${crypto.randomUUID()}.${extensionForSubtype(subtype)}`;
  fs.writeFileSync(path.join(dir, storageKey), buffer);
  return storageKey;
}

// Lê uma foto gravada por saveFileTo. Retorna null se a chave não tiver
// o formato esperado (evita path traversal) ou o arquivo não existir -
// nunca resolve um caminho fora de dir.
function readFileFrom(dir, storageKey){
  if(!STORAGE_KEY_PATTERN.test(String(storageKey || ''))) return null;
  const filePath = path.join(dir, storageKey);
  if(!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return fs.readFileSync(filePath);
}

function deleteFileFrom(dir, storageKey){
  if(!STORAGE_KEY_PATTERN.test(String(storageKey || ''))) return;
  const filePath = path.join(dir, storageKey);
  if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ---- Fotos de ocorrência (retirada/devolução) ----
function savePhotoFile(buffer, subtype){
  return saveFileTo(uploadsDir, buffer, subtype);
}

function readPhotoFile(storageKey){
  return readFileFrom(uploadsDir, storageKey);
}

function deletePhotoFile(storageKey){
  deleteFileFrom(uploadsDir, storageKey);
}

// ---- Fotos de CNH ----
function saveLicensePhotoFile(buffer, subtype){
  return saveFileTo(licenseUploadsDir, buffer, subtype);
}

function readLicensePhotoFile(storageKey){
  return readFileFrom(licenseUploadsDir, storageKey);
}

function deleteLicensePhotoFile(storageKey){
  deleteFileFrom(licenseUploadsDir, storageKey);
}

module.exports = {
  uploadsDir,
  licenseUploadsDir,
  savePhotoFile,
  readPhotoFile,
  deletePhotoFile,
  saveLicensePhotoFile,
  readLicensePhotoFile,
  deleteLicensePhotoFile
};
