const express = require('express');
const { query, withTransaction } = require('../db');
const { validateCollection } = require('../validation');

const router = express.Router();
const COLLECTIONS = ['reservations', 'branches', 'vehicles', 'blocks', 'rules'];

function canManage(user, permission){
  return user.role === 'admin' || user.permissions[permission] === true;
}

function normalizedStatus(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function todaySaoPaulo(){
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Sao_Paulo',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).format(new Date());
}

function requireCollectionAccess(req, res, next){
  const name = req.params.name;
  if(!COLLECTIONS.includes(name)){
    return res.status(404).json({ error:'Coleção desconhecida.' });
  }
  if(['branches', 'vehicles'].includes(name) && !canManage(req.user, 'fleet')){
    return res.status(403).json({ error:'Sem permissão para alterar a frota.' });
  }
  if(name === 'blocks' && !canManage(req.user, 'blocks')){
    return res.status(403).json({ error:'Sem permissão para alterar bloqueios.' });
  }
  if(name === 'rules' && req.user.role !== 'admin'){
    return res.status(403).json({ error:'Somente o administrador pode alterar as regras.' });
  }
  next();
}

function withoutPassengerFields(reservation){
  const clone = { ...reservation };
  delete clone.passageiros;
  delete clone.passageirosConfirmados;
  return clone;
}

function otherPassengerNames(reservation, currentName){
  const normalizedCurrent = String(currentName || '').trim().toLowerCase();
  return (Array.isArray(reservation.passageiros) ? reservation.passageiros : [])
    .map(item => String(item && item.nome || '').trim().toLowerCase())
    .filter(name => name && name !== normalizedCurrent)
    .sort();
}

function reservationOwner(reservation){
  return String(reservation && reservation.nome || '').trim().toLowerCase();
}

function reservationBelongsToUser(reservation, user){
  if(reservation && reservation.criadorUsuarioId){
    return String(reservation.criadorUsuarioId) === String(user.id);
  }
  return reservationOwner(reservation) === String(user.nome || '').trim().toLowerCase();
}

function scheduledPickupTimestamp(reservation){
  const date = String(reservation && reservation.dataIda || '');
  const time = String(reservation && reservation.horarioRetirada || '');
  const timestamp = Date.parse(`${date}T${time}:00-03:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function withoutOperationFields(reservation){
  const clone = { ...reservation };
  delete clone.operacao;
  delete clone.status;
  return clone;
}

function validateReservationReplacement(current, incoming, user){
  const privileged = canManage(user, 'reservations');
  if(!Array.isArray(incoming)) throw Object.assign(new Error('Formato de reservas inválido.'), { status:400 });

  const currentById = new Map(
    (Array.isArray(current) ? current : []).map(item => [String(item.id), item])
  );
  const incomingById = new Map(incoming.map(item => [String(item.id), item]));

  for(const reservation of incoming){
    const previous = currentById.get(String(reservation.id));
    if(!previous){
      if(!privileged && !reservationBelongsToUser(reservation, user)){
        throw Object.assign(new Error('A reserva deve pertencer ao usuário autenticado.'), { status:403 });
      }
      continue;
    }
    if(JSON.stringify(previous) === JSON.stringify(reservation)) continue;

    const hadPickup = !!(previous.operacao && previous.operacao.retirada);
    const hadReturn = !!(previous.operacao && previous.operacao.devolucao);
    const hasPickup = !!(reservation.operacao && reservation.operacao.retirada);
    if(!hadPickup && hasPickup){
      const scheduledPickup = scheduledPickupTimestamp(previous);
      if(scheduledPickup == null || Date.now() < scheduledPickup){
        throw Object.assign(new Error(
          `A retirada só pode ser registrada a partir de ${previous.dataIda} às ${previous.horarioRetirada}.`
        ), { status:409 });
      }
    }
    if(hadReturn){
      throw Object.assign(new Error('Uma reserva concluída não pode mais ser alterada.'), { status:409 });
    }
    if(hadPickup){
      const coreUnchanged =
        JSON.stringify(withoutOperationFields(previous)) ===
        JSON.stringify(withoutOperationFields(reservation));
      const pickupUnchanged =
        JSON.stringify(previous.operacao.retirada) ===
        JSON.stringify(reservation.operacao && reservation.operacao.retirada);
      if(!coreUnchanged || !pickupUnchanged){
        throw Object.assign(new Error('Após a retirada, somente a devolução pode ser registrada.'), { status:409 });
      }
      continue;
    }
    if(privileged || reservationBelongsToUser(previous, user)){
      if(
        !privileged &&
        previous.criadorUsuarioId &&
        String(reservation.criadorUsuarioId || '') !== String(previous.criadorUsuarioId)
      ){
        throw Object.assign(new Error('O criador da reserva não pode ser alterado.'), { status:403 });
      }
      continue;
    }

    const onlyPassengersChanged =
      JSON.stringify(withoutPassengerFields(previous)) === JSON.stringify(withoutPassengerFields(reservation)) &&
      JSON.stringify(otherPassengerNames(previous, user.nome)) ===
        JSON.stringify(otherPassengerNames(reservation, user.nome));
    if(!onlyPassengersChanged){
      throw Object.assign(new Error('Você não pode editar a reserva de outro usuário.'), { status:403 });
    }
  }

  for(const previous of (Array.isArray(current) ? current : [])){
    if(!incomingById.has(String(previous.id))){
      if(previous.operacao && previous.operacao.retirada){
        throw Object.assign(new Error('Não é possível cancelar uma reserva após a retirada.'), { status:409 });
      }
      if(!privileged && !reservationBelongsToUser(previous, user)){
        throw Object.assign(new Error('Você não pode cancelar a reserva de outro usuário.'), { status:403 });
      }
    }
  }
}

router.get('/bootstrap', async (req, res) => {
  const stateResult = await query(
    'SELECT collection_name, value, revision FROM application_state WHERE collection_name = ANY($1::text[])',
    [COLLECTIONS]
  );
  const collections = Object.fromEntries(COLLECTIONS.map(name => [name, null]));
  const revisions = Object.fromEntries(COLLECTIONS.map(name => [name, 0]));
  stateResult.rows.forEach(row => {
    collections[row.collection_name] = row.value;
    revisions[row.collection_name] = Number(row.revision);
  });

  const auditResult = req.user.role === 'admin'
    ? await query(
      `SELECT a.id, a.created_at,
              COALESCE(a.details->>'originalUser', u.display_name, 'Sistema') AS actor_name,
              a.action, a.entity_type, a.entity_id, a.details
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC
        LIMIT 2000`
    )
    : { rows:[] };

  const usersResult = req.user.role === 'admin'
    ? await query(
      `SELECT id, username, display_name AS nome, role, active,
              can_manage_reservations, can_manage_fleet,
              can_manage_blocks, can_view_reports
         FROM users
        WHERE deleted_at IS NULL
        ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, display_name`
    )
    : { rows:[] };

  const users = usersResult.rows.map(row => ({
    id:row.id,
    username:row.username,
    nome:row.nome,
    role:row.role,
    active:row.active,
    permissions:{
      reservations:row.can_manage_reservations,
      fleet:row.can_manage_fleet,
      blocks:row.can_manage_blocks,
      reports:row.can_view_reports
    }
  }));

  const audit = auditResult.rows.map(row => ({
    id:String(row.id),
    timestamp:row.created_at,
    user:row.actor_name,
    action:row.action,
    entity:row.entity_type,
    entityId:row.entity_id || '',
    details:typeof row.details === 'string'
      ? row.details
      : String(row.details && row.details.description || '')
  }));

  res.json({ collections, revisions, users, audit });
});

router.put('/:name', requireCollectionAccess, async (req, res) => {
  const value = req.body && req.body.value;
  const expectedRevision = Number(req.body && req.body.revision);
  if(value == null || (req.params.name !== 'rules' && !Array.isArray(value))){
    return res.status(400).json({ error:'Conteúdo inválido.' });
  }

  if(!Number.isSafeInteger(expectedRevision) || expectedRevision < 0){
    return res.status(400).json({ error:'Versao dos dados invalida. Atualize a pagina e tente novamente.' });
  }

  const revision = await withTransaction(async client => {
    const locked = await client.query(
      `SELECT collection_name, value, revision
         FROM application_state
        WHERE collection_name = ANY($1::text[])
        FOR UPDATE`,
      [COLLECTIONS]
    );
    const values = Object.fromEntries(locked.rows.map(row => [row.collection_name, row.value]));
    const currentRow = locked.rows.find(row => row.collection_name === req.params.name);
    const currentRevision = currentRow ? Number(currentRow.revision) : 0;
    if(expectedRevision !== currentRevision){
      const error = new Error(
        'Esses dados foram alterados por outra pessoa. A versao mais recente sera carregada.'
      );
      error.status = 409;
      error.code = 'STATE_CONFLICT';
      error.currentRevision = currentRevision;
      throw error;
    }
    const current = values[req.params.name] || [];
    if(req.params.name === 'reservations'){
      validateReservationReplacement(current, value, req.user);
    }
    if(req.params.name === 'vehicles'){
      const incomingIds = new Set(value.map(vehicle => String(vehicle.id)));
      const removed = current.filter(vehicle => !incomingIds.has(String(vehicle.id)));
      if(removed.length){
        throw Object.assign(new Error(
          'Use a opção Excluir e informe a justificativa para remover um veículo definitivamente.'
        ), { status:400 });
      }
    }
    validateCollection(req.params.name, value, {
      branches:req.params.name === 'branches' ? value : (values.branches || []),
      vehicles:req.params.name === 'vehicles' ? value : (values.vehicles || []),
      blocks:req.params.name === 'blocks' ? value : (values.blocks || []),
      rules:req.params.name === 'rules' ? value : (values.rules || null)
    });
    const saved = await client.query(
      `INSERT INTO application_state (collection_name, value, updated_by, revision)
       VALUES ($1, $2::jsonb, $3, 1)
       ON CONFLICT (collection_name)
       DO UPDATE SET value = EXCLUDED.value,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW(),
                     revision = application_state.revision + 1
       RETURNING revision`,
      [req.params.name, JSON.stringify(value), req.user.id]
    );
    return Number(saved.rows[0].revision);
  });
  res.json({ ok:true, revision });
});

router.delete('/vehicles/:id', async (req, res) => {
  if(!canManage(req.user, 'fleet')){
    return res.status(403).json({ error:'Sem permissão para excluir veículos.' });
  }
  const vehicleId = String(req.params.id || '').trim();
  const justification = String(req.body && req.body.justification || '').trim();
  const revisions = req.body && req.body.revisions || {};
  const vehicleRevision = Number(revisions.vehicles);
  const blocksRevision = Number(revisions.blocks);
  if(!vehicleId || vehicleId.length > 100){
    return res.status(400).json({ error:'Veículo inválido.' });
  }
  if(
    justification.length < 5 ||
    justification.length > 500 ||
    /[<>]/.test(justification) ||
    /[\u0000-\u001F]/.test(justification)
  ){
    return res.status(400).json({
      error:'Informe uma justificativa válida, entre 5 e 500 caracteres.'
    });
  }
  if(
    !Number.isSafeInteger(vehicleRevision) || vehicleRevision < 0 ||
    !Number.isSafeInteger(blocksRevision) || blocksRevision < 0
  ){
    return res.status(400).json({ error:'Versão dos dados inválida. Atualize a página e tente novamente.' });
  }

  const result = await withTransaction(async client => {
    const locked = await client.query(
      `SELECT collection_name, value, revision
         FROM application_state
        WHERE collection_name = ANY($1::text[])
        FOR UPDATE`,
      [COLLECTIONS]
    );
    const rows = Object.fromEntries(locked.rows.map(row => [row.collection_name, row]));
    const vehiclesRow = rows.vehicles;
    const blocksRow = rows.blocks;
    const reservations = Array.isArray(rows.reservations && rows.reservations.value)
      ? rows.reservations.value
      : [];
    if(!vehiclesRow){
      throw Object.assign(new Error('Cadastro de veículos não encontrado.'), { status:409 });
    }
    if(Number(vehiclesRow.revision) !== vehicleRevision){
      const error = new Error('A frota foi alterada por outra pessoa. Atualize a página e tente novamente.');
      error.status = 409;
      error.code = 'STATE_CONFLICT';
      error.currentRevision = Number(vehiclesRow.revision);
      throw error;
    }
    const vehicles = Array.isArray(vehiclesRow.value) ? vehiclesRow.value : [];
    const vehicle = vehicles.find(item => String(item.id) === vehicleId);
    if(!vehicle){
      throw Object.assign(new Error('Esse veículo já foi excluído ou não existe.'), { status:404 });
    }

    const today = todaySaoPaulo();
    const pendingReservations = reservations.filter(reservation => {
      if(
        String(reservation.partida) !== String(vehicle.filial) ||
        String(reservation.carro) !== String(vehicle.codigo)
      ) return false;
      const status = normalizedStatus(reservation.status);
      const completed = !!(reservation.operacao && reservation.operacao.devolucao);
      return !completed && !['concluida', 'cancelada'].includes(status) &&
        String(reservation.dataVolta || '') >= today;
    });
    if(pendingReservations.length){
      throw Object.assign(new Error(
        `Não é possível excluir: existem ${pendingReservations.length} reserva(s) atual(is) ou futura(s) para esse veículo.`
      ), { status:409 });
    }

    const nextVehicles = vehicles.filter(item => String(item.id) !== vehicleId);
    const blocks = Array.isArray(blocksRow && blocksRow.value) ? blocksRow.value : [];
    const linkedBlocks = blocks.filter(block =>
      String(block.filial) === String(vehicle.filial) &&
      String(block.carro) === String(vehicle.codigo)
    );
    if(linkedBlocks.length && Number(blocksRow.revision) !== blocksRevision){
      const error = new Error('Os bloqueios foram alterados por outra pessoa. Atualize a página e tente novamente.');
      error.status = 409;
      error.code = 'STATE_CONFLICT';
      error.currentRevision = Number(blocksRow.revision);
      throw error;
    }
    const nextBlocks = blocks.filter(block => !linkedBlocks.includes(block));

    validateCollection('vehicles', nextVehicles, { branches:rows.branches && rows.branches.value || [] });
    validateCollection('blocks', nextBlocks, { vehicles:nextVehicles });

    const savedVehicles = await client.query(
      `UPDATE application_state
          SET value = $1::jsonb, updated_by = $2, updated_at = NOW(), revision = revision + 1
        WHERE collection_name = 'vehicles'
        RETURNING revision`,
      [JSON.stringify(nextVehicles), req.user.id]
    );
    let savedBlocksRevision = Number(blocksRow && blocksRow.revision || 0);
    if(linkedBlocks.length){
      const savedBlocks = await client.query(
        `UPDATE application_state
            SET value = $1::jsonb, updated_by = $2, updated_at = NOW(), revision = revision + 1
          WHERE collection_name = 'blocks'
          RETURNING revision`,
        [JSON.stringify(nextBlocks), req.user.id]
      );
      savedBlocksRevision = Number(savedBlocks.rows[0].revision);
    }

    const description =
      `${vehicle.filial} · ${vehicle.codigo} · ${vehicle.modelo || 'Veículo'} · ` +
      `Justificativa: ${justification}`;
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'excluiu definitivamente', 'veículo', $2, $3::jsonb)`,
      [
        req.user.id,
        vehicleId,
        JSON.stringify({
          description,
          justification,
          removedBlocks:linkedBlocks.length,
          vehicle
        })
      ]
    );

    return {
      vehicle,
      removedBlocks:linkedBlocks.length,
      revisions:{
        vehicles:Number(savedVehicles.rows[0].revision),
        blocks:savedBlocksRevision
      }
    };
  });

  res.json({ ok:true, ...result });
});

