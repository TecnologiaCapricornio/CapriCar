const crypto = require('node:crypto');
const { query, withTransaction } = require('./db');
const { decodeImageDataUrl } = require('./validation');
const { savePhotoFile } = require('./photo-storage');

function normalizeName(value){
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function isUuid(value){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function canViewAllReservations(user){
  return user && (user.role === 'admin' || !!(user.permissions && (
    user.permissions.reservations || user.permissions.reports || user.permissions.audit
  )));
}

function dateTimeParts(value){
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value || '';
  return { date:`${get('year')}-${get('month')}-${get('day')}`, time:`${get('hour')}:${get('minute')}` };
}

function reservationTimestamp(date, time){
  const parsed = new Date(`${String(date)}T${String(time)}:00-03:00`);
  if(Number.isNaN(parsed.getTime())) throw Object.assign(new Error('Data ou horário de reserva inválido.'), { status:400 });
  return parsed;
}

function statusFromDto(reservation){
  const status = String(reservation && reservation.status || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if(status === 'encerrada_administrativamente') return 'administratively_closed';
  if(reservation && reservation.operacao && reservation.operacao.devolucao) return 'completed';
  if(reservation && reservation.operacao && reservation.operacao.retirada) return 'in_use';
  if(['cancelada', 'cancelled'].includes(status)) return 'cancelled';
  if(['concluida', 'completed'].includes(status)) return 'completed';
  return 'confirmed';
}

function statusToDto(status){
  if(status === 'administratively_closed') return 'encerrada_administrativamente';
  if(status === 'completed') return 'concluída';
  if(status === 'cancelled') return 'cancelada';
  if(status === 'in_use') return 'em uso';
  return 'confirmada';
}

async function resolveUser(client, preferredId, preferredName, fallbackId){
  if(isUuid(preferredId)){
    const byId = await client.query('SELECT id, display_name FROM users WHERE id = $1', [preferredId]);
    if(byId.rows[0]) return byId.rows[0];
  }
  if(String(preferredName || '').trim()){
    const byName = await client.query(
      `SELECT id, display_name FROM users
        WHERE LOWER(display_name) = LOWER($1)
        ORDER BY deleted_at NULLS FIRST, active DESC
        LIMIT 1`,
      [String(preferredName).trim()]
    );
    if(byName.rows[0]) return byName.rows[0];
  }
  if(isUuid(fallbackId)){
    const fallback = await client.query('SELECT id, display_name FROM users WHERE id = $1', [fallbackId]);
    if(fallback.rows[0]) return fallback.rows[0];
  }
  const admin = await client.query(
    `SELECT id, display_name FROM users
      WHERE deleted_at IS NULL
      ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at
      LIMIT 1`
  );
  if(!admin.rows[0]) throw new Error('Nenhum usuário disponível para vincular a reserva.');
  return admin.rows[0];
}

async function resolvePassengerUser(client, preferredId, preferredName){
  if(isUuid(preferredId)){
    const byId = await client.query(
      'SELECT id, display_name FROM users WHERE id = $1 AND deleted_at IS NULL',
      [preferredId]
    );
    if(byId.rows[0]) return byId.rows[0];
  }
  if(String(preferredName || '').trim()){
    const byName = await client.query(
      `SELECT id, display_name FROM users
        WHERE LOWER(display_name) = LOWER($1)
          AND deleted_at IS NULL
        ORDER BY active DESC, created_at
        LIMIT 1`,
      [String(preferredName).trim()]
    );
    if(byName.rows[0]) return byName.rows[0];
  }
  return null;
}

async function ensureBranch(client, legacyId, name){
  const branchName = String(name || '').trim();
  if(!branchName) throw Object.assign(new Error('Local da reserva não informado.'), { status:400 });
  const existing = await client.query(
    `SELECT id FROM branches
      WHERE ($1 <> '' AND legacy_id = $1) OR LOWER(name) = LOWER($2)
      ORDER BY CASE WHEN legacy_id = $1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [String(legacyId || ''), branchName]
  );
  if(existing.rows[0]){
    await client.query(
      `UPDATE branches SET legacy_id = COALESCE(legacy_id, NULLIF($1, '')), name = $2
        WHERE id = $3`,
      [String(legacyId || ''), branchName, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const inserted = await client.query(
    `INSERT INTO branches (legacy_id, name, active)
     VALUES (NULLIF($1, ''), $2, TRUE) RETURNING id`,
    [String(legacyId || ''), branchName]
  );
  return inserted.rows[0].id;
}

function splitVehicleModel(vehicle){
  const brand = String(vehicle && (vehicle.marca || vehicle.brand) || '').trim();
  const rawModel = String(vehicle && (vehicle.modelo || vehicle.model) || '').trim();
  if(brand) return { brand, model:rawModel || 'Não informado' };
  const pieces = rawModel.split(/\s+/).filter(Boolean);
  return pieces.length > 1
    ? { brand:pieces[0], model:pieces.slice(1).join(' ') }
    : { brand:'Não informado', model:rawModel || 'Não informado' };
}

async function ensureVehicle(client, branchId, vehicle){
  const legacyId = String(vehicle && vehicle.id || '');
  const code = String(vehicle && (vehicle.codigo || vehicle.code) || '').trim();
  const plate = String(vehicle && (vehicle.placa || vehicle.plate) || '').trim().toUpperCase();
  if(!code) throw Object.assign(new Error('Veículo da reserva não informado.'), { status:400 });
  const names = splitVehicleModel(vehicle);
  const existing = await client.query(
    `SELECT id FROM vehicles
      WHERE ($1 <> '' AND legacy_id = $1)
         OR ($2 <> '' AND UPPER(COALESCE(plate, '')) = $2)
         OR (branch_id = $3 AND LOWER(code) = LOWER($4))
      ORDER BY CASE WHEN legacy_id = $1 THEN 0 WHEN UPPER(COALESCE(plate, '')) = $2 THEN 1 ELSE 2 END
      LIMIT 1`,
    [legacyId, plate, branchId, code]
  );
  if(existing.rows[0]){
    await client.query(
      `UPDATE vehicles
          SET legacy_id = COALESCE(legacy_id, NULLIF($1, '')), branch_id = $2, code = $3,
              plate = NULLIF($4, ''), brand = $5, model = $6, capacity = $7,
              active = $8
        WHERE id = $9`,
      [legacyId, branchId, code, plate, names.brand, names.model,
        Math.max(1, Math.min(20, Number(vehicle.capacidade || vehicle.capacity) || 5)),
        vehicle.ativo !== false && vehicle.active !== false, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const inserted = await client.query(
    `INSERT INTO vehicles
       (legacy_id, branch_id, code, plate, brand, model, capacity, active)
     VALUES (NULLIF($1, ''), $2, $3, NULLIF($4, ''), $5, $6, $7, $8)
     RETURNING id`,
    [legacyId, branchId, code, plate, names.brand, names.model,
      Math.max(1, Math.min(20, Number(vehicle.capacidade || vehicle.capacity) || 5)),
      vehicle.ativo !== false && vehicle.active !== false]
  );
  return inserted.rows[0].id;
}

async function loadFleetState(client){
  const state = await client.query(
    `SELECT collection_name, value FROM application_state
      WHERE collection_name IN ('branches', 'vehicles')`
  );
  const values = Object.fromEntries(state.rows.map(row => [row.collection_name, row.value]));
  return {
    branches:Array.isArray(values.branches) ? values.branches : [],
    vehicles:Array.isArray(values.vehicles) ? values.vehicles : []
  };
}

async function ensureFleetFromState(client, fleet){
  const branchIds = new Map();
  for(const branch of fleet.branches){
    branchIds.set(String(branch.nome).toLocaleLowerCase('pt-BR'), await ensureBranch(client, branch.id, branch.nome));
  }
  for(const vehicle of fleet.vehicles){
    let branchId = branchIds.get(String(vehicle.local).toLocaleLowerCase('pt-BR'));
    if(!branchId) branchId = await ensureBranch(client, '', vehicle.local);
    await ensureVehicle(client, branchId, vehicle);
  }
}

async function nextReservationNumber(client, preferred){
  const number = Number(preferred);
  if(Number.isSafeInteger(number) && number > 0){
    await client.query(
      `UPDATE reservation_number_counter SET last_number = GREATEST(last_number, $1) WHERE id = 1`,
      [number]
    );
    return number;
  }
  const result = await client.query(
    `UPDATE reservation_number_counter SET last_number = last_number + 1 WHERE id = 1 RETURNING last_number`
  );
  return Number(result.rows[0].last_number);
}

async function replacePassengers(client, reservationId, passengers){
  await client.query('DELETE FROM reservation_passengers WHERE reservation_id = $1', [reservationId]);
  let order = 0;
  for(const passenger of (Array.isArray(passengers) ? passengers : [])){
    const name = String(passenger && passenger.nome || '').trim();
    if(!name) continue;
    const user = passenger && passenger.externo !== true
      ? await resolvePassengerUser(client, passenger.usuarioId, name)
      : null;
    await client.query(
      `INSERT INTO reservation_passengers
         (reservation_id, user_id, passenger_name, is_external, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [reservationId, user && user.id || null, name, passenger.externo === true || !user, order++]
    );
  }
}

async function upsertOperation(client, reservationId, phase, record, actor){
  if(!record) return;
  const dbPhase = phase === 'retirada' ? 'pickup' : 'return';
  const existing = await client.query(
    'SELECT id FROM vehicle_operations WHERE reservation_id = $1 AND phase = $2',
    [reservationId, dbPhase]
  );
  let operationId;
  if(existing.rows[0]){
    operationId = existing.rows[0].id;
  }else{
    const inserted = await client.query(
      `INSERT INTO vehicle_operations
         (reservation_id, phase, odometer_km, fuel_level, damages_notes, recorded_by, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
      [reservationId, dbPhase, Number(record.quilometragem), String(record.combustivel || ''),
        String(record.avarias || ''), actor.id]
    );
    operationId = inserted.rows[0].id;
  }
  const currentPhotos = await client.query(
    'SELECT COUNT(*)::int AS total FROM operation_photos WHERE operation_id = $1',
    [operationId]
  );
  let count = Number(currentPhotos.rows[0].total);
  for(const photo of (Array.isArray(record.fotos) ? record.fotos : [])){
    if(!photo || (!photo.dados && !photo.dataUrl) || count >= 3) continue;
    let decoded;
    try{
      decoded = decodeImageDataUrl(photo.dados || photo.dataUrl);
    }catch{
      continue;
    }
    const storageKey = savePhotoFile(decoded.buffer, decoded.subtype);
    const id = crypto.randomUUID();
    const name = String(photo.nome || photo.name || 'foto').slice(0, 255);
    await client.query(
      `INSERT INTO operation_photos
         (id, operation_id, storage_key, original_name, content_type, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, operationId, storageKey, name, `image/${decoded.subtype}`, decoded.buffer.length]
    );
    count++;
  }
}

async function findVehicleFromState(client, reservation, fleet){
  const vehicle = fleet.vehicles.find(item =>
    String(item.local).toLocaleLowerCase('pt-BR') === String(reservation.partida).toLocaleLowerCase('pt-BR') &&
    String(item.codigo).toLocaleLowerCase('pt-BR') === String(reservation.carro).toLocaleLowerCase('pt-BR')
  ) || {
    id:'', local:reservation.partida, codigo:reservation.carro,
    marca:reservation.marca || '', modelo:reservation.modelo || 'Não informado', capacidade:5, ativo:true
  };
  const branch = fleet.branches.find(item => normalizeName(item.nome) === normalizeName(reservation.partida));
  const branchId = await ensureBranch(client, branch && branch.id, reservation.partida);
  return { branchId, vehicleId:await ensureVehicle(client, branchId, vehicle) };
}

async function persistReservation(client, reservation, actor, options){
  const opts = options || {};
  const legacyId = String(reservation.id || reservation.legacyId || '').trim() || String(Date.now());
  const current = await client.query(
    'SELECT * FROM reservations WHERE legacy_id = $1 FOR UPDATE', [legacyId]
  );
  const fleet = opts.fleet || await loadFleetState(client);
  const relation = await findVehicleFromState(client, reservation, fleet);
  const requester = current.rows[0]
    ? await resolveUser(client, current.rows[0].requester_id, current.rows[0].requester_name, actor && actor.id)
    : await resolveUser(client, reservation.criadorUsuarioId, reservation.nome, actor && actor.id);
  const start = reservationTimestamp(reservation.dataIda, reservation.horarioRetirada);
  const end = reservationTimestamp(reservation.dataVolta, reservation.horarioDevolucao);
  if(end <= start) throw Object.assign(new Error('A devolução deve ocorrer depois da retirada.'), { status:400 });
  const status = statusFromDto(reservation);
  const closure = reservation.encerramentoAdministrativo || null;
  const closureAt = closure ? (opts.migration ? new Date(closure.registradoEm || Date.now()) : new Date()) : null;
  const closureBy = closure
    ? (opts.migration && isUuid(closure.registradoPorUsuarioId) ? closure.registradoPorUsuarioId : actor.id)
    : null;
  const closureByName = closure
    ? (opts.migration ? String(closure.registradoPor || actor.display_name || actor.nome || '') : String(actor.nome || actor.display_name || 'Gestão'))
    : null;
  const reservationNumber = current.rows[0]
    ? Number(current.rows[0].reservation_number)
    : await nextReservationNumber(client, reservation.numeroReserva);
  let reservationId;
  if(current.rows[0]){
    reservationId = current.rows[0].id;
    await client.query(
      `UPDATE reservations SET
         requester_name=$2, requester_email=$3, responsible_name=$4, branch_id=$5,
         vehicle_id=$6, destination=$7, reason=$8, starts_at=$9, ends_at=$10,
         confirmed_passenger_count=$11, status=$12,
         administrative_closed_at=$13, administrative_closed_by=$14,
         administrative_closed_by_name=$15, administrative_closure_reason=$16
       WHERE id=$1`,
      [reservationId, String(reservation.nome || requester.display_name), String(reservation.email || ''),
        String(reservation.responsavel || ''), relation.branchId, relation.vehicleId,
        String(reservation.destino || ''), String(reservation.motivo || ''), start, end,
        Math.max(0, Math.min(20, Number(reservation.passageirosConfirmados) || 0)), status,
        closureAt, closureBy, closureByName, closure && String(closure.justificativa || '')]
    );
  }else{
    const inserted = await client.query(
      `INSERT INTO reservations
         (legacy_id, reservation_number, requester_id, requester_name, requester_email,
          responsible_name, branch_id, vehicle_id, destination, reason, starts_at, ends_at,
          confirmed_passenger_count, status, administrative_closed_at,
          administrative_closed_by, administrative_closed_by_name, administrative_closure_reason,
          created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [legacyId, reservationNumber, requester.id, String(reservation.nome || requester.display_name),
        String(reservation.email || ''), String(reservation.responsavel || ''), relation.branchId,
        relation.vehicleId, String(reservation.destino || ''), String(reservation.motivo || ''), start, end,
        Math.max(0, Math.min(20, Number(reservation.passageirosConfirmados) || 0)), status,
        closureAt, closureBy, closureByName, closure && String(closure.justificativa || ''),
        new Date(reservation.criadoEm || Date.now())]
    );
    reservationId = inserted.rows[0].id;
  }
  await replacePassengers(client, reservationId, reservation.passageiros);
  const operationActor = actor || requester;
  await upsertOperation(client, reservationId, 'retirada', reservation.operacao && reservation.operacao.retirada, operationActor);
  await upsertOperation(client, reservationId, 'devolucao', reservation.operacao && reservation.operacao.devolucao, operationActor);
  return { id:reservationId, legacyId, reservationNumber };
}

async function loadReservationData(executor){
  const run = executor && typeof executor.query === 'function' ? executor.query.bind(executor) : query;
  const reservations = await run(
    `SELECT r.*, b.name AS branch_name,
            v.code AS vehicle_code, v.plate, v.brand, v.model, v.capacity,
            closer.display_name AS closer_current_name
       FROM reservations r
       JOIN branches b ON b.id = r.branch_id
       JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN users closer ON closer.id = r.administrative_closed_by
      WHERE r.status <> 'cancelled'
      ORDER BY r.starts_at, r.reservation_number`
  );
  const ids = reservations.rows.map(row => row.id);
  if(!ids.length) return { rows:[], passengers:new Map(), operations:new Map(), photos:new Map() };
  const passengers = await run(
    `SELECT * FROM reservation_passengers
      WHERE reservation_id = ANY($1::uuid[]) AND left_at IS NULL
      ORDER BY reservation_id, sort_order, joined_at`, [ids]
  );
  const operations = await run(
    `SELECT o.*, u.display_name AS recorded_by_name
       FROM vehicle_operations o JOIN users u ON u.id = o.recorded_by
      WHERE o.reservation_id = ANY($1::uuid[])
      ORDER BY o.recorded_at`, [ids]
  );
  const operationIds = operations.rows.map(row => row.id);
  const photos = operationIds.length ? await run(
    `SELECT id, operation_id, original_name, content_type, file_size_bytes
       FROM operation_photos WHERE operation_id = ANY($1::uuid[]) ORDER BY created_at`, [operationIds]
  ) : { rows:[] };
  const group = (items, key) => items.reduce((map, item) => {
    const value = String(item[key]);
    if(!map.has(value)) map.set(value, []);
    map.get(value).push(item);
    return map;
  }, new Map());
  return {
    rows:reservations.rows,
    passengers:group(passengers.rows, 'reservation_id'),
    operations:group(operations.rows, 'reservation_id'),
    photos:group(photos.rows, 'operation_id')
  };
}

function fullDto(row, data){
  const start = dateTimeParts(row.starts_at);
  const end = dateTimeParts(row.ends_at);
  const passengers = (data.passengers.get(String(row.id)) || []).map(item => ({
    nome:item.passenger_name,
    ...(item.user_id ? { usuarioId:String(item.user_id) } : {}),
    ...(item.is_external ? { externo:true } : {})
  }));
  const operacao = {};
  for(const operation of (data.operations.get(String(row.id)) || [])){
    const phase = operation.phase === 'pickup' ? 'retirada' : 'devolucao';
    operacao[phase] = {
      quilometragem:Number(operation.odometer_km),
      combustivel:operation.fuel_level,
      avarias:operation.damages_notes || '',
      registradoPor:operation.recorded_by_name,
      registradoEm:operation.recorded_at,
      fotos:(data.photos.get(String(operation.id)) || []).map(photo => ({
        id:String(photo.id), nome:photo.original_name || 'foto', tipo:photo.content_type || 'image/*',
        tamanho:Number(photo.file_size_bytes || 0),
        url:`/api/reservations/${encodeURIComponent(row.legacy_id)}/photos/${photo.id}`
      }))
    };
  }
  const dto = {
    id:row.legacy_id,
    numeroReserva:Number(row.reservation_number),
    criadorUsuarioId:String(row.requester_id),
    nome:row.requester_name,
    email:row.requester_email || '',
    responsavel:row.responsible_name || '',
    partida:row.branch_name,
    carro:row.vehicle_code,
    destino:row.destination,
    motivo:row.reason || '',
    dataIda:start.date,
    horarioRetirada:start.time,
    dataVolta:end.date,
    horarioDevolucao:end.time,
    passageiros:passengers,
    passageirosConfirmados:Number(row.confirmed_passenger_count || 0),
    status:statusToDto(row.status),
    criadoEm:row.created_at
  };
  if(Object.keys(operacao).length) dto.operacao = operacao;
  if(row.status === 'administratively_closed'){
    dto.encerramentoAdministrativo = {
      registradoEm:row.administrative_closed_at,
      registradoPor:row.administrative_closed_by_name || row.closer_current_name || 'Gestão',
      ...(row.administrative_closed_by ? { registradoPorUsuarioId:String(row.administrative_closed_by) } : {}),
      justificativa:row.administrative_closure_reason || ''
    };
  }
  return dto;
}

function publicDto(dto){
  return {
    id:dto.id, numeroReserva:dto.numeroReserva,
    nome:dto.nome, partida:dto.partida, carro:dto.carro, destino:dto.destino,
    dataIda:dto.dataIda, horarioRetirada:dto.horarioRetirada,
    dataVolta:dto.dataVolta, horarioDevolucao:dto.horarioDevolucao,
    passageiros:dto.passageiros.map(passenger => ({ nome:passenger.nome })),
    passageirosConfirmados:dto.passageirosConfirmados,
    status:dto.status, criadoEm:dto.criadoEm
  };
}

function isReservationParticipant(row, dto, user){
  return String(row.requester_id) === String(user.id) || dto.passageiros.some(passenger =>
    String(passenger.usuarioId || '') === String(user.id)
  );
}

async function listReservationsForUser(user, executor){
  const data = await loadReservationData(executor);
  const manager = canViewAllReservations(user);
  const output = [];
  for(const row of data.rows){
    const dto = fullDto(row, data);
    const participant = isReservationParticipant(row, dto, user);
    if(manager || participant) output.push(dto);
    else if(row.status === 'confirmed') output.push(publicDto(dto));
  }
  return output;
}

async function listAllReservations(executor){
  const data = await loadReservationData(executor);
  return data.rows.map(row => fullDto(row, data));
}

// Usado só pela sincronização com o calendário do Outlook (server/calendar-sync.js) -
// o id do evento no Graph é um detalhe interno, nunca exposto em fullDto/publicDto.
// Busca todos de uma vez (em vez de uma query por reserva) porque é chamada
// dentro do laço de mudanças do POST /api/reservations/sync.
async function getReservationGraphEventIds(client, legacyIds){
  const ids = [...new Set((legacyIds || []).map(String))];
  if(!ids.length) return new Map();
  const result = await client.query(
    'SELECT legacy_id, graph_event_id FROM reservations WHERE legacy_id = ANY($1::text[])',
    [ids]
  );
  return new Map(result.rows.map(row => [row.legacy_id, row.graph_event_id]));
}

async function cancelReservation(client, legacyId, actor){
  const result = await client.query(
    `UPDATE reservations
        SET status='cancelled', cancelled_at=NOW(), cancelled_by=$2
      WHERE legacy_id=$1 AND status NOT IN ('in_use','completed','administratively_closed','cancelled')
      RETURNING id`,
    [String(legacyId), actor.id]
  );
  if(!result.rowCount) throw Object.assign(new Error('A reserva não pode mais ser cancelada.'), { status:409 });
}

async function getPhotoForUser(user, legacyId, photoId){
  const result = await query(
    `SELECT p.storage_key, p.data_url, p.original_name, p.content_type,
            r.requester_id,
            EXISTS(
              SELECT 1 FROM reservation_passengers rp
               WHERE rp.reservation_id=r.id AND rp.user_id=$3 AND rp.left_at IS NULL
            ) AS passenger
       FROM operation_photos p
       JOIN vehicle_operations o ON o.id=p.operation_id
       JOIN reservations r ON r.id=o.reservation_id
      WHERE r.legacy_id=$1 AND p.id=$2`,
    [String(legacyId), photoId, user.id]
  );
  const photo = result.rows[0];
  if(!photo) return null;
  if(!canViewAllReservations(user) && String(photo.requester_id) !== String(user.id) && !photo.passenger){
    throw Object.assign(new Error('Sem permissão para visualizar esta foto.'), { status:403 });
  }
  return photo;
}

async function migrateLegacyReservations(){
  return withTransaction(async client => {
    const fleet = await loadFleetState(client);
    await ensureFleetFromState(client, fleet);
    const state = await client.query(
      `SELECT value FROM application_state WHERE collection_name='reservations' FOR UPDATE`
    );
    const reservations = state.rows[0] && Array.isArray(state.rows[0].value) ? state.rows[0].value : [];
    let migrated = 0;
    for(const reservation of reservations){
      const exists = await client.query('SELECT 1 FROM reservations WHERE legacy_id=$1', [String(reservation.id)]);
      if(exists.rowCount) continue;
      const actor = await resolveUser(client, reservation.criadorUsuarioId, reservation.nome, null);
      await persistReservation(client, reservation, actor, { fleet, migration:true });
      migrated++;
    }
    if(reservations.length){
      await client.query(`DELETE FROM application_state WHERE collection_name='reservations'`);
    }
    await client.query(`ALTER TABLE reservations ALTER COLUMN legacy_id SET NOT NULL`);
    await client.query(`ALTER TABLE reservations ALTER COLUMN requester_name SET NOT NULL`);
    return migrated;
  });
}

module.exports = {
  canViewAllReservations,
  listReservationsForUser,
  listAllReservations,
  persistReservation,
  cancelReservation,
  getReservationGraphEventIds,
  getPhotoForUser,
  migrateLegacyReservations,
  normalizeName,
  publicDto,
  isReservationParticipant
};
