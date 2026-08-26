const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SETTINGS_ENCRYPTION_KEY = 'teste-chave-mestra-de-verificacao';
const { encryptSecret, decryptSecret } = require('../server/secrets');

test('encryptSecret/decryptSecret faz round-trip do valor original', async () => {
  const encoded = await encryptSecret('segredo-super-secreto-123');
  assert.notEqual(encoded, 'segredo-super-secreto-123');
  const decoded = await decryptSecret(encoded);
  assert.equal(decoded, 'segredo-super-secreto-123');
});

test('encryptSecret gera valores diferentes a cada chamada (salt/iv aleatórios)', async () => {
  const a = await encryptSecret('mesmo-valor');
  const b = await encryptSecret('mesmo-valor');
  assert.notEqual(a, b);
});

test('decryptSecret rejeita valor corrompido em vez de devolver texto errado', async () => {
  const encoded = await encryptSecret('valor-original');
  const corrupted = encoded.slice(0, -4) + 'AAAA';
  await assert.rejects(() => decryptSecret(corrupted));
});

test('decryptSecret rejeita formato não reconhecido', async () => {
  await assert.rejects(() => decryptSecret('texto-qualquer-sem-prefixo'));
});
