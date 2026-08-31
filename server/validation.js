const { DEFAULT_RESERVATION_RULES } = require('../js/reservation-defaults');

class ValidationError extends Error {
  constructor(message, status = 400){
    super(message);
    this.status = status;
  }
}

function assert(condition, message){
  if(!condition) throw new ValidationError(message);
}

const MAX_PHOTO_BYTES = 1024 * 1024;

// Tipos de veículo aceitos (ver migration 022). 'carro' é o padrão dos
// registros anteriores à coluna.
const VEHICLE_TYPES = ['carro', 'van', 'onibus'];
const IMAGE_SIGNATURES = {
  png:[[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  jpeg:[[0xFF, 0xD8, 0xFF]],
  gif:[[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]]
};

function matchesSignature(buffer, signature){
  return buffer.length >= signature.length &&
    signature.every((byte, index) => buffer[index] === byte);
}

function bufferLooksLikeImage(buffer, subtype){
  if(subtype === 'webp'){
    return matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46]) &&
      buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  const normalized = subtype === 'jpg' ? 'jpeg' : subtype;
  const signatures = IMAGE_SIGNATURES[normalized] || [];
  return signatures.some(signature => matchesSignature(buffer, signature));
}

// Confere o conteúdo real da imagem (assinatura de bytes), não apenas o
// rótulo "data:image/..." informado pelo cliente, e recusa formatos como
// SVG que podem conter script. Usado tanto na validação de entrada quanto
// por server/reservations-store.js ao gravar a foto em disco.
function decodeImageDataUrl(value){
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/
    .exec(String(value || ''));
  assert(match, 'A foto deve ser uma imagem em formato PNG, JPEG, GIF ou WEBP.');
  const [, subtype, base64] = match;
  let buffer;
  try{
    buffer = Buffer.from(base64, 'base64');
  }catch{
    throw new ValidationError('A foto enviada está corrompida.');
  }
  assert(buffer.length > 0 && buffer.length <= MAX_PHOTO_BYTES, 'A foto deve ter no máximo 1 MB.');
  assert(bufferLooksLikeImage(buffer, subtype), 'O conteúdo da foto não corresponde a uma imagem válida.');
  return { subtype:subtype === 'jpg' ? 'jpeg' : subtype, buffer };
}

function validatePhotoDataUrl(value){
  decodeImageDataUrl(value);
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value){
  return EMAIL_PATTERN.test(String(value || '').trim());
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
  assert(Number.isInteger(Number(value.reservationBufferMinutes)) &&
    Number(value.reservationBufferMinutes) >= 0 && Number(value.reservationBufferMinutes) <= 1440,
    'O intervalo entre reservas deve ser um número inteiro entre 0 e 1440 minutos.');
  assert(Number.isInteger(Number(value.pickupAdvanceMinutes)) &&
    Number(value.pickupAdvanceMinutes) >= 0 && Number(value.pickupAdvanceMinutes) <= 1440,
    'A antecedência da retirada deve ser um número inteiro entre 0 e 1440 minutos.');
}

function validateBranches(value){
  assert(Array.isArray(value) && value.length <= 500, 'Lista de locais inválida.');
  ensureUniqueIds(value, 'locais');
  const names = new Set();
  value.forEach(branch => {
    const name = text(branch.nome, 'o nome do local', 120).toLowerCase();
    assert(!names.has(name), 'Já existe um local com esse nome.');
    names.add(name);
    assert(typeof branch.ativo === 'boolean', 'O status do local é inválido.');
  });
}

function validateVehicles(value, branches, currentVehicles){
  assert(Array.isArray(value) && value.length <= 5000, 'Lista de veículos inválida.');
  ensureUniqueIds(value, 'veículos');
  const branchNames = new Set(branches.map(branch => String(branch.nome).toLowerCase()));
  const keys = new Set();
  const plates = new Set();
  const currentById = new Map((currentVehicles || []).map(vehicle => [String(vehicle.id), vehicle]));
  value.forEach(vehicle => {
    const branch = text(vehicle.local, 'o local do veículo', 120);
    const code = text(vehicle.codigo, 'a referência interna do veículo', 40);
    const previous = currentById.get(String(vehicle.id));
    const legacyWithoutBrand = previous && !String(previous.marca || '').trim();
    text(vehicle.marca, 'a marca do veículo', 120, !legacyWithoutBrand);
    text(vehicle.modelo, 'o modelo do veículo', 120);
    const plate = text(vehicle.placa, 'a placa do veículo', 7).toUpperCase();
    assert(branchNames.has(branch.toLowerCase()), 'O veículo referencia um local inexistente.');
    assert(Number.isInteger(Number(vehicle.capacidade)) && Number(vehicle.capacidade) >= 1 && Number(vehicle.capacidade) <= 20,
      'A capacidade do veículo deve estar entre 1 e 20.');
    assert(typeof vehicle.ativo === 'boolean', 'O status do veículo é inválido.');
    // Campos novos: ausentes em veículos cadastrados antes da migration 022,
    // por isso são opcionais e caem no padrão em vez de recusar o registro.
    if(vehicle.tipo !== undefined && vehicle.tipo !== null && vehicle.tipo !== ''){
      assert(VEHICLE_TYPES.includes(String(vehicle.tipo)),
        'O tipo do veículo deve ser carro, van ou ônibus.');
    }
    if(vehicle.alugado !== undefined && vehicle.alugado !== null){
      assert(typeof vehicle.alugado === 'boolean', 'O campo "alugado" do veículo é inválido.');
    }
    if(vehicle.centroCusto) text(vehicle.centroCusto, 'o centro de custo do veículo', 60, false);
    const key = `${branch.toLowerCase()}|${code.toLowerCase()}`;
    assert(!keys.has(key), 'Já existe um veículo com essa placa.');
    keys.add(key);
    assert(!plates.has(plate), 'Já existe um veículo com essa placa.');
    plates.add(plate);
  });
}

function validateBlocks(value, vehicles){
  assert(Array.isArray(value) && value.length <= 10000, 'Lista de bloqueios inválida.');
  ensureUniqueIds(value, 'bloqueios');
  const vehicleKeys = new Set(vehicles.map(vehicle =>
    `${String(vehicle.local).toLowerCase()}|${String(vehicle.codigo).toLowerCase()}`
  ));
  value.forEach(block => {
    const branch = text(block.local, 'o local do bloqueio', 120);
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
    start:new Date(`${reservation.dataIda}T${reservation.horarioRetirada}:00Z`).getTime(),
    end:new Date(`${reservation.dataVolta}T${reservation.horarioDevolucao}:00Z`).getTime()
  };
}

function scheduledPickupTimestamp(reservation){
  return Date.parse(`${reservation.dataIda}T${reservation.horarioRetirada}:00-03:00`);
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
      if(photo.id && photo.url && !photo.dados) return;
      validatePhotoDataUrl(photo.dados);
    });
  }
  if(operation.retirada && operation.devolucao){
    assert(Number(operation.devolucao.quilometragem) >= Number(operation.retirada.quilometragem),
      'A quilometragem final não pode ser menor que a inicial.');
  }
}

