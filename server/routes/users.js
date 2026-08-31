const express = require('express');
const { query, withTransaction } = require('../db');
const { hashPassword, createSessionToken } = require('../security');
const { publicUser, requirePermission } = require('../auth');
const { isValidEmail } = require('../validation');
const { importSsoUsers, resolveSsoConfig } = require('../sso');
const { getLicensesForUsers, licenseStatus, todayISO } = require('../driver-licenses');

const router = express.Router();
router.use(requirePermission('users'));

const USER_SELECT = `
  SELECT id, username, display_name, email, role, active, auth_provider,
         can_manage_reservations, can_manage_branches, can_manage_fleet,
         can_manage_blocks, can_view_reports, can_view_audit,
         can_manage_rules, can_manage_users, can_manage_integrations,
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
    users:permissions.users === true,
    integrations:permissions.integrations === true
  };
}

async function audit(client, actorId, action, entityId, details){
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, 'user', $3, $4::jsonb)`,
    [actorId, action, entityId, JSON.stringify(details || {})]
  );
}

const MAX_BULK_IDS = 2000;

const PERMISSION_LABELS = {
  reservations:'Reservas', branches:'Locais', fleet:'Veículos', blocks:'Bloqueios',
  reports:'Relatórios', audit:'Auditoria', rules:'Regras', users:'Usuários',
  integrations:'Integrações'
};

async function deactivateUserCore(client, actorId, targetId){
  const locked = await client.query(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [targetId]
  );
  const current = locked.rows[0];
  if(!current) return { ok:false, reason:'Usuário não encontrado.' };
  if(current.role === 'admin') return { ok:false, reason:'Conta de administrador não pode ser desativada.' };
  await client.query('UPDATE users SET active = FALSE WHERE id = $1', [targetId]);
  await audit(client, actorId, 'updated', targetId, {
    description:`${current.display_name} (@${current.username}) desativado em lote`
  });
  return { ok:true };
}

async function deleteUserCore(client, actorId, targetId, justification){
  if(String(targetId) === String(actorId)) return { ok:false, reason:'Não é possível excluir a própria conta.' };
  const locked = await client.query(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [targetId]
  );
  const current = locked.rows[0];
  if(!current) return { ok:false, reason:'Usuário não encontrado ou já excluído.' };
  if(current.role === 'admin') return { ok:false, reason:'Conta de administrador não pode ser excluída.' };

  const disabledPasswordHash = await hashPassword(createSessionToken());

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
  await audit(client, actorId, 'excluiu definitivamente', current.id, {
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
            can_manage_integrations = FALSE,
            deleted_at = NOW(),
            deleted_by = $4,
            deletion_reason = $5,
            updated_at = NOW()
      WHERE id = $1`,
    [
      current.id,
      `deleted_${String(current.id).replace(/-/g, '')}`,
      disabledPasswordHash,
      actorId,
      justification
    ]
  );
  return { ok:true };
}

async function replacePermissionsCore(client, actorId, targetId, permissions){
  const locked = await client.query(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [targetId]
  );
  const current = locked.rows[0];
  if(!current) return { ok:false, reason:'Usuário não encontrado.' };
  if(current.role === 'admin') return { ok:false, reason:'Permissões de administrador não podem ser alteradas em lote.' };
  await client.query(
    `UPDATE users
        SET can_manage_reservations = $2,
            can_manage_branches = $3,
            can_manage_fleet = $4,
            can_manage_blocks = $5,
            can_view_reports = $6,
            can_view_audit = $7,
            can_manage_rules = $8,
            can_manage_users = $9,
            can_manage_integrations = $10
      WHERE id = $1`,
    [
      targetId,
      permissions.reservations, permissions.branches, permissions.fleet, permissions.blocks,
      permissions.reports, permissions.audit, permissions.rules, permissions.users,
      permissions.integrations
    ]
  );
  await audit(client, actorId, 'updated', targetId, {
    description:`${current.display_name} (@${current.username}) teve permissões substituídas em lote`
  });
  return { ok:true };
}

router.get('/', async (req, res) => {
  const result = await query(USER_SELECT + " ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, display_name");

  // Uma consulta só para todas as CNHs, e não uma por usuário - a lista de
  // usuários é paginada no cliente, então o N+1 apareceria em cheio aqui.
  const licenses = await getLicensesForUsers(result.rows.map(row => row.id));
  const hoje = todayISO();

  res.json({
    users:result.rows.map(row => {
      const user = publicUser(row);
      const cnh = licenses.get(String(row.id)) || null;
      const status = licenseStatus(cnh, hoje);
      user.cnh = cnh;
      user.cnhStatus = status.estado;
      user.cnhDiasRestantes = status.diasRestantes;
      return user;
    })
  });
});

router.post('/sso-import', async (req, res) => {
  if(!(await resolveSsoConfig()).enabled){
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

router.post('/bulk/deactivate', async (req, res) => {
  const userIds = Array.isArray(req.body && req.body.userIds) ? req.body.userIds.map(String) : [];
  if(!userIds.length) return res.status(400).json({ error:'Selecione ao menos um usuário.' });
  if(userIds.length > MAX_BULK_IDS){
    return res.status(400).json({ error:`Selecione no máximo ${MAX_BULK_IDS} usuários por vez.` });
  }

  const summary = { processed:0, skipped:0, errors:[] };
  for(const id of userIds){
    try{
      await withTransaction(async client => {
        const result = await deactivateUserCore(client, req.user.id, id);
        if(result.ok) summary.processed++;
        else { summary.skipped++; summary.errors.push({ id, reason:result.reason }); }
      });
    }catch(error){
      summary.skipped++;
      summary.errors.push({ id, reason:error.message });
    }
  }
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, 'bulk-deactivate', 'user', 'bulk', $2::jsonb)`,
    [req.user.id, JSON.stringify({
      description:`${summary.processed} usuário(s) desativado(s) em lote`,
      ...summary
    })]
  );
  res.status(200).json(summary);
});

