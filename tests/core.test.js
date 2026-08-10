const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElementStub(){
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    children: [],
    classList: { add(){}, remove(){}, toggle(){} },
    addEventListener(){},
    appendChild(child){ this.children.push(child); },
    querySelectorAll(){ return []; },
    closest(){ return null; }
  };
}

function loadCore(){
  const data = new Map();
  const elements = new Map();
  const context = vm.createContext({
    console,
    Date,
    Math,
    JSON,
    Set,
    Map,
    localStorage: {
      getItem(key){ return data.has(key) ? data.get(key) : null; },
      setItem(key, value){ data.set(key, String(value)); },
      removeItem(key){ data.delete(key); }
    },
    document: {
      getElementById(id){
        if(!elements.has(id)) elements.set(id, createElementStub());
        return elements.get(id);
      },
      createElement(){ return createElementStub(); }
    },
    setTimeout(){},
    clearTimeout(){}
  });
  ['config.js', 'utils.js', 'storage.js', 'rides.js'].forEach(file => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  });
  return context;
}

test('inicializa filiais e veículos padrão', () => {
  const app = loadCore();
  assert.equal(app.getBranches().length, 3);
  assert.equal(app.getVehicles().length, 6);
});

test('detecta conflito e exige uma hora livre entre reservas', () => {
  const app = loadCore();
  app.saveReservations([{
    id: 1,
    partida: 'São Paulo',
    carro: '89',
    dataIda: '2026-08-01',
    dataVolta: '2026-08-01',
    horarioRetirada: '08:00',
    horarioDevolucao: '10:00'
  }]);
  assert.equal(app.findConflictingReservations('São Paulo', '89', '2026-08-01', '2026-08-01', '09:30', '11:00', null).length, 1);
  assert.equal(app.findConflictingReservations('São Paulo', '89', '2026-08-01', '2026-08-01', '10:00', '12:00', null).length, 1);
  assert.equal(app.findConflictingReservations('São Paulo', '89', '2026-08-01', '2026-08-01', '10:30', '12:00', null).length, 1);
  assert.equal(app.findConflictingReservations('São Paulo', '89', '2026-08-01', '2026-08-01', '11:00', '12:00', null).length, 0);
  app.saveReservationRules({
    maxConsecutiveDays:10,
    maxAdvanceDays:30,
    maxReservationsInWindow:2,
    reservationBufferMinutes:30
  });
  assert.equal(app.findConflictingReservations('São Paulo', '89', '2026-08-01', '2026-08-01', '10:30', '12:00', null).length, 0);
});

test('bloqueio operacional impede período sobreposto', () => {
  const app = loadCore();
  app.saveVehicleBlocks([{
    id: 'b1',
    filial: 'São Carlos',
    carro: '78',
    tipo: 'Revisão',
    dataInicio: '2026-08-10',
    dataFim: '2026-08-12'
  }]);
  assert.equal(app.findVehicleBlocks('São Carlos', '78', '2026-08-11', '2026-08-11', null).length, 1);
  assert.equal(app.findVehicleBlocks('São Carlos', '78', '2026-08-13', '2026-08-14', null).length, 0);
});

test('usa a capacidade cadastrada do veículo', () => {
  const app = loadCore();
  const vehicles = app.getVehicles();
  vehicles.find(v => v.filial === 'São Paulo' && v.codigo === '89').capacidade = 7;
  app.saveVehicles(vehicles);
  const reserva = {
    nome: 'Dimitri',
    partida: 'São Paulo',
    carro: '89',
    passageiros: [{ nome: 'Dimitri' }, { nome: 'Ana' }],
    passageirosConfirmados: 0
  };
  assert.equal(app.getVehicleCapacity(reserva), 7);
  assert.equal(app.getVagasRestantes(reserva), 5);
});

