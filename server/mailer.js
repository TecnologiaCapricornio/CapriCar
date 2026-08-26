const nodemailer = require('nodemailer');
const { query } = require('./db');
const { decryptSecret } = require('./secrets');

let cachedTransport = null;
let cachedTransportKey = '';

async function getSmtpSettings(){
  const result = await query("SELECT value FROM application_state WHERE collection_name = 'smtp'");
  const stored = result.rows[0] && result.rows[0].value;
  if(!stored || !stored.host || !stored.fromAddress){
    return null;
  }
  let password = '';
  if(stored.passwordEncrypted){
    password = await decryptSecret(stored.passwordEncrypted);
  }
  return {
    host:String(stored.host || '').trim(),
    port:Number(stored.port) || 587,
    security:stored.security === 'ssl' || stored.security === 'starttls' ? stored.security : 'none',
    username:String(stored.username || '').trim(),
    password,
    fromName:String(stored.fromName || '').trim(),
    fromAddress:String(stored.fromAddress || '').trim()
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

async function sendMail({ to, subject, html }){
  const settings = await getSmtpSettings();
  if(!settings){
    throw new Error('SMTP não configurado. Acesse o Painel de Administração > Integrações.');
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

// Usado pelo botao "Testar conexao" - monta um transporte avulso a partir
// dos valores digitados no formulario (ainda nao salvos), sem tocar no
// transporte em cache usado pelos lembretes automaticos.
async function sendTestMail(settings, to){
  const transport = buildTransport(settings);
  await transport.verify();
  const fromLabel = settings.fromName
    ? `"${settings.fromName.replace(/"/g, '')}" <${settings.fromAddress}>`
    : settings.fromAddress;
  await transport.sendMail({
    from:fromLabel,
    to,
    subject:'CapriCar — teste de configuração de e-mail',
    html:'<p>Se você recebeu esta mensagem, a configuração de SMTP do CapriCar está funcionando corretamente.</p>'
  });
}

module.exports = { getSmtpSettings, sendMail, sendTestMail };
