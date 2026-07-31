const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elementStub(){
  return {
    value:'',
    textContent:'',
    classList:{ add(){}, remove(){}, toggle(){} },
    addEventListener(){},
    reset(){},
    querySelectorAll(){ return []; }
  };
}

function loadPermissions(){
  const data = new Map();
  const elements = new Map();
  const context = vm.createContext({
    JSON,
    localStorage:{
      getItem(key){ return data.has(key) ? data.get(key) : null; },
      setItem(key, value){ data.set(key, String(value)); },
      removeItem(key){ data.delete(key); }
    },
    document:{
      getElementById(id){
        if(!elements.has(id)) elements.set(id, elementStub());
        return elements.get(id);
      },
      addEventListener(){},
      querySelectorAll(){ return []; }
    },
    USER_KEY:'capricar_user',
    USERS_KEY:'capricar_usuarios'
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
  vm.runInContext(source, context, { filename:'auth.js' });
  return context;
}

test('administrador mantém acesso a todas as seções', () => {
  const app = loadPermissions();
  app.setCurrentUser({ nome:'admin', role:'admin', isAdmin:true });
  ['reservas','frota','bloqueios','auditoria','relatorios','regras'].forEach(section => {
    assert.equal(app.canAccessAdminSection(section), true);
  });
});

test('Facilities acessa somente as quatro áreas permitidas', () => {
  const app = loadPermissions();
  app.setCurrentUser({
    id:'facilities-id',
    username:'facilities',
    nome:'Facilities',
    role:'facilities',
    permissions:{ reservations:true, fleet:true, blocks:true, reports:true }
  });
  ['reservas','frota','bloqueios','relatorios'].forEach(section => {
    assert.equal(app.canAccessAdminSection(section), true);
  });
  ['auditoria','regras'].forEach(section => {
    assert.equal(app.canAccessAdminSection(section), false);
  });
  assert.equal(app.canManageReservations(), true);
  assert.equal(app.canManageFleet(), true);
  assert.equal(app.canManageBlocks(), true);
  assert.equal(app.canViewReports(), true);
  assert.equal(app.isAdmin(), false);
});

test('usuário comum não acessa o painel de gestão', () => {
  const app = loadPermissions();
  app.setCurrentUser({ nome:'usuario', role:'user', isAdmin:false });
  assert.equal(app.canAccessManagement(), false);
  assert.equal(app.canAccessAdminSection('reservas'), false);
});

test('permissões atualizadas mudam o acesso do usuário', () => {
  const app = loadPermissions();
  const account = app.normalizeSystemUser({
    id:'user-teste',
    username:'gestor.teste',
    nome:'Gestor Teste',
    role:'user',
    active:true,
    permissions:{ reservations:true, fleet:false, blocks:false, reports:true }
  });
  app.setCurrentUser(app.accountToSession(account));
  assert.equal(app.canManageReservations(), true);
  assert.equal(app.canManageFleet(), false);
  assert.equal(app.canViewReports(), true);

  account.permissions = { reservations:false, fleet:true, blocks:true, reports:false };
  app.setCurrentUser(app.accountToSession(account));
  assert.equal(app.canManageReservations(), false);
  assert.equal(app.canManageFleet(), true);
  assert.equal(app.canManageBlocks(), true);
  assert.equal(app.canViewReports(), false);
});
