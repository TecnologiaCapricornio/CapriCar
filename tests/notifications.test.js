const test = require('node:test');
const assert = require('node:assert/strict');
const {
  notifyReservationCancellation,
  notifyReservationPassengerAdditions,
  reminderTypesForReservation
} = require('../server/notifications');

const owner = { id:'11111111-1111-4111-8111-111111111111', nome:'Motorista' };
const passenger = { id:'22222222-2222-4222-8222-222222222222', nome:'Passageiro' };
const base = {
  id:'reserva-1', nome:'Motorista', criadorUsuarioId:owner.id,
  partida:'São Paulo', destino:'São Carlos',
  dataIda:'2026-08-05', horarioRetirada:'10:00',
  passageiros:[{ nome:'Passageiro', usuarioId:passenger.id }]
};

test('avisa motorista e passageiro quando a reserva está a menos de 24 horas', () => {
  const now = Date.parse('2026-08-04T12:00:00-03:00');
  assert.deepEqual(reminderTypesForReservation(base, owner, now), ['reservation_upcoming']);
  assert.deepEqual(reminderTypesForReservation(base, passenger, now), ['reservation_upcoming']);
});

test('avisa somente o motorista quando a retirada está atrasada', () => {
  const now = Date.parse('2026-08-05T10:01:00-03:00');
  assert.deepEqual(reminderTypesForReservation(base, owner, now), ['pickup_overdue']);
  assert.deepEqual(reminderTypesForReservation(base, passenger, now), []);
});

test('não avisa retirada já registrada nem reserva concluída', () => {
  const now = Date.parse('2026-08-05T11:00:00-03:00');
  const pickedUp = { ...base, operacao:{ retirada:{ km:100 } } };
  const completed = { ...base, status:'concluida' };
  const administrativelyClosed = { ...base, status:'encerrada_administrativamente' };
  assert.deepEqual(reminderTypesForReservation(pickedUp, owner, now), []);
  assert.deepEqual(reminderTypesForReservation(completed, owner, now), []);
  assert.deepEqual(reminderTypesForReservation(administrativelyClosed, owner, now), []);
});

function notificationClient(resolvedUserIds, inserted){
  return {
    async query(sql, params){
      if(sql.includes('SELECT id FROM users')){
        return { rows:resolvedUserIds.map(id => ({ id })) };
      }
      if(sql.includes('INSERT INTO notifications')) inserted.push(params);
      return { rows:[], rowCount:0 };
    }
  };
}

test('cancelamento do motorista notifica o passageiro', async () => {
  const inserted = [];
  const client = notificationClient([passenger.id], inserted);
  await notifyReservationCancellation(client, base, {
    ...owner, role:'user', permissions:{}
  });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][0], passenger.id);
  assert.equal(inserted[0][1], 'passenger_cancelled');
  assert.match(inserted[0][2], /carona foi cancelada/i);
});

test('cancelamento pela gestão notifica motorista e passageiro', async () => {
  const adminId = '33333333-3333-4333-8333-333333333333';
  const inserted = [];
  const client = notificationClient([owner.id, passenger.id], inserted);
  await notifyReservationCancellation(client, base, {
    id:adminId, nome:'Administrador', role:'admin', permissions:{ reservations:true }
  });
  assert.equal(inserted.length, 2);
  assert.deepEqual(inserted.map(params => params[0]).sort(), [owner.id, passenger.id].sort());
  assert.ok(inserted.every(params => params[1] === 'admin_cancelled'));
  assert.ok(inserted.every(params => params[2] === 'Reserva cancelada'));
});

test('passageiro vinculado recebe notificação ao ser adicionado à carona', async () => {
  const inserted = [];
  const client = notificationClient([passenger.id], inserted);
  await notifyReservationPassengerAdditions(client, null, base, {
    ...owner, role:'user', permissions:{}
  });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][0], passenger.id);
  assert.equal(inserted[0][1], 'passenger_added');
  assert.match(inserted[0][2], /adicionado a uma carona/i);

  inserted.length = 0;
  await notifyReservationPassengerAdditions(client, base, base, {
    ...owner, role:'user', permissions:{}
  });
  assert.equal(inserted.length, 0);
});
