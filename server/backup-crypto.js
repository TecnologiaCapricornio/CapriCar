const crypto = require('node:crypto');
const fs = require('node:fs');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const MAGIC = Buffer.from('CAPRICARBKP1');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

async function deriveKey(passphrase, salt){
  return scrypt(String(passphrase), salt, KEY_LENGTH);
}

// Formato do arquivo: MAGIC || salt || iv || authTag || ciphertext
async function encryptFile(inputPath, outputPath, passphrase){
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = fs.readFileSync(inputPath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  fs.writeFileSync(outputPath, Buffer.concat([MAGIC, salt, iv, authTag, ciphertext]));
}

async function decryptFile(inputPath, outputPath, passphrase){
  const data = fs.readFileSync(inputPath);
  const magic = data.subarray(0, MAGIC.length);
  if(!magic.equals(MAGIC)){
    throw new Error('Arquivo não é um backup criptografado reconhecido pelo CapriCar.');
  }
  let offset = MAGIC.length;
  const salt = data.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH;
  const iv = data.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
  const authTag = data.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
  const ciphertext = data.subarray(offset);
  const key = await deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  fs.writeFileSync(outputPath, plaintext);
}

module.exports = { encryptFile, decryptFile };
