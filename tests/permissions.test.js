const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elementStub() {
  return {
    value: '',
    textContent: '',
    classList: { add() { }, remove() { }, toggle() { } },
    addEventListener() { },
    reset() { },
    querySelectorAll() { return []; }
  };
}

function loadPermissions() {
  const data = new Map();
  const elements = new Map();
  const context = vm.createContext({
    JSON,
    localStorage: {
      getItem(key) { return data.has(key) ? data.get(key) : null; },
      setItem(key, value) { data.set(key, String(value)); },
      removeItem(key) { data.delete(key); }
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, elementStub());
        return elements.get(id);
      },
      addEventListener() { },
      querySelectorAll() { return []; }
    },
    USER_KEY: 'capricar_user',
    USERS_KEY: 'capricar_usuarios'
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'auth.js' });
  return context;
}

test('administrador mantém acesso a todas as seções', () => {
  const app = loadPermissions();
  app.setCurrentUser({ nome: 'admin', role: 'admin', isAdmin: true });
  ['reservas', 'locais', 'veiculos', 'bloqueios', 'manutencao', 'auditoria', 'regras', 'usuarios'].forEach(section => {
    assert.equal(app.canAccessAdminSection(section), true);
  });
});

test('usuário com permissões de frota acessa somente as áreas marcadas (sem papel especial)', () => {
  const app = loadPermissions();
  app.setCurrentUser({
    id: 'gestor-frota-id',
    username: 'gestor.frota',
    nome: 'Gestor de Frota',
    role: 'user',
    permissions: { reservations: true, branches: true, fleet: true, blocks: true, reports: true }
  });
  ['reservas', 'locais', 'veiculos', 'bloqueios'].forEach(section => {
    assert.equal(app.canAccessAdminSection(section), true);
  });
  // "Manutenção" tem permissão própria (can_manage_maintenance), separada de
  // "Veículos" (fleet) - fleet:true sozinho não dá acesso a ela.
  ['manutencao', 'auditoria', 'regras', 'usuarios'].forEach(section => {
    assert.equal(app.canAccessAdminSection(section), false);
  });
  assert.equal(app.canManageReservations(), true);
  assert.equal(app.canManageBranches(), true);
  assert.equal(app.canManageFleet(), true);
  assert.equal(app.canManageMaintenance(), false);
  assert.equal(app.canManageBlocks(), true);
  assert.equal(app.canViewReports(), true);
  assert.equal(app.canViewAudit(), false);
  assert.equal(app.canManageRules(), false);
  assert.equal(app.canManageUsers(), false);
  assert.equal(app.isAdmin(), false);
});

// Os indicadores/relatório/exportação que antes ficavam na aba própria
// "Relatórios" agora moram dentro de "Reservas" (ver renderAdminSection em
// js/management-config.js) - por isso a permissão "reports", sozinha, já
// precisa liberar essa aba, mesmo sem "reservations".
test('permissão de relatórios, sozinha, dá acesso à aba Reservas (onde os indicadores/exportação agora moram)', () => {
  const app = loadPermissions();
  app.setCurrentUser({
    nome: 'Analista de relatórios',
    role: 'user',
    permissions: { reports: true }
  });
  assert.equal(app.canAccessAdminSection('reservas'), true);
  assert.equal(app.canViewReports(), true);
  assert.equal(app.canManageReservations(), false);
  // As demais seções continuam exigindo sua permissão própria.
  assert.equal(app.canAccessAdminSection('locais'), false);
  assert.equal(app.canAccessAdminSection('veiculos'), false);
});

test('permissão de manutenção é independente da permissão de veículos', () => {
  const app = loadPermissions();
  app.setCurrentUser({
    id: 'gestor-manutencao-id',
    username: 'gestor.manutencao',
    nome: 'Gestor de Manutenção',
    role: 'user',
    permissions: { maintenance: true }
  });
  assert.equal(app.canAccessAdminSection('manutencao'), true);
  assert.equal(app.canManageMaintenance(), true);
  assert.equal(app.canManageFleet(), false);
  assert.equal(app.canAccessAdminSection('veiculos'), false);
});

test('usuário comum não acessa o painel de gestão', () => {
  const app = loadPermissions();
  app.setCurrentUser({ nome: 'usuario', role: 'user', isAdmin: false });
  assert.equal(app.canAccessManagement(), false);
  assert.equal(app.canAccessAdminSection('reservas'), false);
});

test('permissões atualizadas mudam o acesso do usuário', () => {
  const app = loadPermissions();
  const account = app.normalizeSystemUser({
    id: 'user-teste',
    username: 'gestor.teste',
    nome: 'Gestor Teste',
    role: 'user',
    active: true,
    permissions: { reservations: true, branches: false, fleet: false, blocks: false, reports: true, audit: true, rules: false, users: true }
  });
  app.setCurrentUser(app.accountToSession(account));
  assert.equal(app.canManageReservations(), true);
  assert.equal(app.canManageBranches(), false);
  assert.equal(app.canManageFleet(), false);
  assert.equal(app.canViewReports(), true);
  assert.equal(app.canViewAudit(), true);
  assert.equal(app.canManageRules(), false);
  assert.equal(app.canManageUsers(), true);

  account.permissions = { reservations: false, branches: true, fleet: true, blocks: true, reports: false, audit: false, rules: true, users: false };
  app.setCurrentUser(app.accountToSession(account));
  assert.equal(app.canManageReservations(), false);
  assert.equal(app.canManageBranches(), true);
  assert.equal(app.canManageFleet(), true);
  assert.equal(app.canManageBlocks(), true);
  assert.equal(app.canViewReports(), false);
  assert.equal(app.canViewAudit(), false);
  assert.equal(app.canManageRules(), true);
  assert.equal(app.canManageUsers(), false);
});

test('novas permissões liberam somente suas áreas correspondentes', () => {
  const app = loadPermissions();
  app.setCurrentUser({
    nome: 'Gestor especializado',
    role: 'user',
    permissions: { audit: true, rules: true, users: true }
  });
  assert.equal(app.canAccessManagement(), true);
  assert.equal(app.canAccessAdminSection('auditoria'), true);
  assert.equal(app.canAccessAdminSection('regras'), true);
  assert.equal(app.canAccessAdminSection('usuarios'), true);
  assert.equal(app.canAccessAdminSection('reservas'), false);
});
