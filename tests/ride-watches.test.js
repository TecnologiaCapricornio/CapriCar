const test = require('node:test');
const assert = require('node:assert/strict');
const { watchMatchesReservation } = require('../server/ride-watches');

function watch(overrides){
  return {
    id:'watch-1',
    userId:'user-1',
    origin:'',
    destination:'',
    startsOn:'2026-08-10',
    endsOn:'2026-08-20',
    ...overrides
  };
}

function reservation(overrides){
  return {
    partida:'São Paulo',
    destino:'São Carlos',
    dataIda:'2026-08-15',
    dataVolta:'2026-08-16',
    ...overrides
  };
}

test('bate quando o período da reserva se sobrepõe ao período monitorado', () => {
  assert.equal(watchMatchesReservation(watch(), reservation()), true);
});

test('não bate quando o período da reserva é totalmente anterior ao monitorado', () => {
  assert.equal(
    watchMatchesReservation(watch({ startsOn:'2026-08-20', endsOn:'2026-08-25' }), reservation()),
    false
  );
});

test('não bate quando o período da reserva é totalmente posterior ao monitorado', () => {
  assert.equal(
    watchMatchesReservation(watch({ startsOn:'2026-08-01', endsOn:'2026-08-05' }), reservation()),
    false
  );
});

test('bate na borda exata do período (mesma data de início/fim)', () => {
  assert.equal(
    watchMatchesReservation(watch({ startsOn:'2026-08-16', endsOn:'2026-08-30' }), reservation()),
    true
  );
  assert.equal(
    watchMatchesReservation(watch({ startsOn:'2026-08-01', endsOn:'2026-08-15' }), reservation()),
    true
  );
});

test('origem e destino em branco no watch aceitam qualquer valor', () => {
  assert.equal(watchMatchesReservation(watch({ origin:'', destination:'' }), reservation()), true);
});

test('origem preenchida só bate com a mesma origem (sem diferenciar maiúsculas)', () => {
  assert.equal(watchMatchesReservation(watch({ origin:'são paulo' }), reservation()), true);
  assert.equal(watchMatchesReservation(watch({ origin:'Bragança Paulista' }), reservation()), false);
});

test('destino preenchido só bate com o mesmo destino', () => {
  assert.equal(watchMatchesReservation(watch({ destination:'São Carlos' }), reservation()), true);
  assert.equal(watchMatchesReservation(watch({ destination:'Campinas' }), reservation()), false);
});

test('origem e destino combinados precisam bater os dois', () => {
  const w = watch({ origin:'São Paulo', destination:'São Carlos' });
  assert.equal(watchMatchesReservation(w, reservation()), true);
  assert.equal(watchMatchesReservation(w, reservation({ destino:'Campinas' })), false);
});
