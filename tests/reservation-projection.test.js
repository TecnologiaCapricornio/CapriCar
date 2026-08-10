const test = require('node:test');
const assert = require('node:assert/strict');
const {
  publicDto,
  canViewAllReservations,
  isReservationParticipant
} = require('../server/reservations-store');

test('projeção pública não expõe campos privados, operações, fotos ou ids de usuários', () => {
  const projected = publicDto({
    id:'123', numeroReserva:12, criadorUsuarioId:'user-secret', nome:'Solicitante',
    email:'privado@empresa.com', responsavel:'Responsável privado', motivo:'Motivo privado',
    partida:'São Paulo', carro:'Matriz', destino:'São Carlos',
    dataIda:'2026-08-20', horarioRetirada:'08:00', dataVolta:'2026-08-20', horarioDevolucao:'18:00',
    passageiros:[{ nome:'Solicitante', usuarioId:'user-secret' }, { nome:'Cliente', externo:true }],
    passageirosConfirmados:0, status:'confirmada', criadoEm:'2026-08-10T12:00:00Z',
    operacao:{ retirada:{ fotos:[{ dados:'data:image/png;base64,secret' }] } },
    encerramentoAdministrativo:{ justificativa:'privada' }
  });

  assert.equal(projected.email, undefined);
  assert.equal(projected.responsavel, undefined);
  assert.equal(projected.motivo, undefined);
  assert.equal(projected.operacao, undefined);
  assert.equal(projected.encerramentoAdministrativo, undefined);
  assert.equal(projected.criadorUsuarioId, undefined);
  assert.deepEqual(projected.passageiros, [{ nome:'Solicitante' }, { nome:'Cliente' }]);
});

test('somente perfis de gestão autorizados recebem a visão completa', () => {
  assert.equal(canViewAllReservations({ role:'admin', permissions:{} }), true);
  assert.equal(canViewAllReservations({ role:'user', permissions:{ reports:true } }), true);
  assert.equal(canViewAllReservations({ role:'user', permissions:{} }), false);
});

test('nomes iguais nao concedem acesso privado sem o UUID vinculado', () => {
  const dto = {
    passageiros:[{ nome:'Pessoa com nome repetido', usuarioId:'usuario-vinculado' }]
  };
  assert.equal(isReservationParticipant(
    { requester_id:'criador-real' }, dto,
    { id:'outro-usuario', nome:'Pessoa com nome repetido' }
  ), false);
  assert.equal(isReservationParticipant(
    { requester_id:'criador-real' }, dto,
    { id:'usuario-vinculado', nome:'Outro nome' }
  ), true);
});