function reservationOwnersMatch(first, second){
  const firstUserId = String(first && first.criadorUsuarioId || '').trim();
  const secondUserId = String(second && second.criadorUsuarioId || '').trim();
  if(firstUserId && secondUserId) return firstUserId === secondUserId;
  return String(first && first.nome || '').trim().toLowerCase() ===
    String(second && second.nome || '').trim().toLowerCase();
}

function hasPendingReturnForOwner(reservation, currentReservations){
  return (currentReservations || []).some(current =>
    current &&
    String(current.status || '').trim().toLowerCase() !== 'encerrada_administrativamente' &&
    current.operacao &&
    current.operacao.retirada &&
    !current.operacao.devolucao &&
    reservationOwnersMatch(reservation, current)
  );
}

function validateReservations(value, context){
  assert(Array.isArray(value) && value.length <= 20000, 'Lista de reservas inválida.');
  ensureUniqueIds(value, 'reservas');
  const rules = {
    ...DEFAULT_RESERVATION_RULES,
    ...(context.rules || {})
  };
  validateRules(rules);
  const today = todaySaoPaulo();
  const todayDay = dateDays(today);
  const vehicleMap = new Map(context.vehicles.map(vehicle => [
    `${String(vehicle.local).toLowerCase()}|${String(vehicle.codigo).toLowerCase()}`,
    vehicle
  ]));
  const blocks = context.blocks || [];
  const currentReservationsById = new Map(
    (context.currentReservations || []).map(reservation => [String(reservation.id), reservation])
  );
  const ownerCounts = new Map();
  const ranges = [];

  value.forEach(reservation => {
    const owner = text(reservation.nome, 'o solicitante', 120);
    const branch = text(reservation.partida, 'o local de partida', 120);
    text(reservation.destino, 'o destino', 160);
    const car = text(reservation.carro, 'o veículo', 40);
    text(reservation.motivo, 'o motivo da viagem', 2000, false);
    text(reservation.responsavel, 'o responsável', 120, false);
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
      ['concluida', 'cancelada', 'encerrada_administrativamente'].includes(normalizedStatus);

    if(normalizedStatus === 'encerrada_administrativamente'){
      const closure = reservation.encerramentoAdministrativo;
      assert(closure && typeof closure === 'object' && !Array.isArray(closure),
        'O encerramento administrativo é inválido.');
      const justification = text(closure.justificativa, 'a justificativa do encerramento', 2000);
      assert(justification.length >= 5, 'A justificativa do encerramento deve ter pelo menos 5 caracteres.');
      text(closure.registradoPor, 'o responsável pelo encerramento', 120);
      assert(!Number.isNaN(new Date(closure.registradoEm).getTime()),
        'A data do encerramento administrativo é inválida.');
      assert(reservation.operacao && reservation.operacao.retirada && !reservation.operacao.devolucao,
        'O encerramento administrativo só pode ser usado após uma retirada sem devolução.');
    }else{
      assert(!reservation.encerramentoAdministrativo,
        'Há um encerramento administrativo incompatível com o status da reserva.');
    }

    const previousReservation = currentReservationsById.get(String(reservation.id));
    if(!previousReservation){
      assert(
        !hasPendingReturnForOwner(reservation, context.currentReservations),
        'Você possui uma devolução pendente. Registre a devolução do veículo antes de criar uma nova reserva.'
      );
    }
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
    const scheduleChanged = !previousReservation ||
      previousReservation.dataIda !== reservation.dataIda ||
      previousReservation.horarioRetirada !== reservation.horarioRetirada;
    if(scheduleChanged){
      assert(scheduledPickupTimestamp(reservation) > Date.now(),
        'O horário de retirada selecionado já passou. Escolha um horário futuro.');
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
      String(block.local).toLowerCase() === branch.toLowerCase() &&
      String(block.carro).toLowerCase() === car.toLowerCase() &&
      !(reservation.dataVolta < block.dataInicio || reservation.dataIda > block.dataFim)
    );
    assert(!blockConflict, 'O veículo está bloqueado no período selecionado.');

    const range = reservationRange(reservation);
    const vehicleKey = `${branch.toLowerCase()}|${car.toLowerCase()}`;
    const reservationBufferMs = Number(rules.reservationBufferMinutes) * 60 * 1000;
    const conflict = ranges.some(existing =>
      existing.vehicleKey === vehicleKey &&
      range.start < existing.end + reservationBufferMs &&
      range.end > existing.start - reservationBufferMs
    );
    assert(!conflict,
      `O veículo está indisponível no período. A margem configurada entre reservas é de ${rules.reservationBufferMinutes} minutos.`);

    // Mesmo usuário não pode ter duas reservas (em veículos diferentes) com
    // horários que se sobrepõem - sem margem extra aqui, diferente do
    // conflito de veículo acima, já que a pessoa não precisa do mesmo tempo
    // de troca física que um carro precisa.
    const ownerConflict = ranges.some(existing =>
      reservationOwnersMatch(reservation, existing) &&
      range.start < existing.end &&
      range.end > existing.start
    );
    assert(!ownerConflict,
      'Você já tem outra reserva em um período que se sobrepõe a este horário.');

    ranges.push({ ...range, vehicleKey, nome:reservation.nome, criadorUsuarioId:reservation.criadorUsuarioId });

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
  if(name === 'vehicles') return validateVehicles(value, context.branches || [], context.currentVehicles || []);
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
  validateReservations,
  decodeImageDataUrl,
  isValidEmail,
  VEHICLE_TYPES,
  // Reaproveitados por server/driver-licenses.js - exportar evita que a
  // validação de data e a de mensagem de erro sigam caminhos diferentes.
  assert,
  validDate
};
