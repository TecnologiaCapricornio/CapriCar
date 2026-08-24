const { query } = require('./db');
const { hashSessionToken } = require('./security');

const SESSION_COOKIE = 'capricar_session';

function parseCookies(header){
  const cookies = {};
  String(header || '').split(';').forEach(part => {
    const separator = part.indexOf('=');
    if(separator < 0) return;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if(key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function permissionsFromRow(row){
  return {
    reservations:row.can_manage_reservations === true,
    fleet:row.can_manage_fleet === true,
    blocks:row.can_manage_blocks === true,
    reports:row.can_view_reports === true,
    audit:row.can_view_audit === true,
    rules:row.can_manage_rules === true,
    users:row.can_manage_users === true
  };
}

function publicUser(row){
  return {
    id:row.id,
    username:row.username,
    nome:row.display_name,
    role:row.role,
    active:row.active,
    permissions:permissionsFromRow(row)
  };
}

async function loadAuthenticatedUser(req){
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if(!token) return null;
  const result = await query(
    `SELECT u.*
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND u.active = TRUE
        AND u.deleted_at IS NULL`,
    [hashSessionToken(token)]
  );
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

async function requireAuth(req, res, next){
  try{
    const user = await loadAuthenticatedUser(req);
    if(!user) return res.status(401).json({ error:'Autenticação necessária.' });
    req.user = user;
    next();
  }catch(error){
    next(error);
  }
}

function requireAdmin(req, res, next){
  if(!req.user || req.user.role !== 'admin'){
    return res.status(403).json({ error:'Acesso exclusivo do administrador.' });
  }
  next();
}

function userCanManage(user, permission){
  return !!user && (user.role === 'admin' || user.permissions[permission] === true);
}

function requirePermission(permission){
  return function(req, res, next){
    if(userCanManage(req.user, permission)) return next();
    return res.status(403).json({ error:'Você não possui permissão para esta operação.' });
  };
}

module.exports = {
  SESSION_COOKIE,
  parseCookies,
  permissionsFromRow,
  publicUser,
  requireAuth,
  requireAdmin,
  requirePermission,
  userCanManage
};