test('passageiro não pode ser tratado como criador da reserva', () => {
  const app = loadCore();
  const reservation = {
    criadorUsuarioId:'criador-id',
    nome:'Criador',
    passageiros:[{ nome:'Criador' }, { nome:'Administrador' }]
  };
  assert.equal(app.isReservationCreator(reservation, {
    id:'admin-id',
    nome:'Administrador',
    role:'admin'
  }), false);
  assert.equal(app.isReservationCreator(reservation, {
    id:'criador-id',
    nome:'Criador'
  }), true);
});

test('impede retirada antes da data e do horário agendados', () => {
  const app = loadCore();
  const reservation = {
    dataIda:'2026-08-15',
    horarioRetirada:'10:00'
  };
  assert.equal(
    app.canRegisterPickupNow(reservation, new Date(2026, 7, 15, 9, 44)),
    false
  );
  assert.equal(
    app.canRegisterPickupNow(reservation, new Date(2026, 7, 15, 9, 45)),
    true
  );
});

test('carona continua disponível após o horário e fecha ao registrar a retirada', () => {
  const app = loadCore();
  const reservation = {
    dataIda:'2026-08-10',
    horarioRetirada:'10:00',
    status:'confirmada'
  };
  assert.equal(
    app.reservationCanAcceptPassengers(reservation, new Date(2026, 7, 10, 9, 59)),
    true
  );
  assert.equal(
    app.reservationCanAcceptPassengers(reservation, new Date(2026, 7, 10, 10, 0)),
    true
  );
  assert.equal(
    app.reservationCanAcceptPassengers({ ...reservation, operacao:{ retirada:{} } }, new Date(2026, 7, 10, 9, 0)),
    false
  );
});

test('encerramento administrativo conclui a reserva e libera a devolução pendente', () => {
  const app = loadCore();
  const reservation = {
    id:'r-encerrada',
    criadorUsuarioId:'user-1',
    nome:'Motorista',
    status:'encerrada_administrativamente',
    operacao:{ retirada:{} }
  };
  assert.equal(app.isReservationCompleted(reservation), true);
  assert.equal(app.getPendingReturnReservation({ id:'user-1', nome:'Motorista' }, [reservation]), null);
});

test('identifica devolução pendente somente para o criador da reserva', () => {
  const app = loadCore();
  const pending = {
    id:'pendente',
    criadorUsuarioId:'motorista-id',
    nome:'Motorista',
    partida:'São Paulo',
    destino:'São Carlos',
    operacao:{ retirada:{ quilometragem:100 } },
    passageiros:[{ nome:'Motorista' }, { nome:'Passageiro' }]
  };
  assert.equal(app.getPendingReturnReservation({ id:'motorista-id', nome:'Motorista' }, [pending]), pending);
  assert.equal(app.getPendingReturnReservation({ id:'passageiro-id', nome:'Passageiro' }, [pending]), null);
  pending.operacao.devolucao = { quilometragem:120 };
  assert.equal(app.getPendingReturnReservation({ id:'motorista-id', nome:'Motorista' }, [pending]), null);
});

test('vincula passageiro a uma conta cadastrada e reconhece pelo id', () => {
  const app = loadCore();
  app.localStorage.setItem('capricar_diretorio_usuarios', JSON.stringify([
    { id:'passageiro-id', nome:'Maria da Silva', active:true }
  ]));
  const validation = app.validarListaPassageiros('Motorista', [
    { nome:'Maria da Silva', usuarioId:'passageiro-id' }
  ], 4);
  assert.equal(validation.ok, true);
  assert.equal(validation.passageiros[0].usuarioId, 'passageiro-id');
  const guestValidation = app.validarListaPassageiros('Motorista', ['Cliente Externo'], 4);
  assert.equal(guestValidation.ok, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(guestValidation.passageiros[0])),
    { nome:'Cliente Externo', externo:true }
  );
  assert.equal(app.isPassageiro({
    passageiros:[{ nome:'Nome antigo', usuarioId:'passageiro-id' }]
  }, { id:'passageiro-id', nome:'Nome atualizado' }), true);
});

