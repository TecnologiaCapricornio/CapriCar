const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Banco falso no lugar de server/db.js: nada aqui encosta no PostgreSQL. A
// consulta de usuários devolve só as colunas que o SELECT nomeia, como o
// banco faria - assim uma coluna esquecida (o bug do can_manage_checklist
// no bootstrap) aparece como permissão `false` e o teste falha.
const FULL_USER_ROWS = [
  {
    id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    username:'maria', display_name:'Maria', email:'maria@example.com',
    role:'user', active:true, auth_provider:'local',
    can_manage_reservations:true, can_manage_branches:false, can_manage_fleet:true,
    can_manage_maintenance:false, can_manage_blocks:true, can_view_reports:false,
    can_view_audit:true, can_manage_rules:false, can_manage_users:true, can_manage_groups:true,
    can_manage_integrations:false, can_manage_checklist:true,
    cost_center:'CC-100', created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-02T00:00:00Z'
  },
  {
    id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    username:'joao', display_name:'João', email:null,
    role:'user', active:false, auth_provider:'entra',
    can_manage_reservations:false, can_manage_branches:true, can_manage_fleet:false,
    can_manage_maintenance:true, can_manage_blocks:false, can_view_reports:true,
    can_view_audit:false, can_manage_rules:true, can_manage_users:false, can_manage_groups:false,
    can_manage_integrations:true, can_manage_checklist:false,
    cost_center:null, created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-02T00:00:00Z'
  }
];

function project(row, sql){
  return Object.fromEntries(Object.entries(row).filter(([column]) =>
    new RegExp('\\b' + column + '\\b').test(sql)));
}

async function fakeQuery(sql){
  if(/FROM users/.test(sql) && /can_manage_reservations/.test(sql)){
    return { rows:FULL_USER_ROWS.map(row => project(row, sql)) };
  }
  return { rows:[] };
}

require.cache[path.resolve(__dirname, '../server/db.js')] = {
  id:path.resolve(__dirname, '../server/db.js'),
  filename:path.resolve(__dirname, '../server/db.js'),
  loaded:true,
  exports:{
    query:fakeQuery,
    withTransaction:async callback => callback({ query:fakeQuery }),
    getPool:() => { throw new Error('banco real não deve ser usado nos testes'); },
    closePool:async () => {}
  }
};

const stateRouter = require('../server/routes/state');
const usersRouter = require('../server/routes/users');

const ALL_PERMISSIONS = {
  reservations:true, branches:true, fleet:true, maintenance:true, blocks:true, reports:true,
  audit:false, rules:true, users:true, groups:true, integrations:true, checklist:true
};
const manager = { id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc', role:'user', permissions:ALL_PERMISSIONS, grupos:[] };

function routeHandlers(router, method, routePath){
  const layer = router.stack.find(item =>
    item.route && item.route.path === routePath && item.route.methods[method]);
  assert.ok(layer, `rota ${method.toUpperCase()} ${routePath} não encontrada`);
  const middlewares = router.stack.filter(item => !item.route).map(item => item.handle);
  return [...middlewares, ...layer.route.stack.map(item => item.handle)];
}

async function call(router, method, routePath){
  const req = { method:method.toUpperCase(), user:manager, params:{}, query:{}, headers:{}, body:{} };
  let payload;
  const res = {
    statusCode:200,
    setHeader(){},
    status(code){ this.statusCode = code; return this; },
    json(body){ payload = body; return this; }
  };
  for(const handler of routeHandlers(router, method, routePath)){
    let advanced = false;
    await handler(req, res, () => { advanced = true; });
    if(!advanced) break;
  }
  assert.equal(res.statusCode, 200);
  return payload;
}

test('bootstrap e /api/users devolvem os mesmos usuários e permissões', async () => {
  const bootstrap = await call(stateRouter, 'get', '/bootstrap');
  const listing = await call(usersRouter, 'get', '/');

  assert.deepEqual(bootstrap.users, listing.users);
  assert.equal(bootstrap.users.length, FULL_USER_ROWS.length);
});

test('bootstrap expõe todas as permissões, inclusive checklist', async () => {
  const bootstrap = await call(stateRouter, 'get', '/bootstrap');
  const [maria, joao] = bootstrap.users;

  assert.deepEqual(Object.keys(maria.permissions).sort(), Object.keys(ALL_PERMISSIONS).sort());
  assert.equal(maria.permissions.checklist, true);
  assert.equal(joao.permissions.checklist, false);
  assert.equal(joao.permissions.integrations, true);
  assert.equal(maria.permissions.groups, true);
  assert.equal(joao.permissions.groups, false);
  // O PATCH da tela de edição reenvia o centro de custo; se o bootstrap não
  // trouxesse, salvar o usuário apagaria o valor.
  assert.equal(maria.centroCusto, 'CC-100');
});
