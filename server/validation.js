class ValidationError extends Error {
  constructor(message, status = 400){
    super(message);
    this.status = status;
  }
}

function assert(condition, message){
  if(!condition) throw new ValidationError(message);
}

function text(value, label, max, required = true){
  const normalized = String(value == null ? '' : value).trim();
  assert(!required || normalized.length > 0, `Informe ${label}.`);
  assert(normalized.length <= max, `${label} excede o limite de ${max} caracteres.`);
  assert(!/[<>]/.test(normalized), `${label} contém caracteres não permitidos.`);
  assert(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized),
    `${label} contém caracteres de controle não permitidos.`);
  return normalized;
}

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value){
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function dateDays(iso){
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86400000);
}

function todaySaoPaulo(){
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Sao_Paulo',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).format(new Date());
}

function ensureUniqueIds(items, label){
  const ids = new Set();
  for(const item of items){
    const id = text(item && item.id, `identificador de ${label}`, 100);
    assert(!ids.has(id), `Há ${label} com identificadores duplicados.`);
    ids.add(id);
  }
}

function validateRules(value){
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Regras inválidas.');
  for(const key of ['maxConsecutiveDays', 'maxAdvanceDays', 'maxReservationsInWindow']){
    assert(Number.isInteger(Number(value[key])) && Number(value[key]) >= 1 && Number(value[key]) <= 365,
      'Os limites das regras devem ser números inteiros entre 1 e 365.');
  }
}

function validateBranches(value){
  assert(Array.isArray(value) && value.length <= 500, 'Lista de filiais inválida.');
  ensureUniqueIds(value, 'filiais');
  const names = new Set();
  value.forEach(branch => {
    const name = text(branch.nome, 'o nome da filial', 120).toLowerCase();
    assert(!names.has(name), 'Já existe uma filial com esse nome.');
    names.add(name);
    assert(typeof branch.ativo === 'boolean', 'O status da filial é inválido.');
  });
}

function validateVehicles(value, branches){
  assert(Array.isArray(value) && value.length <= 5000, 'Lista de veículos inválida.');
  ensureUniqueIds(value, 'veículos');
  const branchNames = new Set(branches.map(branch => String(branch.nome).toLowerCase()));
  const keys = new Set();
  const plates = new Set();
  value.forEach(vehicle => {
    const branch = text(vehicle.filial, 'a filial do veículo', 120);
    const code = text(vehicle.codigo, 'a identificação do veículo', 40);
    text(vehicle.modelo, 'o modelo do veículo', 120);
    const plate = text(vehicle.placa, 'a placa do veículo', 10, false).toUpperCase();
    assert(branchNames.has(branch.toLowerCase()), 'O veículo referencia uma filial inexistente.');
    assert(Number.isInteger(Number(vehicle.capacidade)) && Number(vehicle.capacidade) >= 1 && Number(vehicle.capacidade) <= 20,
      'A capacidade do veículo deve estar entre 1 e 20.');
    assert(typeof vehicle.ativo === 'boolean', 'O status do veículo é inválido.');
    const key = `${branch.toLowerCase()}|${code.toLowerCase()}`;
    assert(!keys.has(key), 'Já existe um veículo com essa identificação na filial.');
    keys.add(key);
    if(plate){
      assert(!plates.has(plate), 'Já existe um veículo com essa placa.');
      plates.add(plate);
    }
  });
}

