const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashSessionToken
} = require('../server/security');

async function run(){
  const password = 'Senha-Forte-Teste@2026';
  const encoded = await hashPassword(password);

  assert.match(encoded, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword('senha-incorreta', encoded), false);
  assert.equal(await verifyPassword(password, 'formato-inválido'), false);
  await assert.rejects(() => hashPassword('1234567'), /8 e 128/);
  await assert.rejects(() => hashPassword('x'.repeat(129)), /8 e 128/);

  const firstToken = createSessionToken();
  const secondToken = createSessionToken();
  assert.notEqual(firstToken, secondToken);
  assert.equal(hashSessionToken(firstToken).length, 64);
  assert.notEqual(hashSessionToken(firstToken), hashSessionToken(secondToken));

  console.log('7 testes de segurança do backend passaram.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
