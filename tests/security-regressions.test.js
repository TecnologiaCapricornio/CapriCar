const test = require('node:test');
const assert = require('node:assert/strict');
const { storedPasswordApplies } = require('../server/mailer');
const { accountChangeRefusal } = require('../server/user-guards');
const { findAvailableUsername } = require('../server/sso');

const stored = { host:'smtp.capricornio.com.br', port:587, security:'starttls', username:'avisos' };

test('senha SMTP salva só vale para o mesmo servidor, porta, segurança e usuário', () => {
  const same = { host:'smtp.capricornio.com.br', port:'587', security:'starttls', username:'avisos' };
  assert.equal(storedPasswordApplies(stored, same), true);
  assert.equal(storedPasswordApplies(stored, { ...same, host:'evil.example.com' }), false);
  assert.equal(storedPasswordApplies(stored, { ...same, port:25 }), false);
  assert.equal(storedPasswordApplies(stored, { ...same, security:'none' }), false);
  assert.equal(storedPasswordApplies(stored, { ...same, username:'outro' }), false);
  assert.equal(storedPasswordApplies(null, same), false);
});

const manager = { id:'u1', role:'user' };
const admin = { id:'a1', role:'admin' };
const plainTarget = { id:'u2', role:'user', can_manage_users:false, can_manage_integrations:false };
const managerTarget = { id:'u3', role:'user', can_manage_users:true, can_manage_integrations:false };

test('gestor não altera as próprias permissões', () => {
  const refusal = accountChangeRefusal(manager, { ...plainTarget, id:'u1' }, {
    isSelf:true, permissionsChanged:true, passwordChanged:false
  });
  assert.match(refusal, /próprias permissões/);
  assert.equal(accountChangeRefusal(manager, { ...plainTarget, id:'u1' }, {
    isSelf:true, permissionsChanged:false, passwordChanged:true
  }), null);
});

test('gestor não troca senha ou permissões de outro gestor, mas edita usuário comum', () => {
  assert.match(accountChangeRefusal(manager, managerTarget, {
    isSelf:false, permissionsChanged:false, passwordChanged:true
  }), /somente|Só o administrador/);
  assert.match(accountChangeRefusal(manager, managerTarget, {
    isSelf:false, permissionsChanged:true, passwordChanged:false
  }), /Só o administrador/);
  assert.equal(accountChangeRefusal(manager, plainTarget, {
    isSelf:false, permissionsChanged:true, passwordChanged:true
  }), null);
});

test('admin não tem restrição nestas regras', () => {
  assert.equal(accountChangeRefusal(admin, managerTarget, {
    isSelf:false, permissionsChanged:true, passwordChanged:true
  }), null);
  assert.equal(accountChangeRefusal(admin, { ...plainTarget, id:'a1' }, {
    isSelf:true, permissionsChanged:true, passwordChanged:false
  }), null);
});

function fakeClient(row){
  return { query: async () => ({ rows: row ? [row] : [] }) };
}

test('nome igual de outro usuário Entra (outro domínio) recebe sufixo do oid', async () => {
  const client = fakeClient({
    username:'maria.silva', auth_provider:'entra', entra_object_id:'aaaaaaaa-0000-0000-0000-000000000000'
  });
  const name = await findAvailableUsername(client, 'maria.silva@sul.com.br', 'bbbbbbbb-1111-2222-3333-444444444444');
  assert.equal(name, 'maria.silva-bbbbbb');
});

test('mesmo usuário Entra reimportado reutiliza o nome', async () => {
  const oid = 'aaaaaaaa-0000-0000-0000-000000000000';
  const client = fakeClient({ username:'maria.silva', auth_provider:'entra', entra_object_id:oid });
  assert.equal(await findAvailableUsername(client, 'maria.silva@norte.com.br', oid), 'maria.silva');
});

test('conta local com o mesmo nome nunca é reaproveitada', async () => {
  const client = fakeClient({ username:'maria.silva', auth_provider:'local', entra_object_id:null });
  assert.equal(await findAvailableUsername(client, 'maria.silva@norte.com.br', 'bbbbbbbb-1111-2222-3333-444444444444'), 'maria.silva-bbbbbb');
});

test('nome livre é devolvido como está', async () => {
  assert.equal(await findAvailableUsername(fakeClient(null), 'maria.silva@norte.com.br', 'x'), 'maria.silva');
});

test('janela de listagem começa 365 dias antes de agora', () => {
  const { listWindowStart } = require('../server/reservations-store');
  const now = Date.parse('2026-06-01T12:00:00Z');
  assert.equal(listWindowStart(now).toISOString(), '2025-06-01T12:00:00.000Z');
});
