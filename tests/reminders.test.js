const test = require('node:test');
const assert = require('node:assert/strict');
const { cnhMilestoneFor, formatDateBR } = require('../server/reminders');
const {
  pendingReminders,
  renderTemplate,
  reservationTokens,
  plateBadgeEmailHTML
} = require('../server/reminders');
const {
  maintenanceMilestoneFor,
  latestOdometerReading,
  maintenanceReminderStatus,
  maintenanceReminderLabel,
  maintenanceStatusMessage,
  MAINTENANCE_KM_MILESTONES,
  MAINTENANCE_DATE_MILESTONES
} = require('../server/reminders');

const owner = { id:'11111111-1111-4111-8111-111111111111', nome:'Motorista' };
const base = {
  id:'reserva-1', nome:'Motorista', criadorUsuarioId:owner.id,
  partida:'São Paulo', destino:'São Carlos', carro:'89',
  dataIda:'2026-08-05', horarioRetirada:'10:00',
  dataVolta:'2026-08-06', horarioDevolucao:'12:00'
};

test('pendingReminders sinaliza reserva próxima só dentro da janela de 24h', () => {
  const justUnder24h = Date.parse('2026-08-04T10:01:00-03:00');
  const over24h = Date.parse('2026-08-04T09:59:00-03:00');
  assert.deepEqual(
    pendingReminders(base, justUnder24h).map(item => item.type),
    ['reservationUpcoming']
  );
  assert.deepEqual(pendingReminders(base, over24h).map(item => item.type), []);
});

test('pendingReminders sinaliza retirada atrasada só quando ainda não foi registrada', () => {
  const afterPickupTime = Date.parse('2026-08-05T10:01:00-03:00');
  assert.deepEqual(
    pendingReminders(base, afterPickupTime).map(item => item.type),
    ['pickupOverdue']
  );
  const pickedUp = { ...base, operacao:{ retirada:{ quilometragem:100 } } };
  assert.deepEqual(pendingReminders(pickedUp, afterPickupTime).map(item => item.type), []);
});

test('pendingReminders sinaliza devolução atrasada só depois da retirada registrada', () => {
  const afterReturnTime = Date.parse('2026-08-06T12:01:00-03:00');
  const pickedUpOnly = { ...base, operacao:{ retirada:{ quilometragem:100 } } };
  assert.deepEqual(
    pendingReminders(pickedUpOnly, afterReturnTime).map(item => item.type),
    ['returnOverdue']
  );
  // Sem retirada registrada, o horário de retirada (mais cedo que o de
  // devolução) também já passou - o único aviso pendente é o de retirada,
  // não o de devolução (returnOverdue exige pickupDone).
  const neverPickedUp = { ...base };
  assert.deepEqual(
    pendingReminders(neverPickedUp, afterReturnTime).map(item => item.type),
    ['pickupOverdue']
  );
  const fullyReturned = {
    ...base,
    operacao:{ retirada:{ quilometragem:100 }, devolucao:{ quilometragem:200 } }
  };
  assert.deepEqual(pendingReminders(fullyReturned, afterReturnTime).map(item => item.type), []);
});

test('pendingReminders não sinaliza nada para reserva concluída ou cancelada', () => {
  const now = Date.parse('2026-08-05T10:01:00-03:00');
  assert.deepEqual(pendingReminders({ ...base, status:'concluida' }, now), []);
  assert.deepEqual(pendingReminders({ ...base, status:'cancelada' }, now), []);
});

test('renderTemplate substitui tokens conhecidos e preserva os desconhecidos', () => {
  const result = renderTemplate('Olá {{nome}}, reserva {{numeroReserva}} e {{inexistente}}', {
    nome:'Ana', numeroReserva:42
  });
  assert.equal(result, 'Olá Ana, reserva 42 e {{inexistente}}');
});

test('reservationTokens usa marca/modelo do veículo resolvido, com placa em badge', () => {
  const tokens = reservationTokens(base, { brand:'Volkswagen', model:'Polo', plate:'gjf5d45' });
  assert.equal(tokens.veiculo, 'Volkswagen Polo');
  assert.match(tokens.placaBadge, /GJF5D45/);
  assert.equal(tokens.origem, 'São Paulo');
  assert.equal(tokens.destino, 'São Carlos');
});

