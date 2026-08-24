/* Persistência local das reservas */
function getReservations(){
  try{
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }catch(e){
    return [];
  }
}

function saveReservations(list){
  const previous = getReservations();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return typeof syncReservations === 'function'
    ? syncReservations(previous, list)
    : Promise.resolve({ localOnly:true, reservations:list });
}

// Retorna todas as reservas cuja faixa [dataIda, dataVolta] cobre a data informada (qualquer carro/rota).
function getReservationsCoveringDate(iso){
  return getReservations().filter(r =>
    !isReservationCompleted(r) && iso >= r.dataIda && iso <= r.dataVolta
  );
}

function carKey(partida, carro){
  return partida + '|' + carro;
}

/* =========================================================
   Cadastros operacionais e auditoria
   ========================================================= */
function readCollection(key, fallback){
  try{
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : (fallback || []);
  }catch(e){
    return fallback || [];
  }
}

function writeCollection(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function getBranches(){
  return readCollection(BRANCHES_KEY, []);
}

function saveBranches(list){
  writeCollection(BRANCHES_KEY, list);
  syncFleetGlobals();
  return typeof queueCollectionSync === 'function'
    ? queueCollectionSync('branches', list)
    : Promise.resolve();
}

function getVehicles(){
  return readCollection(VEHICLES_KEY, []);
}

function saveVehicles(list){
  writeCollection(VEHICLES_KEY, list);
  syncFleetGlobals();
  return typeof queueCollectionSync === 'function'
    ? queueCollectionSync('vehicles', list)
    : Promise.resolve();
}

function getVehicleBlocks(){
  return readCollection(BLOCKS_KEY, []);
}

function saveVehicleBlocks(list){
  writeCollection(BLOCKS_KEY, list);
  return typeof queueCollectionSync === 'function'
    ? queueCollectionSync('blocks', list)
    : Promise.resolve();
}

function getReservationRules(){
  const defaults = DEFAULT_RESERVATION_RULES;
  try{
    const stored = JSON.parse(localStorage.getItem(RULES_KEY) || 'null');
    if(!stored) return defaults;
    return {
      maxConsecutiveDays: Math.max(1, Number(stored.maxConsecutiveDays) || defaults.maxConsecutiveDays),
      maxAdvanceDays: Math.max(1, Number(stored.maxAdvanceDays) || defaults.maxAdvanceDays),
      maxReservationsInWindow: Math.max(1, Number(stored.maxReservationsInWindow) || defaults.maxReservationsInWindow),
      reservationBufferMinutes: Number.isFinite(Number(stored.reservationBufferMinutes))
        ? Math.min(1440, Math.max(0, Number(stored.reservationBufferMinutes)))
        : defaults.reservationBufferMinutes,
      pickupAdvanceMinutes:Number.isFinite(Number(stored.pickupAdvanceMinutes))
        ? Math.min(1440, Math.max(0, Number(stored.pickupAdvanceMinutes)))
        : defaults.pickupAdvanceMinutes
    };
  }catch(e){
    return defaults;
  }
}

function saveReservationRules(rules){
  const normalized = {
    maxConsecutiveDays: Math.max(1, Number(rules.maxConsecutiveDays) || DEFAULT_RESERVATION_RULES.maxConsecutiveDays),
    maxAdvanceDays: Math.max(1, Number(rules.maxAdvanceDays) || DEFAULT_RESERVATION_RULES.maxAdvanceDays),
    maxReservationsInWindow: Math.max(1, Number(rules.maxReservationsInWindow) || DEFAULT_RESERVATION_RULES.maxReservationsInWindow),
    reservationBufferMinutes: Number.isFinite(Number(rules.reservationBufferMinutes))
      ? Math.min(1440, Math.max(0, Number(rules.reservationBufferMinutes)))
      : DEFAULT_RESERVATION_RULES.reservationBufferMinutes,
    pickupAdvanceMinutes:Number.isFinite(Number(rules.pickupAdvanceMinutes))
      ? Math.min(1440, Math.max(0, Number(rules.pickupAdvanceMinutes)))
      : DEFAULT_RESERVATION_RULES.pickupAdvanceMinutes
  };
  localStorage.setItem(RULES_KEY, JSON.stringify(normalized));
  if(typeof queueCollectionSync === 'function'){
    Object.defineProperty(normalized, 'saved', {
      value:queueCollectionSync('rules', normalized),
      enumerable:false
    });
  }
  return normalized;
}

function validateReservationRules(nome, dataIda, dataVolta, excludeId){
  const rules = getReservationRules();
  const today = todayISO();
  const advanceLimit = addDaysISO(today, rules.maxAdvanceDays);

  if(dataIda && dataIda < today){
    return { ok:false, field:'dataIda', message:'A data de ida não pode estar no passado.' };
  }

  if(dataIda && dataIda > advanceLimit){
    return {
      ok:false,
      field:'dataIda',
      message:'A reserva pode ser feita com no máximo ' + rules.maxAdvanceDays + ' dias de antecedência (até ' + formatDate(advanceLimit) + ').'
    };
  }

  if(dataIda && dataVolta && daysBetweenInclusive(dataIda, dataVolta) > rules.maxConsecutiveDays){
    return {
      ok:false,
      field:'dataVolta',
      message:'O período máximo permitido é de ' + rules.maxConsecutiveDays + ' dias consecutivos.'
    };
  }

  if(nome && dataIda){
    const normalizedName = String(nome).trim().toLowerCase();
    const reservationsInWindow = getReservations().filter(reserva => {
      if(excludeId != null && String(reserva.id) === String(excludeId)) return false;
      if(isReservationCompleted(reserva)) return false;
      if(String(reserva.nome || '').trim().toLowerCase() !== normalizedName) return false;
      return reserva.dataIda >= today && reserva.dataIda <= advanceLimit;
    });
    if(reservationsInWindow.length >= rules.maxReservationsInWindow){
      return {
        ok:false,
        field:'dataIda',
        message:'Cada usuário pode ter no máximo ' + rules.maxReservationsInWindow + ' reservas dentro dos próximos ' + rules.maxAdvanceDays + ' dias.'
      };
    }
  }

  return { ok:true, rules:rules };
}

function getAuditLog(){
  return readCollection(AUDIT_KEY, []);
}

function logAudit(action, entity, entityId, details){
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const list = getAuditLog();
  list.unshift({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    user: user && user.nome ? user.nome : 'Sistema',
    action: action,
    entity: entity,
    entityId: String(entityId == null ? '' : entityId),
    details: details || ''
  });
  writeCollection(AUDIT_KEY, list.slice(0, 2000));
  if(typeof apiRequest === 'function' && databaseHydrated){
    apiRequest('/api/state/audit/event', {
      method:'POST',
      body:{ action:action, entity:entity, entityId:entityId, details:details || '' }
    }).catch(error => console.error('Falha ao registrar auditoria:', error));
  }
}

function initializeFleetData(){
  if(getBranches().length === 0){
    const defaults = Object.keys(CARROS_POR_FILIAL).map((nome, index) => ({
      id: 'filial-' + (index + 1),
      nome: nome,
      ativo: true
    }));
    writeCollection(BRANCHES_KEY, defaults);
  }

  if(getVehicles().length === 0){
    const vehicles = [];
    Object.keys(CARROS_POR_FILIAL).forEach(filial => {
      (CARROS_POR_FILIAL[filial] || []).forEach(codigo => {
        vehicles.push({
          id: 'veiculo-' + filial.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + codigo,
          filial: filial,
          codigo: codigo,
          marca: 'Volkswagen',
          modelo: 'Polo',
          placa: '',
          capacidade: CAPACIDADE_MAXIMA,
          ativo: true
        });
      });
    });
    writeCollection(VEHICLES_KEY, vehicles);
  }
  syncFleetGlobals();
}

function syncFleetGlobals(){
  const filiais = getBranches().filter(f => f.ativo !== false);
  const veiculos = getVehicles().filter(v => v.ativo !== false);

  Object.keys(CARROS_POR_FILIAL).forEach(key => delete CARROS_POR_FILIAL[key]);
  filiais.forEach(f => {
    CARROS_POR_FILIAL[f.nome] = veiculos
      .filter(v => v.filial === f.nome)
      .map(v => String(v.codigo));
  });
  CIDADES = filiais.map(f => f.nome);
}

function getVehicle(partida, codigo){
  return getVehicles().find(v => v.filial === partida && String(v.codigo) === String(codigo)) || null;
}

function getVehicleBrand(vehicle){
  if(!vehicle) return '';
  if(String(vehicle.marca || '').trim()) return String(vehicle.marca).trim();
  const legacyParts = String(vehicle.modelo || '').trim().split(/\s+/).filter(Boolean);
  return legacyParts.length > 1 ? legacyParts[0] : '';
}

function getVehicleModelName(vehicle){
  if(!vehicle) return '';
  const model = String(vehicle.modelo || '').trim();
  if(String(vehicle.marca || '').trim()) return model;
  const legacyParts = model.split(/\s+/).filter(Boolean);
  return legacyParts.length > 1 ? legacyParts.slice(1).join(' ') : model;
}

function getVehicleFullModel(vehicle){
  if(!vehicle) return 'Veículo';
  return [getVehicleBrand(vehicle), getVehicleModelName(vehicle)].filter(Boolean).join(' ') || 'Veículo';
}

function getPassengerDirectory(){
  try{
    const data = JSON.parse(localStorage.getItem(USER_DIRECTORY_KEY) || '[]');
    return Array.isArray(data) ? data.filter(user => user && user.active !== false && user.id && user.nome) : [];
  }catch(error){
    return [];
  }
}

function findPassengerDirectoryUser(value){
  const normalized = String(value || '').trim().toLocaleLowerCase('pt-BR');
  if(!normalized) return null;
  return getPassengerDirectory().find(user =>
    String(user.nome || '').trim().toLocaleLowerCase('pt-BR') === normalized
  ) || null;
}

function getVehicleDisplayName(reserva){
  if(!reserva) return 'Veículo não identificado';
  const vehicle = getVehicle(reserva.partida, reserva.carro);
  if(!vehicle) return reserva.carro || 'Veículo não identificado';
  return getVehicleFullModel(vehicle) + (vehicle.placa ? ' · ' + vehicle.placa : '');
}

function getVehicleCapacity(reserva){
  const vehicle = getVehicle(reserva.partida, reserva.carro);
  return vehicle && Number(vehicle.capacidade) > 0 ? Number(vehicle.capacidade) : CAPACIDADE_MAXIMA;
}

function findVehicleBlocks(partida, carro, dataIda, dataVolta, excludeId){
  return getVehicleBlocks().filter(block => {
    if(block.filial !== partida || String(block.carro) !== String(carro)) return false;
    if(excludeId != null && String(block.id) === String(excludeId)) return false;
    return !(dataVolta < block.dataInicio || dataIda > block.dataFim);
  });
}

initializeFleetData();
