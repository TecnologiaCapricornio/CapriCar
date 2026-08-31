const test = require('node:test');
const assert = require('node:assert/strict');
const { cnhMilestoneFor, formatDateBR } = require('../server/reminders');
const {
  pendingReminders,
  renderTemplate,
  reservationTokens,
  plateBadgeEmailHTML
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
