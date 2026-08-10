const test = require('node:test');
const assert = require('node:assert/strict');
const { getBranchDeletionBlockers } = require('../server/branch-deletion');

const branch = { id:'b1', nome:'São Paulo' };

test('bloqueia exclusão de filial com veículo vinculado', () => {
  const blockers = getBranchDeletionBlockers(branch, [
    { id:'v1', filial:'São Paulo' },
    { id:'v2', filial:'São Carlos' }
  ], []);
  assert.equal(blockers.linkedVehicles.length, 1);
});

test('bloqueia exclusão de filial envolvida em reserva ativa', () => {
  const blockers = getBranchDeletionBlockers(branch, [], [
    { id:'r1', partida:'São Carlos', destino:'São Paulo', status:'confirmada' }
  ]);
  assert.equal(blockers.activeReservations.length, 1);
});

test('permite preservar reservas históricas ao excluir a filial', () => {
  const blockers = getBranchDeletionBlockers(branch, [], [
    { id:'r1', partida:'São Paulo', destino:'São Carlos', status:'concluída' },
    { id:'r2', partida:'São Carlos', destino:'São Paulo', operacao:{ devolucao:{} } },
    { id:'r3', partida:'São Paulo', destino:'São Carlos', status:'encerrada_administrativamente' }
  ]);
  assert.equal(blockers.activeReservations.length, 0);
});
