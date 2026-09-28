/* =========================================================
   Grupos de usuários (migração 034)

   Persistência e consultas. A regra de acesso aos veículos está em
   ./vehicle-access.js; as rotas em ./routes/groups.js.
   ========================================================= */
const { query } = require('./db');
const { ValidationError } = require('./validation');
const { vehicleGroupIds } = require('./vehicle-access');

const MAX_MEMBERS = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function groupRowToObject(row){
  return {
    id:row.id,
    nome:row.name,
    descricao:row.description || '',
    membros:(row.member_ids || []).map(String),
    criadoEm:row.created_at ? new Date(row.created_at).toISOString() : '',
    atualizadoEm:row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

const GROUP_SELECT = `
  SELECT g.id, g.name, g.description, g.created_at, g.updated_at,
         COALESCE(ARRAY_AGG(m.user_id::text ORDER BY m.user_id) FILTER (WHERE m.user_id IS NOT NULL), '{}') AS member_ids
    FROM user_groups g
    LEFT JOIN user_group_members m ON m.group_id = g.id
`;

async function listGroups(db = { query }){
  const result = await db.query(`${GROUP_SELECT} GROUP BY g.id ORDER BY LOWER(g.name)`);
  return result.rows.map(groupRowToObject);
}

async function getGroup(db, id){
  if(!UUID_PATTERN.test(String(id || ''))) return null;
  const result = await db.query(`${GROUP_SELECT} WHERE g.id = $1 GROUP BY g.id`, [id]);
  return result.rows[0] ? groupRowToObject(result.rows[0]) : null;
}

async function listGroupIds(db = { query }){
  const result = await db.query('SELECT id::text AS id FROM user_groups');
  return new Set(result.rows.map(row => row.id));
}

// userId -> Set(groupId), só para os usuários pedidos. Usado na validação de
// reservas (o motorista precisa ser membro do grupo do veículo).
async function loadGroupMembership(userIds, db = { query }){
  const ids = [...new Set((userIds || []).map(String).filter(id => UUID_PATTERN.test(id)))];
  const membership = new Map(ids.map(id => [id, new Set()]));
  if(!ids.length) return membership;
  const result = await db.query(
    'SELECT user_id::text AS user_id, group_id::text AS group_id FROM user_group_members WHERE user_id = ANY($1::uuid[])',
    [ids]
  );
  result.rows.forEach(row => membership.get(row.user_id).add(row.group_id));
  return membership;
}

// Usuários ativos que pertencem a algum dos grupos - destinatários dos
// avisos sobre um veículo restrito (ex.: bloqueio).
async function activeMemberIdsOfGroups(groupIds, db = { query }){
  const ids = [...new Set((groupIds || []).map(String).filter(id => UUID_PATTERN.test(id)))];
  if(!ids.length) return [];
  const result = await db.query(
    `SELECT DISTINCT u.id::text AS id
       FROM user_group_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ANY($1::uuid[])
        AND u.active = TRUE
        AND u.deleted_at IS NULL`,
    [ids]
  );
  return result.rows.map(row => row.id);
}

function validateGroupInput(body){
  const nome = String(body && body.nome || '').trim().replace(/\s+/g, ' ');
  const descricao = String(body && body.descricao || '').trim();
  const membros = [...new Set((Array.isArray(body && body.membros) ? body.membros : []).map(String))];
  if(nome.length < 2 || nome.length > 80) throw new ValidationError('Informe um nome de grupo entre 2 e 80 caracteres.');
  if(descricao.length > 240) throw new ValidationError('A descrição do grupo pode ter no máximo 240 caracteres.');
  if(membros.length > MAX_MEMBERS) throw new ValidationError(`Um grupo pode ter no máximo ${MAX_MEMBERS} membros.`);
  if(membros.some(id => !UUID_PATTERN.test(id))) throw new ValidationError('Membro inválido.');
  return { nome, descricao, membros };
}

// Só usuários existentes, ativos e não excluídos podem entrar num grupo.
async function assertMembersExist(db, memberIds){
  if(!memberIds.length) return;
  const result = await db.query(
    'SELECT COUNT(*)::int AS total FROM users WHERE id = ANY($1::uuid[]) AND active = TRUE AND deleted_at IS NULL',
    [memberIds]
  );
  if(result.rows[0].total !== memberIds.length){
    throw new ValidationError('Algum dos membros selecionados não existe mais ou está inativo. Recarregue a página.');
  }
}

async function replaceMembers(db, groupId, memberIds){
  await db.query('DELETE FROM user_group_members WHERE group_id = $1', [groupId]);
  if(memberIds.length){
    await db.query(
      `INSERT INTO user_group_members (group_id, user_id)
       SELECT $1, UNNEST($2::uuid[])`,
      [groupId, memberIds]
    );
  }
}

function duplicateNameError(error){
  return error && error.code === '23505' && /user_groups_name/.test(String(error.constraint || ''));
}

async function createGroup(db, input){
  await assertMembersExist(db, input.membros);
  try{
    const result = await db.query(
      'INSERT INTO user_groups (name, description) VALUES ($1, $2) RETURNING id',
      [input.nome, input.descricao]
    );
    await replaceMembers(db, result.rows[0].id, input.membros);
    return getGroup(db, result.rows[0].id);
  }catch(error){
    if(duplicateNameError(error)) throw new ValidationError('Já existe um grupo com esse nome.', 409);
    throw error;
  }
}

async function updateGroup(db, id, input){
  if(!(await getGroup(db, id))) return null;
  await assertMembersExist(db, input.membros);
  try{
    await db.query(
      'UPDATE user_groups SET name = $2, description = $3, updated_at = NOW() WHERE id = $1',
      [id, input.nome, input.descricao]
    );
    await replaceMembers(db, id, input.membros);
    return getGroup(db, id);
  }catch(error){
    if(duplicateNameError(error)) throw new ValidationError('Já existe um grupo com esse nome.', 409);
    throw error;
  }
}

// Veículos (coleção JSON) que usam o grupo - impede excluir um grupo em uso,
// o que deixaria o veículo restrito a um grupo inexistente (ninguém reserva).
async function vehiclesUsingGroup(db, groupId){
  const result = await db.query("SELECT value FROM application_state WHERE collection_name = 'vehicles'");
  const vehicles = result.rows[0] && Array.isArray(result.rows[0].value) ? result.rows[0].value : [];
  return vehicles.filter(vehicle => vehicleGroupIds(vehicle).includes(String(groupId)));
}

module.exports = {
  MAX_MEMBERS,
  listGroups,
  getGroup,
  listGroupIds,
  loadGroupMembership,
  activeMemberIdsOfGroups,
  validateGroupInput,
  createGroup,
  updateGroup,
  vehiclesUsingGroup
};
