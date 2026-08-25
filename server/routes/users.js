const express = require('express');
const { query, withTransaction } = require('../db');
const { hashPassword, createSessionToken } = require('../security');
const { publicUser, requirePermission } = require('../auth');
const { ssoConfig } = require('../config');
const { importSsoUsers } = require('../sso');

const router = express.Router();
router.use(requirePermission('users'));

const USER_SELECT = `
  SELECT id, username, display_name, role, active, auth_provider,
         can_manage_reservations, can_manage_branches, can_manage_fleet,
         can_manage_blocks, can_view_reports, can_view_audit,
         can_manage_rules, can_manage_users,
         created_at, updated_at
    FROM users
   WHERE deleted_at IS NULL`;

function normalizePermissions(value){
  const permissions = value || {};
  return {
    reservations:permissions.reservations === true,
    branches:permissions.branches === true,
    fleet:permissions.fleet === true,
    blocks:permissions.blocks === true,
    reports:permissions.reports === true,
    audit:permissions.audit === true,
    rules:permissions.rules === true,
    users:permissions.users === true
  };
}

async function audit(client, actorId, action, entityId, details){
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, 'user', $3, $4::jsonb)`,
    [actorId, action, entityId, JSON.stringify(details || {})]
  );
}

router.get('/', async (req, res) => {
  const result = await query(USER_SELECT + " ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, display_name");
  res.json({ users:result.rows.map(publicUser) });
});

router.post('/sso-import', async (req, res) => {
  if(!ssoConfig().enabled){
    return res.status(503).json({ error:'Login via Microsoft não está configurado.' });
  }
  const summary = await importSsoUsers();
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, 'sso-import', 'user', 'entra', $2::jsonb)`,
    [req.user.id, JSON.stringify(summary)]
  );
  res.status(201).json(summary);
});

router.post('/', async (req, res) => {
  const username = String(req.body && req.body.username || '').trim().toLowerCase();
  const displayName = String(req.body && req.body.nome || '').trim();
  const password = String(req.body && req.body.password || '');
  const permissions = normalizePermissions(req.body && req.body.permissions);
  if(!/^[a-z0-9._-]{3,40}$/.test(username)){
    return res.status(400).json({ error:'Usuário inválido.' });
  }
  if(!displayName) return res.status(400).json({ error:'Informe o nome.' });
  if(password.length < 8 || password.length > 128){
    return res.status(400).json({ error:'A senha deve ter entre 8 e 128 caracteres.' });
  }
  const passwordHash = await hashPassword(password);

  const account = await withTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO users (
         username, display_name, password_hash, role, active,
         can_manage_reservations, can_manage_branches, can_manage_fleet, can_manage_blocks, can_view_reports,
         can_view_audit, can_manage_rules, can_manage_users
       ) VALUES ($1, $2, $3, 'user', TRUE, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        username, displayName, passwordHash,
        permissions.reservations, permissions.branches, permissions.fleet, permissions.blocks, permissions.reports,
        permissions.audit, permissions.rules, permissions.users
      ]
    );
    await audit(client, req.user.id, 'created', inserted.rows[0].id, { username });
    return inserted.rows[0];
  });
  res.status(201).json({ user:publicUser(account) });
});

