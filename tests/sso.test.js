const test = require('node:test');
const assert = require('node:assert/strict');
const { ssoConfig } = require('../server/config');

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
