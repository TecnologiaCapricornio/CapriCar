const nodemailer = require('nodemailer');
const { query } = require('./db');
const { decryptSecret } = require('./secrets');
const { graphRequest } = require('./graph-client');

let cachedTransport = null;
let cachedTransportKey = '';

// "smtp" (servidor tradicional, com usuário/senha) ou "graph" (Microsoft 365
// via Graph, reaproveitando o app registration do SSO - sem senha nenhuma,
// então funciona mesmo com MFA/Acesso Condicional bloqueando SMTP básico).
// Configurações antigas, salvas antes deste campo existir, não têm "method"
// e continuam como "smtp" por padrão.
function resolveSendMethod(stored){
  return stored && stored.method === 'graph' ? 'graph' : 'smtp';
}

async function getSmtpSettings(){
  const result = await query("SELECT value FROM application_state WHERE collection_name = 'smtp'");
  const stored = result.rows[0] && result.rows[0].value;
  if(!stored || !stored.fromAddress) return null;
  const method = resolveSendMethod(stored);
  const fromName = String(stored.fromName || '').trim();
  const fromAddress = String(stored.fromAddress || '').trim();
  if(method === 'graph') return { method, fromName, fromAddress };
  if(!stored.host) return null;
  let password = '';
  if(stored.passwordEncrypted){
    password = await decryptSecret(stored.passwordEncrypted);
  }
  return {
    method,
    host:String(stored.host || '').trim(),
    port:Number(stored.port) || 587,
    security:stored.security === 'ssl' || stored.security === 'starttls' ? stored.security : 'none',
    username:String(stored.username || '').trim(),
    password,
    fromName,
    fromAddress
  };
}

function transportOptionsFor(settings){
  const base = { host:settings.host, port:settings.port };
  if(settings.security === 'ssl') return { ...base, secure:true };
  if(settings.security === 'starttls') return { ...base, secure:false, requireTLS:true };
  return { ...base, secure:false };
}

function buildTransport(settings){
  const options = transportOptionsFor(settings);
  if(settings.username){
    options.auth = { user:settings.username, pass:settings.password };
  }
  return nodemailer.createTransport(options);
}

function getCachedTransport(settings){
  const key = [settings.host, settings.port, settings.security, settings.username, settings.password].join('|');
  if(cachedTransport && cachedTransportKey === key) return cachedTransport;
  cachedTransport = buildTransport(settings);
  cachedTransportKey = key;
  return cachedTransport;
}

// Corpo enviado ao endpoint /users/{caixa}/sendMail do Microsoft Graph -
// extraído numa função pura para poder testar o formato sem precisar de
// rede (mesmo raciocínio de buildEventPayload em server/calendar-sync.js).
function buildGraphMailPayload({ to, subject, html }){
  return {
    message:{
      subject,
      body:{ contentType:'HTML', content:html },
      toRecipients:[{ emailAddress:{ address:to } }]
    },
    // A cópia na pasta "Itens Enviados" da caixa usada é dispensável aqui -
    // são só notificações automáticas do sistema, não correspondência real.
    saveToSentItems:false
  };
}

// A caixa que "envia" é a própria settings.fromAddress - a permissão de
// aplicativo Mail.Send do Graph permite enviar como qualquer usuário do
// tenant (a menos que uma ApplicationAccessPolicy restrinja isso no Azure),
// então não há "login" nenhum aqui, só a identidade do app registration já
// usado pelo SSO (ver getGraphAppToken em server/sso.js).
async function sendMailViaGraph(fromAddress, message){
  await graphRequest('POST', `/users/${encodeURIComponent(fromAddress)}/sendMail`, buildGraphMailPayload(message));
}

async function sendMail({ to, subject, html }){
  const settings = await getSmtpSettings();
  if(!settings){
    throw new Error('E-mail não configurado. Acesse o Painel de Administração > Integrações.');
  }
  if(settings.method === 'graph'){
    try{
      await sendMailViaGraph(settings.fromAddress, { to, subject, html });
    }catch(error){
      console.error('Falha ao enviar e-mail via Microsoft Graph:', { fromAddress:settings.fromAddress, to, subject });
      throw error;
    }
    return;
  }
  const transport = getCachedTransport(settings);
  const fromLabel = settings.fromName
    ? `"${settings.fromName.replace(/"/g, '')}" <${settings.fromAddress}>`
    : settings.fromAddress;
  try{
    await transport.sendMail({ from:fromLabel, to, subject, html });
  }catch(error){
    console.error('Falha ao enviar e-mail:', { host:settings.host, port:settings.port, to, subject });
    throw error;
  }
}

// Usado pelo botao "Testar" - monta o envio a partir dos valores digitados
// no formulario (ainda nao salvos), sem tocar no transporte SMTP em cache
// usado pelos lembretes automaticos.
async function sendTestMail(settings, to){
  const subject = 'CapriCar — teste de configuração de e-mail';
  if(settings.method === 'graph'){
    await sendMailViaGraph(settings.fromAddress, {
      to,
      subject,
      html:'<p>Se você recebeu esta mensagem, o envio de e-mail via Microsoft 365 do CapriCar está funcionando corretamente.</p>'
    });
    return;
  }
  const transport = buildTransport(settings);
  await transport.verify();
  const fromLabel = settings.fromName
    ? `"${settings.fromName.replace(/"/g, '')}" <${settings.fromAddress}>`
    : settings.fromAddress;
  await transport.sendMail({
    from:fromLabel,
    to,
    subject,
    html:'<p>Se você recebeu esta mensagem, a configuração de SMTP do CapriCar está funcionando corretamente.</p>'
  });
}

module.exports = { getSmtpSettings, sendMail, sendTestMail, buildGraphMailPayload };