test('sugere carona no mesmo dia e destino independentemente do horário e da volta', () => {
  const app = loadCore();
  app.saveReservations([{
    id: 90,
    nome: 'Motorista',
    partida: 'São Paulo',
    destino: 'São Carlos',
    carro: '89',
    dataIda: '2026-08-10',
    dataVolta: '2026-08-12',
    horarioRetirada: '05:00',
    horarioDevolucao: '22:00',
    passageiros: [{ nome:'Motorista' }],
    status: 'confirmada'
  }]);

  const sugestoes = app.findReservasCompativeis(
    'São Paulo',
    'São Carlos',
    '2026-08-10',
    'Passageiro'
  );
  assert.equal(sugestoes.length, 1);
});

test('avisa sobre rodízio somente em viagens envolvendo São Paulo e no horário restrito', () => {
  const app = loadCore();
  app.saveVehicles([{
    id:'rodizio-1',
    filial:'São Carlos',
    codigo:'CAR-1',
    marca:'Volkswagen',
    modelo:'Polo',
    placa:'ABC1D21',
    capacidade:5,
    ativo:true
  }]);

  const restrictedTrip = {
    partida:'São Carlos',
    destino:'São Paulo',
    carro:'CAR-1',
    dataIda:'2026-08-03',
    dataVolta:'2026-08-03',
    horarioRetirada:'08:00',
    horarioDevolucao:'09:00'
  };
  assert.equal(app.getRodizioWarning(restrictedTrip).finalDigit, '1');
  assert.equal(app.getRodizioWarning({ ...restrictedTrip, destino:'Bragança Paulista' }), null);
  assert.equal(app.getRodizioWarning({
    ...restrictedTrip,
    horarioRetirada:'10:00',
    horarioDevolucao:'16:30'
  }), null);
});

test('identifica horário de reserva que já passou', () => {
  const app = loadCore();
  assert.equal(
    app.isReservationPickupInPast('2026-08-15', '04:00', new Date(2026, 7, 15, 11, 0)),
    true
  );
  assert.equal(
    app.isReservationPickupInPast('2026-08-15', '12:00', new Date(2026, 7, 15, 11, 0)),
    false
  );
});

test('limita a reserva a 10 dias consecutivos por padrão', () => {
  const app = loadCore();
  const start = app.addDaysISO(app.todayISO(), 1);
  const end = app.addDaysISO(start, 10);
  const result = app.validateReservationRules('Usuário Teste', start, end, null);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'dataVolta');
});

test('permite exatamente 10 dias consecutivos', () => {
  const app = loadCore();
  const start = app.addDaysISO(app.todayISO(), 1);
  const end = app.addDaysISO(start, 9);
  assert.equal(app.validateReservationRules('Usuário Teste', start, end, null).ok, true);
});

test('limita a antecedência a 30 dias por padrão', () => {
  const app = loadCore();
  const start = app.addDaysISO(app.todayISO(), 31);
  const result = app.validateReservationRules('Usuário Teste', start, start, null);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'dataIda');
});

test('limita cada usuário a duas reservas na janela configurada', () => {
  const app = loadCore();
  const today = app.todayISO();
  app.saveReservations([
    { id: 1, nome: 'Usuário Teste', dataIda: app.addDaysISO(today, 2), dataVolta: app.addDaysISO(today, 2) },
    { id: 2, nome: 'Usuário Teste', dataIda: app.addDaysISO(today, 5), dataVolta: app.addDaysISO(today, 5) }
  ]);
  const result = app.validateReservationRules('Usuário Teste', app.addDaysISO(today, 8), app.addDaysISO(today, 8), null);
  assert.equal(result.ok, false);
  assert.match(result.message, /no máximo 2 reservas/);
});

test('edição não conta a própria reserva novamente', () => {
  const app = loadCore();
  const today = app.todayISO();
  app.saveReservations([
    { id: 1, nome: 'Usuário Teste', dataIda: app.addDaysISO(today, 2), dataVolta: app.addDaysISO(today, 2) },
    { id: 2, nome: 'Usuário Teste', dataIda: app.addDaysISO(today, 5), dataVolta: app.addDaysISO(today, 5) }
  ]);
  const result = app.validateReservationRules('Usuário Teste', app.addDaysISO(today, 3), app.addDaysISO(today, 3), 1);
  assert.equal(result.ok, true);
});

