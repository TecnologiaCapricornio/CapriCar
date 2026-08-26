const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const PREFIX = 'capricar-secret-v1:';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function encryptionKey(){
  const key = String(process.env.SETTINGS_ENCRYPTION_KEY || '').trim();
  if(!key){
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY não está definida no .env. Configure-a antes de salvar credenciais de integração.'
    );
  }
  return key;
}

async function deriveKey(passphrase, salt){
  return scrypt(passphrase, salt, KEY_LENGTH);
}

async function encryptSecret(plaintext){
  const passphrase = encryptionKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([salt, iv, authTag, ciphertext]);
  return PREFIX + payload.toString('base64');
}

async function decryptSecret(encoded){
  const passphrase = encryptionKey();
  const value = String(encoded || '');
  if(!value.startsWith(PREFIX)){
    throw new Error('Valor cifrado em formato não reconhecido.');
  }
  const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
  let offset = 0;
  const salt = payload.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH;
  const iv = payload.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
  const authTag = payload.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
  const ciphertext = payload.subarray(offset);
  const key = await deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
