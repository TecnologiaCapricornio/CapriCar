const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReservations } = require('../server/validation');

function isoIn(days){
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test('preserva reserva histórica após a exclusão definitiva do veículo', () => {
  const reservation = {
    id:'historical-reservation',
    nome:'Usuário Teste',
    partida:'São Paulo',
    destino:'São Carlos',
    carro:'89',
    motivo:'Reunião concluída',
    responsavel:'Usuário Teste',
    dataIda:isoIn(-3),
    dataVolta:isoIn(-2),
    horarioRetirada:'08:00',
    horarioDevolucao:'10:00',
    passageiros:[{ nome:'Usuário Teste' }],
    passageirosConfirmados:0,
    status:'concluída'
  };
  assert.doesNotThrow(() => validateReservations([reservation], {
    branches:[{ id:'b1', nome:'São Paulo', ativo:true }],
    vehicles:[],
    blocks:[],
    rules:{
      maxConsecutiveDays:10,
      maxAdvanceDays:30,
      maxReservationsInWindow:2
    }
  }));
});

