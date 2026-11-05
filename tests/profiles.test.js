const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROFILE_KEYS,
  normalizeProfile,
  isValidProfile,
  permissionsForProfile,
  userProfile,
  isPortariaUser,
  canMakeReservations
} = require('../server/profiles');

const ALL_KEYS = [
  'reservations', 'branches', 'fleet', 'maintenance', 'blocks', 'reports',
  'audit', 'rules', 'users', 'groups', 'integrations', 'checklist'
];

test('são exatamente três perfis', () => {
  assert.deepEqual(PROFILE_KEYS, ['usuario', 'gestao', 'portaria']);
});

test('perfil desconhecido ou vazio vira Usuário', () => {
  assert.equal(normalizeProfile(''), 'usuario');
  assert.equal(normalizeProfile(null), 'usuario');
  assert.equal(normalizeProfile('superusuario'), 'usuario');
  assert.equal(normalizeProfile(' GESTAO '), 'gestao');
  assert.equal(isValidProfile('superusuario'), false);
  assert.equal(isValidProfile('portaria'), true);
});

test('Usuário não tem nenhuma permissão de gestão', () => {
  const permissions = permissionsForProfile('usuario');
  assert.deepEqual(Object.keys(permissions).sort(), [...ALL_KEYS].sort());
  assert.ok(ALL_KEYS.every(key => permissions[key] === false));
});

test('Gestão tem todas as permissões', () => {
  const permissions = permissionsForProfile('gestao');
  assert.ok(ALL_KEYS.every(key => permissions[key] === true));
});

test('Portaria tem só o Checklist', () => {
  const permissions = permissionsForProfile('portaria');
  assert.equal(permissions.checklist, true);
  assert.ok(ALL_KEYS.filter(key => key !== 'checklist').every(key => permissions[key] === false));
});

test('admin conta como Gestão; Portaria não reserva', () => {
  assert.equal(userProfile({ role:'admin', perfil:'usuario' }), 'gestao');
  assert.equal(userProfile({ role:'user', perfil:'portaria' }), 'portaria');
  assert.equal(isPortariaUser({ role:'user', perfil:'portaria' }), true);
  assert.equal(isPortariaUser({ role:'admin', perfil:'portaria' }), false);
  assert.equal(canMakeReservations({ role:'user', perfil:'portaria' }), false);
  assert.equal(canMakeReservations({ role:'user', perfil:'usuario' }), true);
  assert.equal(canMakeReservations({ role:'user', perfil:'gestao' }), true);
  assert.equal(canMakeReservations(null), false);
});
