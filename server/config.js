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

// Provedores gerenciados (Azure Database for PostgreSQL, por exemplo) exigem
// conexão TLS por padrão - sem isso a conexão nem chega a autenticar. Local
// e Docker Compose não precisam (PGSSLMODE fica em branco = sem TLS). O
// certificado da Azure é assinado por uma CA pública reconhecida pelo Node,
// então a validação padrão já funciona; PGSSLMODE=no-verify existe só como
// escape hatch de depuração (nunca use isso além de investigar um problema).
function databaseSslConfig(){
  const mode = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  if(!mode || mode === 'disable') return undefined;
  return { rejectUnauthorized: mode !== 'no-verify' };
}

function databaseConfig(){
  return {
    host:required('PGHOST'),
    port:Number(process.env.PGPORT || 5432),
    database:required('PGDATABASE'),
    user:required('PGUSER'),
    password:required('PGPASSWORD'),
    ssl:databaseSslConfig(),
    max:10,
    idleTimeoutMillis:30000,
    connectionTimeoutMillis:5000
  };
}

// Traduz TRUST_PROXY do .env pro formato que o Express espera em
// "trust proxy": "true"/"false" viram booleano de verdade (passar a string
// literal "true" pro Express não funciona - ele tentaria interpretar como
// endereço IP); qualquer outro valor (IP, CIDR, ou uma lista deles separada
// por vírgula) passa direto. Sem a variável definida, mantém o padrão
// seguro de só confiar em um proxy rodando na própria máquina.
function trustProxyConfig(){
  const value = String(process.env.TRUST_PROXY || '').trim();
  if(!value) return 'loopback';
  if(value.toLowerCase() === 'true') return true;
  if(value.toLowerCase() === 'false') return false;
  return value;
}

function appConfig(){
  return {
    port:Number(process.env.PORT || 3000),
    trustProxy:trustProxyConfig(),
    // Só aceita conexão vindo da própria máquina por padrão (loopback) -
    // pressupõe um proxy reverso (nginx, etc.) rodando ali do lado, que é
    // quem de fato recebe tráfego externo (ver cabeçalhos de segurança e
    // "trust proxy" acima). Dentro de um container Docker, "127.0.0.1" é o
    // loopback DO PRÓPRIO CONTAINER - nem o host nem um proxy em outro
    // container conseguem alcançar isso, então o docker-compose define
    // HOST=0.0.0.0 para o serviço da aplicação (ver docker-compose.yml).
    // Fora do Docker, deixe HOST em branco para manter o padrão mais seguro.
    host:String(process.env.HOST || '127.0.0.1').trim() || '127.0.0.1',
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