test('permite ao administrador alterar os limites persistidos', () => {
  const app = loadCore();
  app.saveReservationRules({
    maxConsecutiveDays: 15,
    maxAdvanceDays: 45,
    maxReservationsInWindow: 4,
    reservationBufferMinutes: 90,
    pickupAdvanceMinutes:20
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(app.getReservationRules())),
    {
      maxConsecutiveDays:15,
      maxAdvanceDays:45,
      maxReservationsInWindow:4,
      reservationBufferMinutes:90,
      pickupAdvanceMinutes:20
    }
  );
});

test('mostra somente horários com uma combinação disponível no dia', () => {
  const app = loadCore();
  const testDate = app.addDaysISO(app.todayISO(), 5);
  app.saveReservations([{
    id: 1,
    partida: 'São Paulo',
    carro: '89',
    dataIda: testDate,
    dataVolta: testDate,
    horarioRetirada: '08:00',
    horarioDevolucao: '10:00'
  }]);

  const allOptions = app.getAvailableReservationTimeOptions(
    'São Paulo', '89', testDate, testDate, '', null
  );
  assert.equal(allOptions.pickup.includes('08:00'), false);
  assert.equal(allOptions.pickup.includes('09:30'), false);
  assert.equal(allOptions.pickup.includes('07:30'), false);
  assert.equal(allOptions.pickup.includes('10:00'), false);
  assert.equal(allOptions.pickup.includes('06:00'), true);
  assert.equal(allOptions.pickup.includes('11:00'), true);

  const beforeReservation = app.getAvailableReservationTimeOptions(
    'São Paulo', '89', testDate, testDate, '06:00', null
  );
  assert.deepEqual(Array.from(beforeReservation.return), ['06:30', '07:00']);

  const afterReservation = app.getAvailableReservationTimeOptions(
    'São Paulo', '89', testDate, testDate, '11:00', null
  );
  assert.equal(afterReservation.return.includes('11:30'), true);
  assert.equal(afterReservation.return.includes('10:30'), false);
});

test('reserva devolvida vira histórico e não bloqueia mais o carro', () => {
  const app = loadCore();
  app.saveReservations([{
    id: 1,
    nome: 'Usuário Teste',
    partida: 'São Paulo',
    carro: '89',
    dataIda: '2026-08-13',
    dataVolta: '2026-08-14',
    horarioRetirada: '10:00',
    horarioDevolucao: '10:00',
    status: 'concluída',
    operacao: {
      retirada: { quilometragem: 100, combustivel: 'Cheio' },
      devolucao: { quilometragem: 120, combustivel: '3/4' }
    }
  }]);

  assert.equal(app.isReservationCompleted(app.getReservations()[0]), true);
  assert.equal(
    app.findConflictingReservations(
      'São Paulo', '89', '2026-08-13', '2026-08-14', '10:00', '10:00', null
    ).length,
    0
  );
});

test('reserva concluída não conta no limite de reservas ativas', () => {
  const app = loadCore();
  const today = app.todayISO();
  app.saveReservations([
    {
      id: 1,
      nome: 'Usuário Teste',
      dataIda: app.addDaysISO(today, 2),
      dataVolta: app.addDaysISO(today, 2),
      status: 'concluída'
    },
    {
      id: 2,
      nome: 'Usuário Teste',
      dataIda: app.addDaysISO(today, 5),
      dataVolta: app.addDaysISO(today, 5),
      status: 'confirmada'
    }
  ]);
  const result = app.validateReservationRules(
    'Usuário Teste',
    app.addDaysISO(today, 8),
    app.addDaysISO(today, 8),
    null
  );
  assert.equal(result.ok, true);
});