router.post('/bulk/delete', async (req, res) => {
  const userIds = Array.isArray(req.body && req.body.userIds) ? req.body.userIds.map(String) : [];
  const justification = String(req.body && req.body.justification || '').trim();
  if(!userIds.length) return res.status(400).json({ error:'Selecione ao menos um usuário.' });
  if(userIds.length > MAX_BULK_IDS){
    return res.status(400).json({ error:`Selecione no máximo ${MAX_BULK_IDS} usuários por vez.` });
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

  const summary = { processed:0, skipped:0, errors:[] };
  for(const id of userIds){
    try{
      await withTransaction(async client => {
        const result = await deleteUserCore(client, req.user.id, id, justification);
        if(result.ok) summary.processed++;
        else { summary.skipped++; summary.errors.push({ id, reason:result.reason }); }
      });
    }catch(error){
      summary.skipped++;
      summary.errors.push({ id, reason:error.message });
    }
  }
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, 'bulk-delete', 'user', 'bulk', $2::jsonb)`,
    [req.user.id, JSON.stringify({
      description:`${summary.processed} usuário(s) excluído(s) definitivamente em lote · Justificativa: ${justification}`,
      justification,
      ...summary
    })]
  );
  res.status(200).json(summary);
});

router.post('/bulk/permissions', async (req, res) => {
  const userIds = Array.isArray(req.body && req.body.userIds) ? req.body.userIds.map(String) : [];
  if(!userIds.length) return res.status(400).json({ error:'Selecione ao menos um usuário.' });
  if(userIds.length > MAX_BULK_IDS){
    return res.status(400).json({ error:`Selecione no máximo ${MAX_BULK_IDS} usuários por vez.` });
  }
  const permissions = normalizePermissions(req.body && req.body.permissions);

  const summary = { processed:0, skipped:0, errors:[] };
  for(const id of userIds){
    try{
      await withTransaction(async client => {
        const result = await replacePermissionsCore(client, req.user.id, id, permissions);
        if(result.ok) summary.processed++;
        else { summary.skipped++; summary.errors.push({ id, reason:result.reason }); }
      });
    }catch(error){
      summary.skipped++;
      summary.errors.push({ id, reason:error.message });
    }
  }
  const grantedLabels = Object.keys(PERMISSION_LABELS).filter(key => permissions[key]).map(key => PERMISSION_LABELS[key]);
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, 'bulk-permissions', 'user', 'bulk', $2::jsonb)`,
    [req.user.id, JSON.stringify({
      description:`Permissões substituídas em lote para ${summary.processed} usuário(s)` +
        (grantedLabels.length ? `: ${grantedLabels.join(', ')}` : ' (nenhuma permissão adicional)'),
      permissions,
      ...summary
    })]
  );
  res.status(200).json(summary);
});

