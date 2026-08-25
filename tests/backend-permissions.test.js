const test = require('node:test');
const assert = require('node:assert/strict');
const { permissionsFromRow, requirePermission } = require('../server/auth');

test('backend expõe as oito permissões do usuário', () => {
  assert.deepEqual(permissionsFromRow({
    can_manage_reservations: true,
    can_manage_branches: false,
    can_manage_fleet: false,
    can_manage_blocks: true,
    can_view_reports: false,
    can_view_audit: true,
    can_manage_rules: true,
    can_manage_users: false
  }), {
    reservations: true,
    branches: false,
    fleet: false,
    blocks: true,
    reports: false,
    audit: true,
    rules: true,
    users: false
  });
});

test('backend autoriza somente a permissão solicitada', () => {
  let advanced = false;
  const middleware = requirePermission('users');
  middleware({ user: { role: 'user', permissions: { users: true } } }, {}, () => { advanced = true; });
  assert.equal(advanced, true);

  let responseStatus = 0;
  const response = {
    status(status) { responseStatus = status; return this; },
    json(payload) { return payload; }
  };
  middleware({ user: { role: 'user', permissions: { users: false } } }, response, () => { });
  assert.equal(responseStatus, 403);
});