router.patch('/:id', async (req, res) => {
  const displayName = String(req.body && req.body.nome || '').trim();
  const password = String(req.body && req.body.password || '');
  const active = req.body && typeof req.body.active === 'boolean' ? req.body.active : undefined;
  const permissionsWereSent = !!(
    req.body &&
    req.body.permissions &&
    typeof req.body.permissions === 'object'
  );
  const requestedPermissions = normalizePermissions(req.body && req.body.permissions);
  if(!displayName) return res.status(400).json({ error:'Informe o nome.' });
  if(password && (password.length < 8 || password.length > 128)){
    return res.status(400).json({ error:'A nova senha deve ter entre 8 e 128 caracteres.' });
  }
  const passwordHash = password ? await hashPassword(password) : null;

  const account = await withTransaction(async client => {
    const locked = await client.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [req.params.id]
    );
    const current = locked.rows[0];
    if(!current) return null;
    if(current.role === 'admin' && req.user.role !== 'admin'){
      throw Object.assign(new Error('A conta principal de administrador só pode ser alterada pelo próprio administrador.'), {
        status:403
      });
    }
    const isAdminAccount = current.role === 'admin';
    const permissions = permissionsWereSent ? requestedPermissions : {
      reservations:current.can_manage_reservations,
      branches:current.can_manage_branches,
      fleet:current.can_manage_fleet,
      blocks:current.can_manage_blocks,
      reports:current.can_view_reports,
      audit:current.can_view_audit,
      rules:current.can_manage_rules,
      users:current.can_manage_users
    };
    const updated = await client.query(
      `UPDATE users
          SET display_name = $2,
              password_hash = COALESCE($3, password_hash),
              active = CASE WHEN role = 'admin' THEN TRUE ELSE COALESCE($4, active) END,
              can_manage_reservations = CASE WHEN role = 'admin' THEN TRUE ELSE $5 END,
              can_manage_branches = CASE WHEN role = 'admin' THEN TRUE ELSE $6 END,
              can_manage_fleet = CASE WHEN role = 'admin' THEN TRUE ELSE $7 END,
              can_manage_blocks = CASE WHEN role = 'admin' THEN TRUE ELSE $8 END,
              can_view_reports = CASE WHEN role = 'admin' THEN TRUE ELSE $9 END,
              can_view_audit = CASE WHEN role = 'admin' THEN TRUE ELSE $10 END,
              can_manage_rules = CASE WHEN role = 'admin' THEN TRUE ELSE $11 END,
              can_manage_users = CASE WHEN role = 'admin' THEN TRUE ELSE $12 END
        WHERE id = $1
        RETURNING *`,
      [
        current.id, displayName, passwordHash, active,
        isAdminAccount || permissions.reservations,
        isAdminAccount || permissions.branches,
        isAdminAccount || permissions.fleet,
        isAdminAccount || permissions.blocks,
        isAdminAccount || permissions.reports,
        isAdminAccount || permissions.audit,
        isAdminAccount || permissions.rules,
        isAdminAccount || permissions.users
      ]
    );
    await audit(client, req.user.id, 'updated', current.id, {
      passwordChanged:!!password,
      permissionsChanged:!isAdminAccount
    });
    return updated.rows[0];
  });
  if(!account) return res.status(404).json({ error:'Usuário não encontrado.' });
  res.json({ user:publicUser(account) });
});

router.delete('/:id', async (req, res) => {
  const justification = String(req.body && req.body.justification || '').trim();
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
  if(String(req.params.id) === String(req.user.id)){
    return res.status(409).json({ error:'Você não pode excluir a própria conta.' });
  }
  const disabledPasswordHash = await hashPassword(createSessionToken());

  const deleted = await withTransaction(async client => {
    const locked = await client.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [req.params.id]
    );
    const current = locked.rows[0];
    if(!current) return null;
    if(current.role === 'admin'){
      throw Object.assign(new Error('A conta principal de administrador não pode ser excluída.'), {
        status:409
      });
    }

    await client.query(
      `UPDATE audit_logs
          SET details = jsonb_set(
            COALESCE(details, '{}'::jsonb),
            '{originalUser}',
            to_jsonb($2::text),
            true
          )
        WHERE actor_id = $1
          AND NOT (COALESCE(details, '{}'::jsonb) ? 'originalUser')`,
      [current.id, current.display_name]
    );
    await audit(client, req.user.id, 'excluiu definitivamente', current.id, {
      description:
        `${current.display_name} (@${current.username}) · Justificativa: ${justification}`,
      justification,
      deletedUser:{
        id:current.id,
        username:current.username,
        displayName:current.display_name,
        role:current.role
      }
    });
    await client.query('DELETE FROM user_sessions WHERE user_id = $1', [current.id]);
    await client.query(
      `UPDATE users
          SET username = $2,
              display_name = 'Usuário excluído',
              password_hash = $3,
              active = FALSE,
              can_manage_reservations = FALSE,
              can_manage_branches = FALSE,
              can_manage_fleet = FALSE,
              can_manage_blocks = FALSE,
              can_view_reports = FALSE,
              can_view_audit = FALSE,
              can_manage_rules = FALSE,
              can_manage_users = FALSE,
              deleted_at = NOW(),
              deleted_by = $4,
              deletion_reason = $5,
              updated_at = NOW()
        WHERE id = $1`,
      [
        current.id,
        `deleted_${String(current.id).replace(/-/g, '')}`,
        disabledPasswordHash,
        req.user.id,
        justification
      ]
    );
    return current;
  });

  if(!deleted) return res.status(404).json({ error:'Usuário não encontrado ou já excluído.' });
  res.json({ ok:true });
});

module.exports = router;
