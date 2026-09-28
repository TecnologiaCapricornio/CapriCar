const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canSeeVehicle,
  canDriveVehicle,
  isRestrictedVehicle,
  hasAnyManagementPermission,
  vehicleGroupNames,
  indexVehicles,
  vehicleForReservation
} = require('../server/vehicle-access');
const { validateVehicles, validateReservations } = require('../server/validation');
const { validateGroupInput } = require('../server/groups');
const { changedBlocks, reservationsAffectedByBlock } = require('../server/notifications');
const { publicReservationVisible } = require('../server/reservations-store');

const GRUPO_AT = '11111111-1111-4111-8111-111111111111';
const GRUPO_DIR = '22222222-2222-4222-8222-222222222222';
const MEMBRO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const noPermissions = {
  reservations:false, branches:false, fleet:false, maintenance:false, blocks:false,
  reports:false, audit:false, rules:false, users:false, groups:false, integrations:false, checklist:false
};
const user = (grupos, permissions, role) => ({ id:'u', role:role || 'user', permissions:{ ...noPermissions, ...(permissions || {}) }, grupos });

const carroDeTodos = { id:'v1', local:'Matriz', codigo:'ABC1D23', placa:'ABC1D23', marca:'Fiat', modelo:'Strada', capacidade:2, ativo:true };
const carroAT = { ...carroDeTodos, id:'v2', codigo:'XYZ9K88', placa:'XYZ9K88', grupos:[GRUPO_AT] };

/* ---------------- Regra de acesso ---------------- */

test('veículo sem grupos é de todos', () => {
  assert.equal(isRestrictedVehicle(carroDeTodos), false);
  assert.equal(isRestrictedVehicle({ ...carroDeTodos, grupos:[] }), false);
  assert.equal(canSeeVehicle(carroDeTodos, user([])), true);
  assert.equal(canDriveVehicle(carroDeTodos, []), true);
});

test('veículo restrito: membro vê e dirige, não-membro não', () => {
  assert.equal(canSeeVehicle(carroAT, user([GRUPO_AT])), true);
  assert.equal(canDriveVehicle(carroAT, [GRUPO_AT]), true);
  assert.equal(canSeeVehicle(carroAT, user([GRUPO_DIR])), false);
  assert.equal(canDriveVehicle(carroAT, [GRUPO_DIR]), false);
  assert.equal(canSeeVehicle(carroAT, user(undefined)), false);
});

test('membro de qualquer um dos grupos do veículo tem acesso', () => {
  const carroDoisGrupos = { ...carroAT, grupos:[GRUPO_AT, GRUPO_DIR] };
  assert.equal(canDriveVehicle(carroDoisGrupos, new Set([GRUPO_DIR])), true);
});

test('gestão enxerga o veículo restrito, mas só membro dirige', () => {
  for(const permission of ['fleet', 'blocks', 'maintenance', 'reservations', 'reports', 'checklist', 'groups']){
    const gestor = user([], { [permission]:true });
    assert.equal(hasAnyManagementPermission(gestor), true, permission);
    assert.equal(canSeeVehicle(carroAT, gestor), true, permission);
    assert.equal(canDriveVehicle(carroAT, gestor.grupos), false, permission);
  }
  assert.equal(canSeeVehicle(carroAT, user([], {}, 'admin')), true);
});

test('nomes dos grupos para exibição', () => {
  const groups = [{ id:GRUPO_AT, nome:'Assistência técnica' }, { id:GRUPO_DIR, nome:'Diretoria' }];
  assert.equal(vehicleGroupNames({ grupos:[GRUPO_AT, GRUPO_DIR] }, groups), 'Assistência técnica, Diretoria');
});

test('reserva aponta para o veículo pelo par local + código, sem diferenciar maiúsculas', () => {
  const index = indexVehicles([carroDeTodos, carroAT]);
  assert.equal(vehicleForReservation({ partida:'matriz', carro:'xyz9k88' }, index), carroAT);
  assert.equal(vehicleForReservation({ partida:'Outra', carro:'XYZ9K88' }, index), null);
});

/* ---------------- Reserva de outros (projeção pública) ---------------- */

test('reserva alheia em veículo restrito some para quem não pode ver o veículo', () => {
  const index = indexVehicles([carroDeTodos, carroAT]);
  const reservaAT = { partida:'Matriz', carro:'XYZ9K88' };
  const reservaComum = { partida:'Matriz', carro:'ABC1D23' };
  assert.equal(publicReservationVisible(reservaAT, user([]), index), false);
  assert.equal(publicReservationVisible(reservaAT, user([GRUPO_AT]), index), true);
  assert.equal(publicReservationVisible(reservaComum, user([]), index), true);
  // Veículo que já não existe na frota: não há regra a aplicar.
  assert.equal(publicReservationVisible({ partida:'Matriz', carro:'SUMIU00' }, user([]), index), true);
});

/* ---------------- Validação do cadastro ---------------- */

const branches = [{ id:'b1', nome:'Matriz', ativo:true }];

test('veículo aceita grupos existentes e recusa grupo inexistente, repetido ou malformado', () => {
  const existentes = new Set([GRUPO_AT, GRUPO_DIR]);
  assert.doesNotThrow(() => validateVehicles([carroDeTodos, carroAT], branches, [], existentes));
  assert.throws(() => validateVehicles([{ ...carroAT, grupos:['33333333-3333-4333-8333-333333333333'] }], branches, [], existentes), /não existe mais/);
  assert.throws(() => validateVehicles([{ ...carroAT, grupos:[GRUPO_AT, GRUPO_AT] }], branches, [], existentes), /repetido/);
  assert.throws(() => validateVehicles([{ ...carroAT, grupos:['grupo-1'] }], branches, [], existentes), /inválidos/);
  assert.throws(() => validateVehicles([{ ...carroAT, grupos:'grupo' }], branches, [], existentes), /inválidos/);
});

