const test = require('node:test');
const assert = require('node:assert/strict');
const {
  notifyReservationCancellation,
  notifyReservationPassengerAdditions,
  notifyOperationReport,
  notifyReservationPassengerRemovals,
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

test('motorista é notificado quando alguém entra na própria carona (mas não quando ele mesmo adiciona)', async () => {
  const inserted = [];
  const client = notificationClient([passenger.id, owner.id], inserted);

  await notifyReservationPassengerAdditions(client, null, base, {
    ...passenger, role:'user', permissions:{}
  });
  const driverEntries = inserted.filter(params => params[0] === owner.id);
  assert.equal(driverEntries.length, 1);
  assert.equal(driverEntries[0][1], 'passenger_joined');
  assert.match(driverEntries[0][3], /respeitar os horários/i);

  inserted.length = 0;
  await notifyReservationPassengerAdditions(client, null, base, {
    ...owner, role:'user', permissions:{}
  });
  assert.equal(inserted.filter(params => params[0] === owner.id).length, 0);
});

const manager = { id:'44444444-4444-4444-8444-444444444444', nome:'Gestor', role:'admin' };

function dedupingNotificationClient(resolvedUserIds){
  const seen = new Set();
  const inserted = [];
  return {
    inserted,
    async query(sql, params){
      if(sql.includes('SELECT id FROM users')){
        return { rows:resolvedUserIds.map(id => ({ id })) };
      }
      if(sql.includes('INSERT INTO notifications')){
        const key = params[0] + '|' + params[5];
        if(!seen.has(key)){
          seen.add(key);
          inserted.push(params);
        }
      }
      return { rows:[], rowCount:0 };
    }
  };
}

test('gestor é notificado quando avarias e/ou fotos são registradas na retirada', async () => {
  const client = dedupingNotificationClient([manager.id]);
  const reservation = {
    ...base,
    operacao:{ retirada:{ avarias:'Risco na lateral', fotos:[{ dados:'x' }, { dados:'y' }] } }
  };
  await notifyOperationReport(client, reservation, 'retirada', owner);
  assert.equal(client.inserted.length, 1);
  assert.equal(client.inserted[0][0], manager.id);
  assert.equal(client.inserted[0][1], 'operation_report');
  assert.match(client.inserted[0][3], /uma observação e 2 fotos/i);
});

test('nenhuma notificação é criada quando o registro não tem avarias nem fotos', async () => {
  const client = dedupingNotificationClient([manager.id]);
  const reservation = { ...base, operacao:{ retirada:{ avarias:'', fotos:[] } } };
  await notifyOperationReport(client, reservation, 'retirada', owner);
  assert.equal(client.inserted.length, 0);
});

test('o próprio autor do registro não recebe notificação sobre a própria ação', async () => {
  const client = dedupingNotificationClient([manager.id]);
  const reservation = { ...base, operacao:{ retirada:{ avarias:'Risco na lateral', fotos:[] } } };
  await notifyOperationReport(client, reservation, 'retirada', manager);
  assert.equal(client.inserted.length, 0);
});

test('editar a mesma reserva de novo não duplica a notificação', async () => {
  const client = dedupingNotificationClient([manager.id]);
  const reservation = { ...base, operacao:{ retirada:{ avarias:'Risco na lateral', fotos:[] } } };
  await notifyOperationReport(client, reservation, 'retirada', owner);
  await notifyOperationReport(client, reservation, 'retirada', owner);
  assert.equal(client.inserted.length, 1);
});

// Regressão: insertNotification ficou fora do module.exports quando o
// monitoramento de carona foi escrito. O import em server/ride-watches.js
// chegava como undefined, e como notifyRideWatchMatches roda DENTRO da
// transação da reserva, criar uma reserva que batesse com alguma rota
// monitorada lançava TypeError e derrubava a reserva inteira.
test('o módulo exporta as funções consumidas por outros módulos do servidor', () => {
  const notifications = require('../server/notifications');
  for(const nome of ['insertNotification', 'ensureNotificationsTable', 'reservationSummary']){
    assert.equal(
      typeof notifications[nome],
      'function',
      `server/notifications.js precisa exportar ${nome}`
    );
  }
});

/* ===== Saída / remoção de passageiro ===== */

// Cliente que resolve contas ativas para a consulta de destinatários da
// remoção e registra as notificações inseridas.
function removalClient(contas){
  const inserted = [];
  return {
    inserted,
    async query(sql, params){
      if(sql.includes('FROM users')){
        const ids = Array.isArray(params[0]) ? params[0].map(String) : [String(params[0])];
        return { rows:contas.filter(c => ids.includes(String(c.id))) };
      }
      if(sql.includes('INSERT INTO notifications')){
        inserted.push({ userId:params[0], tipo:params[1], titulo:params[2], mensagem:params[3] });
        return { rows:[], rowCount:1 };
      }
      return { rows:[], rowCount:0 };
    }
  };
}

const contas = [
  { id:owner.id, email:'motorista@ex.com', display_name:'Motorista' },
  { id:passenger.id, email:'passageiro@ex.com', display_name:'Passageiro' }
];
const comPassageiro = { ...base, passageiros:[{ nome:'Passageiro', usuarioId:passenger.id }] };
const semPassageiro = { ...base, passageiros:[] };

test('motorista removendo passageiro avisa quem foi removido', async () => {
  const client = removalClient(contas);
  const tarefas = await notifyReservationPassengerRemovals(
    client, comPassageiro, semPassageiro, owner, ''
  );
  assert.equal(client.inserted.length, 1);
  assert.equal(client.inserted[0].userId, passenger.id);
  assert.equal(client.inserted[0].tipo, 'passenger_removed');
  assert.match(client.inserted[0].mensagem, /Motorista removeu você/);
  assert.equal(tarefas.length, 1);
  assert.equal(tarefas[0].tipo, 'passengerRemoved');
});

test('passageiro saindo por conta própria avisa o motorista', async () => {
  const client = removalClient(contas);
  const tarefas = await notifyReservationPassengerRemovals(
    client, comPassageiro, semPassageiro, passenger, ''
  );
  assert.equal(client.inserted.length, 1);
  assert.equal(client.inserted[0].userId, owner.id, 'quem recebe é o motorista');
  assert.equal(client.inserted[0].tipo, 'passenger_left');
  assert.match(client.inserted[0].mensagem, /Passageiro saiu/);
  assert.equal(tarefas[0].tipo, 'passengerLeft');
});

test('a mensagem opcional entra na notificação, citando quem escreveu', async () => {
  const client = removalClient(contas);
  await notifyReservationPassengerRemovals(
    client, comPassageiro, semPassageiro, owner, 'Preciso do lugar para equipamento.'
  );
  assert.match(client.inserted[0].mensagem, /Mensagem de Motorista: "Preciso do lugar para equipamento\."/);
});

test('sem mensagem a notificação não ganha trecho vazio', async () => {
  const client = removalClient(contas);
  await notifyReservationPassengerRemovals(client, comPassageiro, semPassageiro, owner, '   ');
  assert.doesNotMatch(client.inserted[0].mensagem, /Mensagem de/);
});

test('nada muda na lista de passageiros não gera notificação', async () => {
  const client = removalClient(contas);
  const tarefas = await notifyReservationPassengerRemovals(
    client, comPassageiro, comPassageiro, owner, ''
  );
  assert.equal(client.inserted.length, 0);
  assert.equal(tarefas.length, 0);
});

test('passageiro removido cuja conta não existe mais é ignorado', async () => {
  const client = removalClient([]); // nenhuma conta ativa
  const tarefas = await notifyReservationPassengerRemovals(
    client, comPassageiro, semPassageiro, owner, ''
  );
  assert.equal(client.inserted.length, 0);
  assert.equal(tarefas.length, 0);
});
