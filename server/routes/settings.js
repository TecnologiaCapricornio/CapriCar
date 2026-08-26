const express = require('express');
const { query } = require('../db');
const { requirePermission } = require('../auth');
const { encryptSecret, decryptSecret } = require('../secrets');
const { isValidEmail } = require('../validation');
const { ssoConfig } = require('../config');
const { sendTestMail } = require('../mailer');
const { sweepEmailReminders, getEmailReminderSettings } = require('../reminders');
const { getCalendarSyncSettings, sendTestCalendarEvent } = require('../calendar-sync');

const router = express.Router();
router.use(requirePermission('integrations'));

async function readCollection(name){
  const result = await query('SELECT value FROM application_state WHERE collection_name = $1', [name]);
  return result.rows[0] ? result.rows[0].value : null;
}

async function writeCollection(name, value, actorId, description){
  await query(
    `INSERT INTO application_state (collection_name, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (collection_name) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [name, JSON.stringify(value), actorId]
  );
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, 'updated', 'integracao', $2, $3::jsonb)`,
    [actorId, name, JSON.stringify({ description })]
  );
}

function isValidUrl(value){
  try{
    return !!new URL(value);
  }catch{
    return false;
  }
}

router.get('/entra-sso', async (req, res) => {
  const stored = await readCollection('entraSso');
  if(stored && stored.tenantId && stored.clientId){
    return res.json({
      tenantId:stored.tenantId,
      clientId:stored.clientId,
      redirectUri:stored.redirectUri || '',
      allowedDomains:stored.allowedDomains || '',
      clientSecretConfigured:!!stored.clientSecretEncrypted,
      enabled:!!(stored.tenantId && stored.clientId && stored.clientSecretEncrypted)
    });
  }
  const fallback = ssoConfig();
  res.json({
    tenantId:fallback.tenantId,
    clientId:fallback.clientId,
    redirectUri:fallback.redirectUri,
    allowedDomains:'',
    clientSecretConfigured:!!fallback.clientSecret,
    enabled:fallback.enabled
  });
});

