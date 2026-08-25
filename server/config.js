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

module.exports = { databaseConfig, appConfig, ssoConfig };

