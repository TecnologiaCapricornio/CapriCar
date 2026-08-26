const { ConfidentialClientApplication } = require('@azure/msal-node');
const { query, withTransaction } = require('./db');
const { ssoConfig } = require('./config');
const { hashPassword, createSessionToken } = require('./security');
const { decryptSecret } = require('./secrets');

const LOGIN_SCOPES = ['openid', 'profile', 'email', 'User.Read'];
const GRAPH_SCOPE = ['https://graph.microsoft.com/.default'];

let cachedClient = null;
let cachedClientKey = '';

// Resolve a configuracao do Entra ID: valores salvos pelo Painel de
// Administracao (banco) tem prioridade; o .env so serve de fallback,
// mantendo compatibilidade com instalacoes que ainda nao configuraram
// isso pela interface.
async function resolveSsoConfig(){
  const result = await query(
    "SELECT value FROM application_state WHERE collection_name = 'entraSso'"
  );
  const stored = result.rows[0] && result.rows[0].value;
  const tenantId = stored && String(stored.tenantId || '').trim();
  const clientId = stored && String(stored.clientId || '').trim();
  if(!stored || !tenantId || !clientId){
    return ssoConfig();
  }
  let clientSecret = '';
  if(stored.clientSecretEncrypted){
    try{
      clientSecret = await decryptSecret(stored.clientSecretEncrypted);
    }catch(error){
      console.error('Falha ao decifrar o client secret do Entra armazenado:', error.message);
    }
  }
  const redirectUri = String(stored.redirectUri || '').trim() || ssoConfig().redirectUri;
  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    enabled:!!(tenantId && clientId && clientSecret)
  };
}

