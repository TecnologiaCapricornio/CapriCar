const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path:path.join(__dirname, '..', '.env') });

function required(name){
  const value = process.env[name];
  if(!value || !String(value).trim()){
    throw new Error('Variável obrigatória ausente: ' + name);
  }
  return value;
}

function databaseConfig(){
  return {
    host:required('PGHOST'),
    port:Number(process.env.PGPORT || 5432),
    database:required('PGDATABASE'),
    user:required('PGUSER'),
    password:required('PGPASSWORD'),
    max:10,
    idleTimeoutMillis:30000,
    connectionTimeoutMillis:5000
  };
}

function appConfig(){
  return {
    port:Number(process.env.PORT || 3000),
    production:process.env.NODE_ENV === 'production',
    sessionTtlHours:Math.max(1, Number(process.env.SESSION_TTL_HOURS || 12)),
    secureCookie:process.env.SESSION_COOKIE_SECURE === 'true'
  };
}

function ssoConfig(){
  const tenantId = String(process.env.ENTRA_TENANT_ID || '').trim();
  const clientId = String(process.env.ENTRA_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.ENTRA_CLIENT_SECRET || '').trim();
  const redirectUri = String(process.env.ENTRA_REDIRECT_URI || 'http://localhost:3000/api/auth/sso/callback').trim();
  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    enabled:!!(tenantId && clientId && clientSecret)
  };
}

const LOGIN_METHOD_VALUES = ['local', 'entra', 'both'];

// Controla quais métodos de login ficam disponíveis (e, portanto, visíveis
// na tela de login) - independente de o Entra ID estar ou não configurado.
// Valores aceitos: "local" (só usuário/senha), "entra" (só Microsoft) ou
// "both" (os dois, padrão - mantém o comportamento anterior a esta
// variável existir). Um valor desconhecido cai em "both" em vez de travar
// o login de todo mundo por um typo no .env.
function loginMethodConfig(){
  const raw = String(process.env.LOGIN_METHOD || 'both').trim().toLowerCase();
  const method = LOGIN_METHOD_VALUES.includes(raw) ? raw : 'both';
  return {
    method,
    localEnabled:method !== 'entra',
    entraEnabled:method !== 'local'
  };
}

module.exports = { databaseConfig, appConfig, ssoConfig, loginMethodConfig };

