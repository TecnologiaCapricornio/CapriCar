const express = require('express');
const { query, withTransaction } = require('../db');
const { validateCollection } = require('../validation');
const { userCanManage } = require('../auth');
const { normalizedStatus } = require('../services/reservation-lifecycle');
const { getBranchDeletionBlockers } = require('../branch-deletion');
const { listAllReservations } = require('../reservations-store');

const router = express.Router();
const COLLECTIONS = ['branches', 'vehicles', 'blocks', 'rules'];

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
  if(name === 'branches' && !userCanManage(req.user, 'branches')){
    return res.status(403).json({ error:'Sem permissão para alterar os locais.' });
  }
  if(name === 'vehicles' && !userCanManage(req.user, 'fleet')){
    return res.status(403).json({ error:'Sem permissão para alterar veículos.' });
  }
  if(name === 'blocks' && !userCanManage(req.user, 'blocks')){
    return res.status(403).json({ error:'Sem permissão para alterar bloqueios.' });
  }
  if(name === 'rules' && !userCanManage(req.user, 'rules')){
    return res.status(403).json({ error:'Sem permissão para alterar as regras.' });
  }
  next();
}

router.get('/bootstrap', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
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

  const auditResult = userCanManage(req.user, 'audit')
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

  const usersResult = userCanManage(req.user, 'users')
    ? await query(
      `SELECT id, username, display_name AS nome, email, role, active, auth_provider,
              can_manage_reservations, can_manage_branches, can_manage_fleet,
              can_manage_blocks, can_view_reports, can_view_audit,
              can_manage_rules, can_manage_users, can_manage_integrations
         FROM users
        WHERE deleted_at IS NULL
        ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, display_name`
    )
    : { rows:[] };

  const userDirectoryResult = await query(
    `SELECT id, display_name AS nome
       FROM users
      WHERE active = TRUE AND deleted_at IS NULL
      ORDER BY display_name`
  );

  const users = usersResult.rows.map(row => ({
    id:row.id,
    username:row.username,
    nome:row.nome,
    email:row.email || '',
    role:row.role,
    active:row.active,
    authProvider:row.auth_provider || 'local',
    permissions:{
      reservations:row.can_manage_reservations,
      branches:row.can_manage_branches,
      fleet:row.can_manage_fleet,
      blocks:row.can_manage_blocks,
      reports:row.can_view_reports,
      audit:row.can_view_audit,
      rules:row.can_manage_rules,
      users:row.can_manage_users,
      integrations:row.can_manage_integrations
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

  res.json({
    collections,
    revisions,
    users,
    userDirectory:userDirectoryResult.rows.map(row => ({
      id:String(row.id),
      nome:row.nome,
      active:true
    })),
    audit
  });
});

router.put('/:name', requireCollectionAccess, async (req, res) => {
  let value = req.body && req.body.value;
  const expectedRevision = Number(req.body && req.body.revision);
  if(value == null || (req.params.name !== 'rules' && !Array.isArray(value))){
    return res.status(400).json({ error:'Conteúdo inválido.' });
  }

  if(!Number.isSafeInteger(expectedRevision) || expectedRevision < 0){
    return res.status(400).json({ error:'Versao dos dados invalida. Atualize a pagina e tente novamente.' });
  }

  const savedState = await withTransaction(async client => {
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
      rules:req.params.name === 'rules' ? value : (values.rules || null),
      currentVehicles:req.params.name === 'vehicles' ? current : (values.vehicles || [])
    });
    if(req.params.name === 'branches'){
      const incomingIds = new Set(value.map(branch => String(branch.id)));
      const removed = current.filter(branch => !incomingIds.has(String(branch.id)));
      if(removed.length){
        throw Object.assign(new Error(
          'Use a opção Excluir e informe a justificativa para remover um local definitivamente.'
        ), { status:400 });
      }
    }
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
    return { revision:Number(saved.rows[0].revision) };
  });
  res.json({ ok:true, revision:savedState.revision });
});

router.delete('/branches/:id', async (req, res) => {
  if(!userCanManage(req.user, 'branches')){
    return res.status(403).json({ error:'Sem permissão para excluir locais.' });
  }
  const branchId = String(req.params.id || '').trim();
  const justification = String(req.body && req.body.justification || '').trim();
  const expectedRevision = Number(req.body && req.body.revision);
  if(!branchId || branchId.length > 100){
    return res.status(400).json({ error:'Local inválido.' });
  }
  if(
    justification.length < 5 || justification.length > 500 ||
    /[<>]/.test(justification) || /[\u0000-\u001F]/.test(justification)
  ){
    return res.status(400).json({
      error:'Informe uma justificativa válida, entre 5 e 500 caracteres.'
    });
  }
  if(!Number.isSafeInteger(expectedRevision) || expectedRevision < 0){
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
    const branchesRow = rows.branches;
    if(!branchesRow){
      throw Object.assign(new Error('Cadastro de locais não encontrado.'), { status:409 });
    }
    if(Number(branchesRow.revision) !== expectedRevision){
      const error = new Error('Os locais foram alterados por outra pessoa. Atualize a página e tente novamente.');
      error.status = 409;
      error.code = 'STATE_CONFLICT';
      error.currentRevision = Number(branchesRow.revision);
      throw error;
    }
    const branches = Array.isArray(branchesRow.value) ? branchesRow.value : [];
    const branch = branches.find(item => String(item.id) === branchId);
    if(!branch){
      throw Object.assign(new Error('Esse local já foi excluído ou não existe.'), { status:404 });
    }
    const vehicles = Array.isArray(rows.vehicles && rows.vehicles.value) ? rows.vehicles.value : [];
    const reservations = await listAllReservations(client);
    const { linkedVehicles, activeReservations } = getBranchDeletionBlockers(
      branch,
      vehicles,
      reservations
    );
    if(linkedVehicles.length){
      throw Object.assign(new Error(
        `Não é possível excluir: transfira ou exclua primeiro ${linkedVehicles.length} veículo(s) vinculado(s) a este local.`
      ), { status:409 });
    }
    if(activeReservations.length){
      throw Object.assign(new Error(
        `Não é possível excluir: existem ${activeReservations.length} reserva(s) ativa(s) envolvendo este local.`
      ), { status:409 });
    }

    const nextBranches = branches.filter(item => String(item.id) !== branchId);
    validateCollection('branches', nextBranches, {});
    const saved = await client.query(
      `UPDATE application_state
          SET value = $1::jsonb, updated_by = $2, updated_at = NOW(), revision = revision + 1
        WHERE collection_name = 'branches'
        RETURNING revision`,
      [JSON.stringify(nextBranches), req.user.id]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'excluiu definitivamente', 'local', $2, $3::jsonb)`,
      [
        req.user.id,
        branchId,
        JSON.stringify({
          description:`${branch.nome} · Justificativa: ${justification}`,
          justification,
          branch
        })
      ]
    );
    return { branch, revision:Number(saved.rows[0].revision) };
  });

  res.json({ ok:true, ...result });
});

router.delete('/vehicles/:id', async (req, res) => {
  if(!userCanManage(req.user, 'fleet')){
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
    const reservations = await listAllReservations(client);
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
        String(reservation.partida) !== String(vehicle.local) ||
        String(reservation.carro) !== String(vehicle.codigo)
      ) return false;
      const status = normalizedStatus(reservation.status);
      const completed = !!(reservation.operacao && reservation.operacao.devolucao);
      return !completed && !['concluida', 'cancelada', 'encerrada_administrativamente'].includes(status) &&
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
      String(block.local) === String(vehicle.local) &&
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

    validateCollection('vehicles', nextVehicles, {
      branches:rows.branches && rows.branches.value || [],
      currentVehicles:vehicles
    });
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
      `${vehicle.local} · ${vehicle.codigo} · ${vehicle.modelo || 'Veículo'} · ` +
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