test('grupo de usuários: nome obrigatório, membros sem repetição', () => {
  assert.deepEqual(
    validateGroupInput({ nome:'  Assistência   técnica ', descricao:' Matriz ', membros:[MEMBRO, MEMBRO] }),
    { nome:'Assistência técnica', descricao:'Matriz', membros:[MEMBRO] }
  );
  assert.throws(() => validateGroupInput({ nome:'A' }), /nome de grupo/);
  assert.throws(() => validateGroupInput({ nome:'Grupo', membros:['x'] }), /Membro inválido/);
});

/* ---------------- Validação da reserva ---------------- */

function isoIn(days){
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const reservaNoCarroAT = overrides => ({
  id:'r1',
  nome:'Técnico',
  criadorUsuarioId:MEMBRO,
  partida:'Matriz',
  destino:'Cliente',
  carro:'XYZ9K88',
  motivo:'Atendimento',
  dataIda:isoIn(2),
  dataVolta:isoIn(2),
  horarioRetirada:'08:00',
  horarioDevolucao:'10:00',
  passageiros:[{ nome:'Técnico', usuarioId:MEMBRO }],
  passageirosConfirmados:0,
  status:'confirmada',
  ...overrides
});

const reservationContext = (membership, overrides) => ({
  branches,
  vehicles:[carroDeTodos, carroAT],
  blocks:[],
  rules:{ maxConsecutiveDays:10, maxAdvanceDays:30, maxReservationsInWindow:5, reservationBufferMinutes:0, pickupAdvanceMinutes:15 },
  groupMembershipByUserId:new Map(Object.entries(membership || {}).map(([id, groups]) => [id, new Set(groups)])),
  // Motorista/conta válidos por padrão - estes testes são sobre a regra de
  // grupo/veículo restrito, não sobre a exigência de motorista com CNH
  // válida (ver tests/validation.test.js para essa regra em si).
  activeUserIds:new Set([MEMBRO, OUTRO]),
  licensesByUserId:new Map([[MEMBRO, { numero:'12345678901', categoria:'B', validade:isoIn(365) }]]),
  ...(overrides || {})
});

test('motorista membro reserva o veículo restrito', () => {
  assert.doesNotThrow(() => validateReservations([reservaNoCarroAT()], reservationContext({ [MEMBRO]:[GRUPO_AT] })));
});

test('motorista fora do grupo não reserva - inclusive quando a gestão reserva por ele', () => {
  assert.throws(
    () => validateReservations([reservaNoCarroAT({ criadorUsuarioId:OUTRO, passageiros:[{ nome:'Outro' }] })], reservationContext({ [MEMBRO]:[GRUPO_AT], [OUTRO]:[] })),
    /uso restrito a um grupo/
  );
});

test('motorista sem conta vinculada não reserva veículo restrito', () => {
  assert.throws(
    () => validateReservations([reservaNoCarroAT({ criadorUsuarioId:undefined })], reservationContext({})),
    /uso restrito a um grupo/
  );
});

test('quem saiu do grupo ainda altera a reserva que já tinha (ex.: registrar a devolução)', () => {
  const existente = reservaNoCarroAT();
  const alterada = { ...existente, horarioDevolucao:'11:00' };
  assert.doesNotThrow(() => validateReservations(
    [alterada],
    reservationContext({ [MEMBRO]:[] }, { currentReservations:[existente] })
  ));
});

test('trocar uma reserva existente para o veículo restrito exige ser membro', () => {
  const existente = reservaNoCarroAT({ carro:'ABC1D23' });
  const trocada = { ...existente, carro:'XYZ9K88' };
  assert.throws(
    () => validateReservations([trocada], reservationContext({ [MEMBRO]:[] }, { currentReservations:[existente] })),
    /uso restrito a um grupo/
  );
});

/* ---------------- Avisos de bloqueio ---------------- */

const bloqueio = overrides => ({ id:'blk1', local:'Matriz', carro:'XYZ9K88', tipo:'manutencao', dataInicio:'2026-10-05', dataFim:'2026-10-07', observacoes:'', ...overrides });

test('só bloqueios novos ou com período/veículo alterado geram aviso', () => {
  const antigo = bloqueio();
  assert.deepEqual(changedBlocks([antigo], [antigo]), []);
  assert.deepEqual(changedBlocks([antigo], [{ ...antigo, observacoes:'Troca de óleo' }]), []);
  assert.equal(changedBlocks([antigo], [{ ...antigo, dataFim:'2026-10-08' }]).length, 1);
  assert.equal(changedBlocks([], [antigo]).length, 1);
});

test('reservas afetadas: mesmo veículo, período encostando, ainda ativas', () => {
  const reservas = [
    { id:'a', partida:'Matriz', carro:'XYZ9K88', dataIda:'2026-10-07', dataVolta:'2026-10-09', status:'confirmada' },
    { id:'b', partida:'Matriz', carro:'XYZ9K88', dataIda:'2026-10-01', dataVolta:'2026-10-04', status:'confirmada' },
    { id:'c', partida:'Matriz', carro:'ABC1D23', dataIda:'2026-10-06', dataVolta:'2026-10-06', status:'confirmada' },
    { id:'d', partida:'Matriz', carro:'XYZ9K88', dataIda:'2026-10-06', dataVolta:'2026-10-06', status:'cancelada' },
    { id:'e', partida:'matriz', carro:'xyz9k88', dataIda:'2026-10-05', dataVolta:'2026-10-05', status:'em uso' }
  ];
  assert.deepEqual(reservationsAffectedByBlock(bloqueio(), reservas).map(item => item.id), ['a', 'e']);
});