router.post('/audit/event', async (req, res) => {
  const action = String(req.body && req.body.action || '').slice(0, 60);
  const entity = String(req.body && req.body.entity || '').slice(0, 60);
  const entityId = String(req.body && req.body.entityId || '').slice(0, 200);
  const description = String(req.body && req.body.details || '').slice(0, 2000);
  if(!action || !entity) return res.status(400).json({ error:'Evento de auditoria inválido.' });
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [req.user.id, action, entity, entityId, JSON.stringify({ description })]
  );
  res.status(201).json({ ok:true });
});

router.post('/audit/import', async (req, res) => {
  if(req.user.role !== 'admin'){
    return res.status(403).json({ error:'Somente o administrador pode importar a auditoria.' });
  }
  const events = Array.isArray(req.body && req.body.events)
    ? req.body.events.slice(0, 2000)
    : [];
  if(!events.length) return res.json({ imported:0 });

  await withTransaction(async client => {
    for(const event of events){
      const createdAt = new Date(event.timestamp);
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          req.user.id,
          String(event.action || 'importou').slice(0, 60),
          String(event.entity || 'evento').slice(0, 60),
          String(event.entityId || '').slice(0, 200),
          JSON.stringify({
            description:String(event.details || '').slice(0, 2000),
            originalUser:String(event.user || 'Sistema').slice(0, 120)
          }),
          Number.isNaN(createdAt.getTime()) ? new Date() : createdAt
        ]
      );
    }
  });
  res.json({ imported:events.length });
});

module.exports = router;
