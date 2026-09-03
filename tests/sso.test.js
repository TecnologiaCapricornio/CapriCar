const test = require('node:test');
const assert = require('node:assert/strict');
const { ssoConfig, loginMethodConfig } = require('../server/config');

test('SSO fica desabilitado quando as variáveis do Entra ID não estão definidas', () => {
  delete process.env.ENTRA_TENANT_ID;
  delete process.env.ENTRA_CLIENT_ID;
  delete process.env.ENTRA_CLIENT_SECRET;
  const config = ssoConfig();
  assert.equal(config.enabled, false);
});

test('SSO fica habilitado quando tenant, client id e secret estão definidos', () => {
  process.env.ENTRA_TENANT_ID = 'tenant-teste';
  process.env.ENTRA_CLIENT_ID = 'client-teste';
  process.env.ENTRA_CLIENT_SECRET = 'segredo-teste';
  const config = ssoConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.tenantId, 'tenant-teste');
  delete process.env.ENTRA_TENANT_ID;
  delete process.env.ENTRA_CLIENT_ID;
  delete process.env.ENTRA_CLIENT_SECRET;
});

test('redirectUri usa localhost como padrão quando ENTRA_REDIRECT_URI não está definida', () => {
  delete process.env.ENTRA_REDIRECT_URI;
  const config = ssoConfig();
  assert.equal(config.redirectUri, 'http://localhost:3000/api/auth/sso/callback');
});

test('LOGIN_METHOD indefinida cai em "both" - os dois métodos habilitados', () => {
  delete process.env.LOGIN_METHOD;
  const config = loginMethodConfig();
  assert.equal(config.method, 'both');
  assert.equal(config.localEnabled, true);
  assert.equal(config.entraEnabled, true);
});

test('LOGIN_METHOD=local desabilita o login via Microsoft, mantém o local', () => {
  process.env.LOGIN_METHOD = 'local';
  const config = loginMethodConfig();
  assert.equal(config.localEnabled, true);
  assert.equal(config.entraEnabled, false);
  delete process.env.LOGIN_METHOD;
});

test('LOGIN_METHOD=entra desabilita o login local, mantém o Microsoft', () => {
  process.env.LOGIN_METHOD = 'entra';
  const config = loginMethodConfig();
  assert.equal(config.localEnabled, false);
  assert.equal(config.entraEnabled, true);
  delete process.env.LOGIN_METHOD;
});

test('LOGIN_METHOD com valor desconhecido cai em "both" em vez de travar o login', () => {
  process.env.LOGIN_METHOD = 'qualquer-coisa';
  const config = loginMethodConfig();
  assert.equal(config.method, 'both');
  assert.equal(config.localEnabled, true);
  assert.equal(config.entraEnabled, true);
  delete process.env.LOGIN_METHOD;
});

test('LOGIN_METHOD não diferencia maiúsculas/minúsculas', () => {
  process.env.LOGIN_METHOD = 'ENTRA';
  const config = loginMethodConfig();
  assert.equal(config.method, 'entra');
  assert.equal(config.entraEnabled, true);
  assert.equal(config.localEnabled, false);
  delete process.env.LOGIN_METHOD;
});
