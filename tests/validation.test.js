const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBranches,
  validateVehicles,
  validateBlocks,
  validateReservations
} = require('../server/validation');

function isoIn(days){
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const branches = [{ id:'b1', nome:'São Paulo', ativo:true }];
const vehicles = [{
  id:'v1',
  filial:'São Paulo',
  codigo:'89',
  placa:'ABC1D23',
  modelo:'Volkswagen Polo',
  capacidade:5,
  ativo:true
}];
const rules = {
  maxConsecutiveDays:10,
  maxAdvanceDays:30,
  maxReservationsInWindow:2
};

function reservation(overrides){
  return {
    id:'r1',
    nome:'Usuário Teste',
    partida:'São Paulo',
    destino:'São Carlos',
    carro:'89',
    motivo:'Reunião',
    responsavel:'Usuário Teste',
    dataIda:isoIn(2),
    dataVolta:isoIn(2),
    horarioRetirada:'08:00',
    horarioDevolucao:'10:00',
    passageiros:[{ nome:'Usuário Teste' }],
    passageirosConfirmados:0,
    status:'confirmada',
    ...overrides
  };
}

function context(overrides){
  return { branches, vehicles, blocks:[], rules, ...(overrides || {}) };
}

test('aceita cadastros e uma reserva válida', () => {
  assert.doesNotThrow(() => validateBranches(branches));
  assert.doesNotThrow(() => validateVehicles(vehicles, branches));
  assert.doesNotThrow(() => validateBlocks([], vehicles));
  assert.doesNotThrow(() => validateReservations([reservation()], context()));
});

test('recusa conflito de horário para o mesmo veículo', () => {
  const second = reservation({
    id:'r2',
    nome:'Outro Usuário',
    horarioRetirada:'09:30',
    horarioDevolucao:'11:00'
  });
  assert.throws(
    () => validateReservations([reservation(), second], context()),
    /conflitantes/
  );
});

test('permite horários adjacentes', () => {
  const second = reservation({
    id:'r2',
    nome:'Outro Usuário',
    horarioRetirada:'10:00',
    horarioDevolucao:'11:00'
  });
  assert.doesNotThrow(() => validateReservations([reservation(), second], context()));
});

test('recusa período acima do limite e antecedência excessiva', () => {
  assert.throws(
    () => validateReservations([
      reservation({ dataVolta:isoIn(12) })
    ], context()),
    /dias consecutivos/
  );
  assert.throws(
    () => validateReservations([
      reservation({ dataIda:isoIn(31), dataVolta:isoIn(31) })
    ], context()),
    /próximos 30 dias/
  );
});

test('recusa veículo bloqueado e excesso de ocupantes', () => {
  const blocked = [{
    id:'block1',
    filial:'São Paulo',
    carro:'89',
    tipo:'Manutenção',
    dataInicio:isoIn(1),
    dataFim:isoIn(3),
    observacoes:''
  }];
  assert.throws(
    () => validateReservations([reservation()], context({ blocks:blocked })),
    /bloqueado/
  );
  assert.throws(
    () => validateReservations([
      reservation({
        passageiros:Array.from({ length:6 }, (_, index) => ({ nome:`Pessoa ${index}` }))
      })
    ], context()),
    /capacidade/
  );
});

test('recusa marcação HTML e identificadores duplicados', () => {
  assert.throws(
    () => validateReservations([
      reservation({ motivo:'<img src=x>' })
    ], context()),
    /caracteres não permitidos/
  );
  assert.throws(
    () => validateBranches([
      ...branches,
      { id:'b1', nome:'São Carlos', ativo:true }
    ]),
    /identificadores duplicados/
  );
});

test('recusa mais reservas por usuário do que a regra permite', () => {
  const list = [0, 1, 2].map(index => reservation({
    id:`r${index}`,
    carro:'89',
    dataIda:isoIn(2 + index),
    dataVolta:isoIn(2 + index),
    horarioRetirada:'08:00',
    horarioDevolucao:'09:00'
  }));
  assert.throws(
    () => validateReservations(list, context()),
    /no máximo 2 reservas/
  );
});