function validateBlocks(value, vehicles){
  assert(Array.isArray(value) && value.length <= 10000, 'Lista de bloqueios inválida.');
  ensureUniqueIds(value, 'bloqueios');
  const vehicleKeys = new Set(vehicles.map(vehicle =>
    `${String(vehicle.filial).toLowerCase()}|${String(vehicle.codigo).toLowerCase()}`
  ));
  value.forEach(block => {
    const branch = text(block.filial, 'a filial do bloqueio', 120);
    const car = text(block.carro, 'o veículo do bloqueio', 40);
    text(block.tipo, 'o motivo do bloqueio', 40);
    text(block.observacoes, 'as observações do bloqueio', 2000, false);
    assert(validDate(block.dataInicio) && validDate(block.dataFim) && block.dataFim >= block.dataInicio,
      'O período do bloqueio é inválido.');
    assert(vehicleKeys.has(`${branch.toLowerCase()}|${car.toLowerCase()}`),
      'O bloqueio referencia um veículo inexistente.');
  });
}

function reservationRange(reservation){
  return {
    start:`${reservation.dataIda}T${reservation.horarioRetirada}`,
    end:`${reservation.dataVolta}T${reservation.horarioDevolucao}`
  };
}

function validateOperation(operation){
  if(!operation) return;
  assert(operation && typeof operation === 'object' && !Array.isArray(operation), 'Registro operacional inválido.');
  for(const phase of ['retirada', 'devolucao']){
    const record = operation[phase];
    if(!record) continue;
    assert(Number.isInteger(Number(record.quilometragem)) && Number(record.quilometragem) >= 0,
      'A quilometragem deve ser um número inteiro positivo.');
    text(record.combustivel, 'o nível de combustível', 30);
    text(record.avarias, 'as avarias', 4000, false);
    text(record.registradoPor, 'o responsável pelo registro', 120);
    assert(!Number.isNaN(new Date(record.registradoEm).getTime()), 'A data do registro operacional é inválida.');
    const photos = Array.isArray(record.fotos) ? record.fotos : [];
    assert(photos.length <= 3, 'Cada registro pode conter no máximo 3 fotos.');
    photos.forEach(photo => {
      text(photo.nome, 'o nome da foto', 255, false);
      text(photo.tipo, 'o tipo da foto', 100, false);
      const data = String(photo.dados || '');
      assert(data.startsWith('data:image/') && data.length <= 1400000,
        'A foto deve ser uma imagem de até 1 MB.');
    });
  }
  if(operation.retirada && operation.devolucao){
    assert(Number(operation.devolucao.quilometragem) >= Number(operation.retirada.quilometragem),
      'A quilometragem final não pode ser menor que a inicial.');
  }
}