// Reconstroi o client se as credenciais mudarem (ex.: apos editar as
// configuracoes de integracao), mas evita recriar a cada requisicao.
async function getMsalClient(){
  const config = await resolveSsoConfig();
  if(!config.enabled) return null;
  const key = config.tenantId + '|' + config.clientId + '|' + config.clientSecret;
  if(cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = new ConfidentialClientApplication({
    auth:{
      clientId:config.clientId,
      authority:'https://login.microsoftonline.com/' + config.tenantId,
      clientSecret:config.clientSecret
    }
  });
  cachedClientKey = key;
  return cachedClient;
}

async function getAuthCodeUrl(state){
  const client = await getMsalClient();
  if(!client) throw new Error('SSO não está configurado.');
  const config = await resolveSsoConfig();
  return client.getAuthCodeUrl({
    scopes:LOGIN_SCOPES,
    redirectUri:config.redirectUri,
    state,
    responseMode:'query'
  });
}

async function acquireTokenFromCode(code){
  const client = await getMsalClient();
  if(!client) throw new Error('SSO não está configurado.');
  const config = await resolveSsoConfig();
  return client.acquireTokenByCode({
    code,
    scopes:LOGIN_SCOPES,
    redirectUri:config.redirectUri
  });
}

async function getGraphAppToken(){
  const client = await getMsalClient();
  if(!client) throw new Error('SSO não está configurado.');
  const result = await client.acquireTokenByClientCredential({ scopes:GRAPH_SCOPE });
  return result.accessToken;
}

// Lista de dominios permitidos para importacao/login via Entra ID, definida
// no Painel de Administracao > Integracoes. Vazia = sem restricao (mantem
// o comportamento anterior, aceitando qualquer dominio do tenant).
async function getAllowedEntraDomains(){
  const result = await query("SELECT value FROM application_state WHERE collection_name = 'entraSso'");
  const stored = result.rows[0] && result.rows[0].value;
  const raw = stored && stored.allowedDomains;
  if(!raw) return [];
  return String(raw)
    .split(',')
    .map(domain => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

function isEmailDomainAllowed(email, allowedDomains){
  if(!allowedDomains || !allowedDomains.length) return true;
  const domain = String(email || '').split('@')[1];
  if(!domain) return false;
  return allowedDomains.includes(domain.toLowerCase());
}

function sanitizeUsername(candidate){
  return String(candidate || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40);
}

async function findAvailableUsername(client, baseCandidate, objectId){
  const base = sanitizeUsername(baseCandidate) || 'usuario';
  const existing = await client.query('SELECT username, auth_provider FROM users WHERE LOWER(username) = $1', [base]);
  const row = existing.rows[0];
  if(!row) return base;
  // So reutiliza o username se ja pertencer a esse mesmo principal do Entra
  // (reimportacao); colidir com uma conta local nunca deve herdar o acesso
  // dela, entao geramos um username alternativo derivado do oid.
  if(row.auth_provider === 'entra') return base;
  const suffix = String(objectId || '').replace(/-/g, '').slice(0, 6);
  return (base.slice(0, 33) + '-' + suffix).slice(0, 40);
}

// Ponto unico de provisionamento usado tanto pelo login JIT (callback do
// SSO) quanto pela importacao em massa - garante que as duas vias produzam
// exatamente o mesmo formato de linha em `users`.
async function resolveOrCreateSsoUser(claims){
  const objectId = claims.objectId;
  const upn = claims.upn || '';
  const displayName = claims.displayName || upn || 'Usuário Microsoft';
  if(!objectId) throw new Error('Claim "oid" ausente na resposta do Entra ID.');

  const allowedDomains = await getAllowedEntraDomains();
  if(!isEmailDomainAllowed(upn, allowedDomains)){
    throw Object.assign(
      new Error('Este domínio não tem acesso ao CapriCar.'),
      { code:'DOMAIN_DENIED' }
    );
  }

  return withTransaction(async client => {
    const existing = await client.query(
      'SELECT * FROM users WHERE entra_object_id = $1 AND deleted_at IS NULL',
      [objectId]
    );
    if(existing.rows[0]){
      const current = existing.rows[0];
      if(current.display_name !== displayName || current.entra_upn !== upn || current.email !== upn){
        const updated = await client.query(
          `UPDATE users SET display_name = $2, entra_upn = $3, email = $3
            WHERE id = $1
          RETURNING *`,
          [current.id, displayName, upn]
        );
        return { user:updated.rows[0], created:false, updated:true };
      }
      return { user:current, created:false, updated:false };
    }

    const username = await findAvailableUsername(client, upn, objectId);
    const passwordHash = await hashPassword(createSessionToken());
    const inserted = await client.query(
      `INSERT INTO users (
         username, display_name, password_hash, role, active,
         entra_object_id, entra_upn, email, auth_provider,
         can_manage_reservations, can_manage_branches, can_manage_fleet, can_manage_blocks,
         can_view_reports, can_view_audit, can_manage_rules, can_manage_users, can_manage_integrations
       ) VALUES ($1, $2, $3, 'user', TRUE, $4, $5, $5, 'entra', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
       RETURNING *`,
      [username, displayName, passwordHash, objectId, upn]
    );
    return { user:inserted.rows[0], created:true, updated:false };
  });
}

async function fetchGraphUsersPage(url, token){
  const response = await fetch(url, {
    headers:{ Authorization:'Bearer ' + token, Accept:'application/json' }
  });
  if(!response.ok){
    const body = await response.text().catch(() => '');
    throw new Error('Microsoft Graph respondeu ' + response.status + ': ' + body.slice(0, 300));
  }
  return response.json();
}

// Importa todos os usuarios do tenant via Microsoft Graph (fluxo app-only,
// exige a permissao de aplicativo User.Read.All com consentimento de admin).
async function importSsoUsers(){
  const token = await getGraphAppToken();
  const allowedDomains = await getAllowedEntraDomains();
  const summary = { created:0, updated:0, skipped:0, errors:[] };
  let url = 'https://graph.microsoft.com/v1.0/users?$select=id,userPrincipalName,displayName,accountEnabled&$top=100';

  while(url){
    const page = await fetchGraphUsersPage(url, token);
    const rows = Array.isArray(page.value) ? page.value : [];
    for(const row of rows){
      if(row.accountEnabled === false){
        summary.skipped++;
        continue;
      }
      if(!isEmailDomainAllowed(row.userPrincipalName, allowedDomains)){
        summary.skipped++;
        continue;
      }
      try{
        const result = await resolveOrCreateSsoUser({
          objectId:row.id,
          upn:row.userPrincipalName,
          displayName:row.displayName
        });
        if(result.created) summary.created++;
        else if(result.updated) summary.updated++;
        else summary.skipped++;
      }catch(error){
        summary.errors.push({ upn:row.userPrincipalName || row.id, reason:error.message });
      }
    }
    url = page['@odata.nextLink'] || null;
  }

  return summary;
}

module.exports = {
  getMsalClient,
  getAuthCodeUrl,
  acquireTokenFromCode,
  getGraphAppToken,
  resolveOrCreateSsoUser,
  importSsoUsers,
  resolveSsoConfig,
  getAllowedEntraDomains,
  isEmailDomainAllowed
};
