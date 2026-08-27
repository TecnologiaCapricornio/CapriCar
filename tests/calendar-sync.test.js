const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEventPayload } = require('../server/calendar-sync');

const reservation = {
  numeroReserva:42,
  partida:'São Paulo',
  destino:'São Carlos',
  carro:'89',
  placa:'GJF5D45',
  motivo:'Visita a cliente',
  dataIda:'2026-08-05',
  horarioRetirada:'10:00',
  dataVolta:'2026-08-06',
  horarioDevolucao:'12:00',
  passageiros:[{ nome:'Ana' }, { nome:'Bia', externo:true }]
};

test('buildEventPayload monta assunto, corpo e horários a partir da reserva', () => {
  const payload = buildEventPayload(reservation);
  assert.equal(payload.subject, 'Reserva CapriCar #42 · São Paulo → São Carlos');
  assert.match(payload.body.content, /Veículo: 89 - Placa: GJF5D45/);
  assert.match(payload.body.content, /Motivo: Visita a cliente/);
  assert.match(payload.body.content, /<li>Ana<\/li>/);
  assert.match(payload.body.content, /<li>Bia<\/li>/);
  assert.deepEqual(payload.start, { dateTime:'2026-08-05T10:00:00', timeZone:'America/Sao_Paulo' });
  assert.deepEqual(payload.end, { dateTime:'2026-08-06T12:00:00', timeZone:'America/Sao_Paulo' });
  assert.equal(payload.location.displayName, 'São Carlos');
});

test('buildEventPayload usa lista de convidados vazia quando nenhuma é passada', () => {
  const payload = buildEventPayload(reservation);
  assert.deepEqual(payload.attendees, []);
});

test('buildEventPayload inclui os convidados resolvidos no formato esperado pelo Graph', () => {
  const attendees = [
    { emailAddress:{ address:'ana@capricornio.com.br', name:'Ana' }, type:'required' }
  ];
  const payload = buildEventPayload(reservation, attendees);
  assert.deepEqual(payload.attendees, attendees);
});

test('buildEventPayload escapa HTML no nome do passageiro', () => {
  const withUnsafeName = {
    ...reservation,
    passageiros:[{ nome:'<script>alert(1)</script>' }]
  };
  const payload = buildEventPayload(withUnsafeName);
  assert.doesNotMatch(payload.body.content, /<script>/);
  assert.match(payload.body.content, /&lt;script&gt;/);
});