router.post('/', async (req, res) => {
  const username = String(req.body && req.body.username || '').trim().toLowerCase();
  const displayName = String(req.body && req.body.nome || '').trim();
  const email = String(req.body && req.body.email || '').trim();
  const password = String(req.body && req.body.password || '');
  const permissions = normalizePermissions(req.body && req.body.permissions);
  if(!/^[a-z0-9._-]{3,40}$/.test(username)){
    return res.status(400).json({ error:'Usuário inválido.' });
  }
  if(!displayName) return res.status(400).json({ error:'Informe o nome.' });
  if(email && !isValidEmail(email)){
    return res.status(400).json({ error:'Informe um e-mail válido.' });
  }
  if(password.length < 8 || password.length > 128){
    return res.status(400).json({ error:'A senha deve ter entre 8 e 128 caracteres.' });
  }
  const passwordHash = await hashPassword(password);

  const account = await withTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO users (
         username, display_name, email, password_hash, role, active,
         can_manage_reservations, can_manage_branches, can_manage_fleet, can_manage_blocks, can_view_reports,
         can_view_audit, can_manage_rules, can_manage_users, can_manage_integrations
       ) VALUES ($1, $2, $3, $4, 'user', TRUE, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        username, displayName, email || null, passwordHash,
        permissions.reservations, permissions.branches, permissions.fleet, permissions.blocks, permissions.reports,
        permissions.audit, permissions.rules, permissions.users, permissions.integrations
      ]
    );
    await audit(client, req.user.id, 'created', inserted.rows[0].id, { username });
    return inserted.rows[0];
  });
  res.status(201).json({ user:publicUser(account) });
});

router.patch('/:id', async (req, res) => {
  const displayName = String(req.body && req.body.nome || '').trim();
  const emailWasSent = !!(req.body && typeof req.body.email === 'string');
  const requestedEmail = emailWasSent ? String(req.body.email).trim() : '';
  const password = String(req.body && req.body.password || '');
  const active = req.body && typeof req.body.active === 'boolean' ? req.body.active : undefined;
  const permissionsWereSent = !!(
    req.body &&
    req.body.permissions &&
    typeof req.body.permissions === 'object'
  );
  const requestedPermissions = normalizePermissions(req.body && req.body.permissions);
  if(!displayName) return res.status(400).json({ error:'Informe o nome.' });
  if(requestedEmail && !isValidEmail(requestedEmail)){
    return res.status(400).json({ error:'Informe um e-mail válido.' });
  }
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
    // O e-mail de contas Entra é ditado pelo UPN (sincronizado no login/importação);
    // ignorar qualquer valor enviado pelo cliente para essas contas, mesmo que o
    // campo já venha desabilitado na interface.
    const email = current.auth_provider === 'entra'
      ? current.email
      : (emailWasSent ? (requestedEmail || null) : current.email);
    const permissions = permissionsWereSent ? requestedPermissions : {
      reservations:current.can_manage_reservations,
      branches:current.can_manage_branches,
      fleet:current.can_manage_fleet,
      blocks:current.can_manage_blocks,
      reports:current.can_view_reports,
      audit:current.can_view_audit,
      rules:current.can_manage_rules,
      users:current.can_manage_users,
      integrations:current.can_manage_integrations
    };
    const updated = await client.query(
      `UPDATE users
          SET display_name = $2,
              email = $3,
              password_hash = COALESCE($4, password_hash),
              active = CASE WHEN role = 'admin' THEN TRUE ELSE COALESCE($5, active) END,
              can_manage_reservations = CASE WHEN role = 'admin' THEN TRUE ELSE $6 END,
              can_manage_branches = CASE WHEN role = 'admin' THEN TRUE ELSE $7 END,
              can_manage_fleet = CASE WHEN role = 'admin' THEN TRUE ELSE $8 END,
              can_manage_blocks = CASE WHEN role = 'admin' THEN TRUE ELSE $9 END,
              can_view_reports = CASE WHEN role = 'admin' THEN TRUE ELSE $10 END,
              can_view_audit = CASE WHEN role = 'admin' THEN TRUE ELSE $11 END,
              can_manage_rules = CASE WHEN role = 'admin' THEN TRUE ELSE $12 END,
              can_manage_users = CASE WHEN role = 'admin' THEN TRUE ELSE $13 END,
              can_manage_integrations = CASE WHEN role = 'admin' THEN TRUE ELSE $14 END
        WHERE id = $1
        RETURNING *`,
      [
        current.id, displayName, email, passwordHash, active,
        isAdminAccount || permissions.reservations,
        isAdminAccount || permissions.branches,
        isAdminAccount || permissions.fleet,
        isAdminAccount || permissions.blocks,
        isAdminAccount || permissions.reports,
        isAdminAccount || permissions.audit,
        isAdminAccount || permissions.rules,
        isAdminAccount || permissions.users,
        isAdminAccount || permissions.integrations
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
