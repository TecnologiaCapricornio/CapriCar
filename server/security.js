const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password){
  const value = String(password || '');
  if(value.length < 8 || value.length > 128){
    throw new Error('A senha deve ter entre 8 e 128 caracteres.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(value, salt, 64);
  return 'scrypt$' + salt + '$' + Buffer.from(derived).toString('hex');
}

async function verifyPassword(password, encoded){
  const [algorithm, salt, expectedHex] = String(encoded || '').split('$');
  if(algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const derived = Buffer.from(await scrypt(String(password || ''), salt, 64));
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function createSessionToken(){
  return crypto.randomBytes(32).toString('base64url');
}

function hashSessionToken(token){
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

module.exports = { hashPassword, verifyPassword, createSessionToken, hashSessionToken };