test('reservationTokens cai para o código do carro quando o veículo não é resolvido', () => {
  const tokens = reservationTokens(base, null);
  assert.equal(tokens.veiculo, '89');
  assert.equal(tokens.placaBadge, '');
});

test('plateBadgeEmailHTML devolve string vazia sem placa e HTML em maiúsculas com placa', () => {
  assert.equal(plateBadgeEmailHTML(''), '');
  assert.equal(plateBadgeEmailHTML(null), '');
  const html = plateBadgeEmailHTML('gjf5d45');
  assert.match(html, /GJF5D45/);
  assert.doesNotMatch(html, /gjf5d45/);
  assert.match(html, /<table/);
});

/* ===== Aviso de vencimento de CNH ===== */

test('cada marco de vencimento da CNH avisa uma vez só', () => {
  // 30 e 16 dias caem no mesmo marco: quem já foi avisado aos 30 não
  // recebe de novo aos 16.
  assert.equal(cnhMilestoneFor(30), '30');
  assert.equal(cnhMilestoneFor(22), '30');
  assert.equal(cnhMilestoneFor(16), '30');
  // Ao cruzar 15 o marco muda e um aviso novo sai.
  assert.equal(cnhMilestoneFor(15), '15');
  assert.equal(cnhMilestoneFor(2), '15');
  assert.equal(cnhMilestoneFor(1), '1');
});

test('o dia do vencimento cai no marco de 1 dia, já avisado na véspera', () => {
  assert.equal(cnhMilestoneFor(0), '1');
});

test('acima de 30 dias não há marco - o aviso começa aos 30', () => {
  assert.equal(cnhMilestoneFor(31), null);
  assert.equal(cnhMilestoneFor(45), null);
  assert.equal(cnhMilestoneFor(60), null);
  assert.equal(cnhMilestoneFor(400), null);
});

test('CNH vencida tem marco próprio, avisado uma vez', () => {
  assert.equal(cnhMilestoneFor(-1), 'vencida');
  assert.equal(cnhMilestoneFor(-90), 'vencida');
});

test('são exatamente 4 avisos ao longo de toda a vida da CNH', () => {
  // 30 -> 15 -> 1 -> vencida. Nenhum dia entre eles gera marco novo.
  const marcos = [];
  for(let dias = 60; dias >= -5; dias--){
    const marco = cnhMilestoneFor(dias);
    if(marco && marco !== marcos[marcos.length - 1]) marcos.push(marco);
  }
  assert.deepEqual(marcos, ['30', '15', '1', 'vencida']);
});

test('formatDateBR aceita string ISO e Date do banco', () => {
  assert.equal(formatDateBR('2026-10-15'), '15/10/2026');
  assert.equal(formatDateBR(new Date('2026-10-15T00:00:00Z')), '15/10/2026');
});

/* ===== Lembretes de manutenção ===== */

test('maintenanceMilestoneFor marca vencido em zero ou negativo, e usa o menor marco que cobre o restante', () => {
  assert.equal(maintenanceMilestoneFor(0, MAINTENANCE_KM_MILESTONES), 'vencido');
  assert.equal(maintenanceMilestoneFor(-50, MAINTENANCE_KM_MILESTONES), 'vencido');
  assert.equal(maintenanceMilestoneFor(1000, MAINTENANCE_KM_MILESTONES), '1000');
  assert.equal(maintenanceMilestoneFor(700, MAINTENANCE_KM_MILESTONES), '1000');
  assert.equal(maintenanceMilestoneFor(500, MAINTENANCE_KM_MILESTONES), '500');
  assert.equal(maintenanceMilestoneFor(201, MAINTENANCE_KM_MILESTONES), '500');
  assert.equal(maintenanceMilestoneFor(200, MAINTENANCE_KM_MILESTONES), '200');
  assert.equal(maintenanceMilestoneFor(1, MAINTENANCE_KM_MILESTONES), '200');
});

test('maintenanceMilestoneFor devolve null acima do maior marco, e null sem valor conhecido', () => {
  assert.equal(maintenanceMilestoneFor(1001, MAINTENANCE_KM_MILESTONES), null);
  assert.equal(maintenanceMilestoneFor(5000, MAINTENANCE_KM_MILESTONES), null);
  assert.equal(maintenanceMilestoneFor(null, MAINTENANCE_KM_MILESTONES), null);
  assert.equal(maintenanceMilestoneFor(16, MAINTENANCE_DATE_MILESTONES), null);
  assert.equal(maintenanceMilestoneFor(15, MAINTENANCE_DATE_MILESTONES), '15');
});

