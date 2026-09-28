const express = require('express');
const { withTransaction } = require('../db');
const { userCanManage, requirePermission } = require('../auth');
const { ValidationError } = require('../validation');
const {
  listGroups,
  getGroup,
  validateGroupInput,
  createGroup,
  updateGroup,
  vehiclesUsingGroup
} = require('../groups');

const router = express.Router();

async function audit(client, actorId, action, entityId, details){
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, 'user_group', $3, $4::jsonb)`,
    [actorId, action, entityId, JSON.stringify(details || {})]
  );
}

function sendValidation(res, error){
  if(error instanceof ValidationError) return res.status(error.status || 400).json({ error:error.message });
  throw error;
}

// Leitura: quem administra grupos (cria e edita) e quem administra a frota
// (escolhe os grupos no cadastro do veículo).
router.get('/', async (req, res) => {
  if(!userCanManage(req.user, 'groups') && !userCanManage(req.user, 'fleet')){
    return res.status(403).json({ error:'Sem permissão para consultar os grupos.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ groups:await listGroups() });
});

router.post('/', requirePermission('groups'), async (req, res) => {
  try{
    const input = validateGroupInput(req.body);
    const group = await withTransaction(async client => {
      const created = await createGroup(client, input);
      await audit(client, req.user.id, 'user_group.created', created.id, { nome:created.nome, membros:created.membros.length });
      return created;
    });
    res.status(201).json({ group });
  }catch(error){
    sendValidation(res, error);
  }
});

router.patch('/:id', requirePermission('groups'), async (req, res) => {
  try{
    const input = validateGroupInput(req.body);
    const group = await withTransaction(async client => {
      const before = await getGroup(client, req.params.id);
      if(!before) return null;
      const updated = await updateGroup(client, req.params.id, input);
      const added = updated.membros.filter(id => !before.membros.includes(id));
      const removed = before.membros.filter(id => !updated.membros.includes(id));
      await audit(client, req.user.id, 'user_group.updated', updated.id, {
        nome:updated.nome,
        ...(before.nome !== updated.nome ? { nomeAnterior:before.nome } : {}),
        membrosAdicionados:added.length,
        membrosRemovidos:removed.length
      });
      return updated;
    });
    if(!group) return res.status(404).json({ error:'Grupo não encontrado.' });
    res.json({ group });
  }catch(error){
    sendValidation(res, error);
  }
});

router.delete('/:id', requirePermission('groups'), async (req, res) => {
  const result = await withTransaction(async client => {
    const group = await getGroup(client, req.params.id);
    if(!group) return { status:404, body:{ error:'Grupo não encontrado.' } };
    const inUse = await vehiclesUsingGroup(client, group.id);
    if(inUse.length){
      const names = inUse.map(vehicle => [vehicle.modelo, vehicle.placa || vehicle.codigo].filter(Boolean).join(' - ')).join(', ');
      return {
        status:409,
        body:{ error:`Este grupo ainda controla o acesso de ${inUse.length === 1 ? 'um veículo' : inUse.length + ' veículos'} (${names}). Remova o grupo do cadastro do veículo antes de excluí-lo.` }
      };
    }
    await client.query('DELETE FROM user_groups WHERE id = $1', [group.id]);
    await audit(client, req.user.id, 'user_group.deleted', group.id, { nome:group.nome, membros:group.membros.length });
    return { status:200, body:{ ok:true } };
  });
  res.status(result.status).json(result.body);
});

module.exports = router;