router.put('/entra-sso', async (req, res) => {
  const tenantId = String(req.body && req.body.tenantId || '').trim();
  const clientId = String(req.body && req.body.clientId || '').trim();
  const redirectUri = String(req.body && req.body.redirectUri || '').trim();
  const clientSecret = String(req.body && req.body.clientSecret || '').trim();
  const allowedDomains = String(req.body && req.body.allowedDomains || '')
    .split(',')
    .map(domain => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
    .join(', ');
  if(!tenantId || tenantId.length > 200) return res.status(400).json({ error:'Informe um Tenant ID válido.' });
  if(!clientId || clientId.length > 200) return res.status(400).json({ error:'Informe um Client ID válido.' });
  if(!redirectUri || !isValidUrl(redirectUri)){
    return res.status(400).json({ error:'Informe uma URI de redirecionamento válida.' });
  }
  if(allowedDomains.length > 500){
    return res.status(400).json({ error:'A lista de domínios permitidos é muito longa.' });
  }

  const current = await readCollection('entraSso');
  let clientSecretEncrypted = current && current.clientSecretEncrypted;
  if(clientSecret){
    try{
      clientSecretEncrypted = await encryptSecret(clientSecret);
    }catch(error){
      return res.status(500).json({ error:error.message });
    }
  }

  await writeCollection('entraSso', { tenantId, clientId, redirectUri, allowedDomains, clientSecretEncrypted }, req.user.id,
    `Entra ID atualizado: tenant, client id, URI de redirecionamento, domínios permitidos${clientSecret ? ', client secret' : ''}`);
  res.json({
    tenantId, clientId, redirectUri, allowedDomains,
    clientSecretConfigured:!!clientSecretEncrypted,
    enabled:!!(tenantId && clientId && clientSecretEncrypted)
  });
});

router.get('/smtp', async (req, res) => {
  const stored = await readCollection('smtp');
  if(!stored){
    return res.json({ host:'', port:587, security:'starttls', username:'', fromName:'', fromAddress:'', passwordConfigured:false });
  }
  res.json({
    host:stored.host || '',
    port:stored.port || 587,
    security:stored.security || 'starttls',
    username:stored.username || '',
    fromName:stored.fromName || '',
    fromAddress:stored.fromAddress || '',
    passwordConfigured:!!stored.passwordEncrypted
  });
});

router.put('/smtp', async (req, res) => {
  const host = String(req.body && req.body.host || '').trim();
  const port = Number(req.body && req.body.port);
  const security = ['ssl', 'starttls', 'none'].includes(req.body && req.body.security) ? req.body.security : 'starttls';
  const username = String(req.body && req.body.username || '').trim();
  const fromName = String(req.body && req.body.fromName || '').trim();
  const fromAddress = String(req.body && req.body.fromAddress || '').trim();
  const password = String(req.body && req.body.password || '').trim();

  if(!host || host.length > 200) return res.status(400).json({ error:'Informe um host SMTP válido.' });
  if(!Number.isInteger(port) || port < 1 || port > 65535) return res.status(400).json({ error:'Informe uma porta entre 1 e 65535.' });
  if(!fromAddress || !isValidEmail(fromAddress)) return res.status(400).json({ error:'Informe um e-mail de remetente válido.' });

  const current = await readCollection('smtp');
  let passwordEncrypted = current && current.passwordEncrypted;
  if(password){
    try{
      passwordEncrypted = await encryptSecret(password);
    }catch(error){
      return res.status(500).json({ error:error.message });
    }
  }

  await writeCollection('smtp', { host, port, security, username, fromName, fromAddress, passwordEncrypted }, req.user.id,
    `SMTP atualizado: host, porta, segurança${password ? ', senha' : ''}`);
  res.json({ host, port, security, username, fromName, fromAddress, passwordConfigured:!!passwordEncrypted });
});

router.post('/smtp/test', async (req, res) => {
  const host = String(req.body && req.body.host || '').trim();
  const port = Number(req.body && req.body.port);
  const security = ['ssl', 'starttls', 'none'].includes(req.body && req.body.security) ? req.body.security : 'starttls';
  const username = String(req.body && req.body.username || '').trim();
  const fromName = String(req.body && req.body.fromName || '').trim();
  const fromAddress = String(req.body && req.body.fromAddress || '').trim();
  const testRecipient = String(req.body && req.body.testRecipient || '').trim();
  let password = String(req.body && req.body.password || '').trim();

  if(!host || !Number.isInteger(port)) return res.status(400).json({ error:'Preencha host e porta antes de testar.' });
  if(!fromAddress || !isValidEmail(fromAddress)) return res.status(400).json({ error:'Informe um e-mail de remetente válido.' });
  if(!testRecipient || !isValidEmail(testRecipient)) return res.status(400).json({ error:'Informe um destinatário de teste válido.' });

  if(!password){
    const current = await readCollection('smtp');
    if(current && current.passwordEncrypted){
      password = await decryptSecret(current.passwordEncrypted);
    }
  }

  try{
    await sendTestMail({ host, port, security, username, password, fromName, fromAddress }, testRecipient);
    res.json({ ok:true });
  }catch(error){
    res.status(502).json({ error:'Não foi possível enviar o e-mail de teste: ' + error.message });
  }
});

router.get('/email-reminders', async (req, res) => {
  const settings = await getEmailReminderSettings();
  res.json(settings);
});

router.put('/email-reminders', async (req, res) => {
  const body = req.body || {};
  const types = ['reservationUpcoming', 'pickupOverdue', 'returnOverdue'];
  const next = {};
  for(const type of types){
    const item = body[type] || {};
    const subject = String(item.subject || '').trim();
    const html = String(item.body || '').trim();
    const enabled = item.enabled === true;
    if(enabled && (!subject || subject.length > 200)){
      return res.status(400).json({ error:`Informe um assunto válido (até 200 caracteres) para "${type}".` });
    }
    if(enabled && (!html || html.length > 10000)){
      return res.status(400).json({ error:`Informe um corpo de e-mail válido (até 10000 caracteres) para "${type}".` });
    }
    next[type] = { enabled, subject, body:html };
  }
  await writeCollection('emailReminders', next, req.user.id, 'Lembretes automáticos por e-mail atualizados');
  res.json(next);
});

router.post('/email-reminders/run-now', async (req, res) => {
  try{
    const summary = await sweepEmailReminders();
    res.json(summary);
  }catch(error){
    res.status(500).json({ error:'Falha ao executar a varredura de lembretes: ' + error.message });
  }
});

router.get('/calendar-sync', async (req, res) => {
  const settings = await getCalendarSyncSettings();
  res.json(settings);
});

router.put('/calendar-sync', async (req, res) => {
  const enabled = req.body && req.body.enabled === true;
  await writeCollection('calendarSync', { enabled }, req.user.id,
    `Sincronização com o calendário do Outlook ${enabled ? 'ativada' : 'desativada'}`);
  res.json({ enabled });
});

router.post('/calendar-sync/test', async (req, res) => {
  if(!req.user.email){
    return res.status(400).json({ error:'Cadastre um e-mail para a sua conta antes de testar a sincronização.' });
  }
  try{
    await sendTestCalendarEvent(req.user.email);
    res.json({ ok:true });
  }catch(error){
    res.status(502).json({ error:'Não foi possível criar o evento de teste: ' + error.message });
  }
});

module.exports = router;