const veiculoBase = { partida:'São Paulo', carro:'89' };

test('latestOdometerReading usa a devolução mais recente, não a soma das viagens', () => {
  const reservations = [
    { ...veiculoBase, operacao:{ devolucao:{ quilometragem:1000, registradoEm:'2026-08-01T12:00:00Z' } } },
    { ...veiculoBase, operacao:{ devolucao:{ quilometragem:1500, registradoEm:'2026-08-10T12:00:00Z' } } },
    { ...veiculoBase, operacao:{ devolucao:{ quilometragem:1200, registradoEm:'2026-08-05T12:00:00Z' } } }
  ];
  assert.equal(latestOdometerReading('São Paulo', '89', reservations), 1500);
});

test('latestOdometerReading ignora reservas de outro veículo e devolve null sem nenhuma leitura', () => {
  const reservations = [
    { partida:'São Carlos', carro:'89', operacao:{ devolucao:{ quilometragem:9999, registradoEm:'2026-08-10T12:00:00Z' } } },
    { ...veiculoBase, carro:'45', operacao:{ devolucao:{ quilometragem:9999, registradoEm:'2026-08-10T12:00:00Z' } } },
    { ...veiculoBase, operacao:{ retirada:{ quilometragem:100, registradoEm:'2026-08-10T12:00:00Z' } } }
  ];
  assert.equal(latestOdometerReading('São Paulo', '89', reservations), null);
  assert.equal(latestOdometerReading('São Paulo', '89', []), null);
});

test('maintenanceReminderStatus só calcula a perna de km quando o km atual é conhecido', () => {
  const reminder = { proximaKm:50000, proximaData:null };
  assert.equal(maintenanceReminderStatus(reminder, null, '2026-08-01').km, null);
  const status = maintenanceReminderStatus(reminder, 49500, '2026-08-01');
  assert.deepEqual(status.km, { restante:500, marco:'500' });
  assert.equal(status.data, null);
});

test('maintenanceReminderStatus calcula a perna de data independentemente do km', () => {
  const reminder = { proximaKm:null, proximaData:'2026-08-15' };
  const status = maintenanceReminderStatus(reminder, null, '2026-08-10');
  assert.equal(status.km, null);
  assert.deepEqual(status.data, { restante:5, marco:'7' });
});

test('maintenanceReminderStatus com as duas pernas vencidas ao mesmo tempo', () => {
  const reminder = { proximaKm:50000, proximaData:'2026-08-01' };
  const status = maintenanceReminderStatus(reminder, 50200, '2026-08-05');
  assert.equal(status.km.marco, 'vencido');
  assert.equal(status.data.marco, 'vencido');
});

test('maintenanceReminderLabel usa o rótulo do tipo, ou a descrição quando o tipo é "outro"', () => {
  assert.equal(maintenanceReminderLabel({ tipo:'oleo' }), 'Troca de óleo');
  assert.equal(maintenanceReminderLabel({ tipo:'pneus' }), 'Troca de pneus');
  assert.equal(maintenanceReminderLabel({ tipo:'outro', descricao:'Alinhamento e balanceamento' }),
    'Alinhamento e balanceamento');
});

test('maintenanceStatusMessage descreve as duas pernas e usa "venceu" quando qualquer uma delas vence', () => {
  const reminder = { tipo:'oleo' };
  const vencido = maintenanceReminderStatus({ proximaKm:1000, proximaData:null }, 1200, '2026-08-01');
  const mensagemVencida = maintenanceStatusMessage(reminder, vencido, 'Volkswagen Polo');
  assert.match(mensagemVencida, /venceu/);
  assert.match(mensagemVencida, /200 km além do previsto/);

  const proximo = maintenanceReminderStatus({ proximaKm:1000, proximaData:null }, 700, '2026-08-01');
  const mensagemProxima = maintenanceStatusMessage(reminder, proximo, 'Volkswagen Polo');
  assert.match(mensagemProxima, /está próxima/);
  assert.match(mensagemProxima, /faltam 300 km/);
});
