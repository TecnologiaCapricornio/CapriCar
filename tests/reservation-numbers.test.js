const test = require('node:test');
const assert = require('node:assert/strict');
const { numberReservations } = require('../server/reservation-numbers');

function counterClient(initial){
  let lastNumber = initial || 0;
  return {
    async query(sql, params){
      if(sql.includes('GREATEST')){
        lastNumber = Math.max(lastNumber, Number(params[0]));
        return { rows:[] };
      }
      if(sql.includes('SET last_number = last_number + 1')){
        lastNumber += 1;
        return { rows:[{ last_number:lastNumber }] };
      }
      return { rows:[] };
    },
    current(){ return lastNumber; }
  };
}

test('numera reservas antigas em ordem de criação começando por 1', async () => {
  const client = counterClient();
  const numbered = await numberReservations(client, [
    { id:'later', criadoEm:'2026-08-02T10:00:00Z' },
    { id:'first', criadoEm:'2026-08-01T10:00:00Z' }
  ], null);
  assert.equal(numbered.find(item => item.id === 'first').numeroReserva, 1);
  assert.equal(numbered.find(item => item.id === 'later').numeroReserva, 2);
});

test('preserva números existentes e ignora número enviado pelo cliente', async () => {
  const client = counterClient(2);
  const current = [
    { id:'a', numeroReserva:1, criadoEm:'2026-08-01T10:00:00Z' },
    { id:'b', numeroReserva:2, criadoEm:'2026-08-02T10:00:00Z' }
  ];
  const numbered = await numberReservations(client, [
    { ...current[0], numeroReserva:99 },
    { ...current[1] },
    { id:'c', numeroReserva:1, criadoEm:'2026-08-03T10:00:00Z' }
  ], current);
  assert.deepEqual(numbered.map(item => item.numeroReserva), [1, 2, 3]);
});

test('não reutiliza o número de uma reserva removida', async () => {
  const client = counterClient(7);
  const numbered = await numberReservations(client, [
    { id:'new', criadoEm:'2026-08-04T10:00:00Z' }
  ], []);
  assert.equal(numbered[0].numeroReserva, 8);
});