function validateReservations(value, context){
  assert(Array.isArray(value) && value.length <= 20000, 'Lista de reservas inválida.');
  ensureUniqueIds(value, 'reservas');
  const rules = context.rules || {
    maxConsecutiveDays:10,
    maxAdvanceDays:30,
    maxReservationsInWindow:2
  };
  validateRules(rules);
  const today = todaySaoPaulo();
  const todayDay = dateDays(today);
  const vehicleMap = new Map(context.vehicles.map(vehicle => [
    `${String(vehicle.filial).toLowerCase()}|${String(vehicle.codigo).toLowerCase()}`,
    vehicle
  ]));
  const blocks = context.blocks || [];
  const ownerCounts = new Map();
  const ranges = [];

  value.forEach(reservation => {
    const owner = text(reservation.nome, 'o solicitante', 120);
    const branch = text(reservation.partida, 'o local de partida', 120);
    text(reservation.destino, 'o destino', 160);
    const car = text(reservation.carro, 'o veículo', 40);
    text(reservation.motivo, 'o motivo da viagem', 2000);
    text(reservation.responsavel || owner, 'o responsável', 120);
    assert(validDate(reservation.dataIda) && validDate(reservation.dataVolta), 'A data da reserva é inválida.');
    assert(validTime(reservation.horarioRetirada) && validTime(reservation.horarioDevolucao),
      'O horário da reserva é inválido.');
    const startDay = dateDays(reservation.dataIda);
    const endDay = dateDays(reservation.dataVolta);
    const normalizedStatus = String(reservation.status || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const historical =
      endDay < todayDay ||
      !!(reservation.operacao && reservation.operacao.devolucao) ||
      ['concluida', 'cancelada'].includes(normalizedStatus);
    assert(endDay >= startDay, 'A devolução não pode ocorrer antes da retirada.');
    assert(historical || endDay - startDay + 1 <= Number(rules.maxConsecutiveDays),
      `A reserva não pode ultrapassar ${rules.maxConsecutiveDays} dias consecutivos.`);
    assert(historical || (startDay >= todayDay && startDay <= todayDay + Number(rules.maxAdvanceDays)),
      `A reserva deve começar dentro dos próximos ${rules.maxAdvanceDays} dias.`);
    if(reservation.dataIda === reservation.dataVolta){
      assert(reservation.horarioDevolucao > reservation.horarioRetirada,
        'A devolução deve ocorrer depois da retirada.');
    }

    if(historical){
      const historicalPassengers = Array.isArray(reservation.passageiros) ? reservation.passageiros : [];
      const historicalPassengerNames = historicalPassengers.map(passenger =>
        text(passenger && passenger.nome, 'o nome do passageiro', 120).toLowerCase()
      );
      assert(
        new Set(historicalPassengerNames).size === historicalPassengerNames.length,
        'Existem passageiros duplicados.'
      );
      validateOperation(reservation.operacao);
      return;
    }

    const vehicle = vehicleMap.get(`${branch.toLowerCase()}|${car.toLowerCase()}`);
    assert(vehicle && vehicle.ativo !== false, 'O veículo selecionado não está disponível.');
    const passengers = Array.isArray(reservation.passageiros) ? reservation.passageiros : [];
    const passengerNames = passengers.map(passenger =>
      text(passenger && passenger.nome, 'o nome do passageiro', 120).toLowerCase()
    );
    assert(new Set(passengerNames).size === passengerNames.length, 'Existem passageiros duplicados.');
    assert(passengers.length + Number(reservation.passageirosConfirmados || 0) <= Number(vehicle.capacidade),
      'A quantidade de ocupantes excede a capacidade do veículo.');
    validateOperation(reservation.operacao);

    const blockConflict = blocks.some(block =>
      String(block.filial).toLowerCase() === branch.toLowerCase() &&
      String(block.carro).toLowerCase() === car.toLowerCase() &&
      !(reservation.dataVolta < block.dataInicio || reservation.dataIda > block.dataFim)
    );
    assert(!blockConflict, 'O veículo está bloqueado no período selecionado.');

    const range = reservationRange(reservation);
    const vehicleKey = `${branch.toLowerCase()}|${car.toLowerCase()}`;
    const conflict = ranges.some(existing =>
      existing.vehicleKey === vehicleKey &&
      range.start < existing.end &&
      range.end > existing.start
    );
    assert(!conflict, 'Existem reservas conflitantes para o mesmo veículo e horário.');
    ranges.push({ ...range, vehicleKey });

    if(startDay >= todayDay && startDay <= todayDay + Number(rules.maxAdvanceDays)){
      const ownerKey = owner.toLowerCase();
      ownerCounts.set(ownerKey, (ownerCounts.get(ownerKey) || 0) + 1);
      assert(ownerCounts.get(ownerKey) <= Number(rules.maxReservationsInWindow),
        `Cada usuário pode ter no máximo ${rules.maxReservationsInWindow} reservas no período configurado.`);
    }
  });
}

function validateCollection(name, value, context){
  if(name === 'rules') return validateRules(value);
  if(name === 'branches') return validateBranches(value);
  if(name === 'vehicles') return validateVehicles(value, context.branches || []);
  if(name === 'blocks') return validateBlocks(value, context.vehicles || []);
  if(name === 'reservations') return validateReservations(value, context);
  throw new ValidationError('Coleção desconhecida.', 404);
}

module.exports = {
  ValidationError,
  validateCollection,
  validateRules,
  validateBranches,
  validateVehicles,
  validateBlocks,
  validateReservations
};
