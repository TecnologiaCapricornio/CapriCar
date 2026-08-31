/* Gestão — integrações (Entra ID, e-mail SMTP e lembretes automáticos) */

const entraSsoForm = document.getElementById('entraSsoForm');
const entraTenantIdInput = document.getElementById('entraTenantId');
const entraClientIdInput = document.getElementById('entraClientId');
const entraClientSecretInput = document.getElementById('entraClientSecret');
const entraRedirectUriInput = document.getElementById('entraRedirectUri');
const entraAllowedDomainsInput = document.getElementById('entraAllowedDomains');
const entraSsoSummary = document.getElementById('entraSsoSummary');
const entraSsoError = document.getElementById('entraSsoError');

const smtpForm = document.getElementById('smtpForm');
const smtpHostInput = document.getElementById('smtpHost');
const smtpPortInput = document.getElementById('smtpPort');
const smtpSecurityInput = document.getElementById('smtpSecurity');
const smtpUsernameInput = document.getElementById('smtpUsername');
const smtpPasswordInput = document.getElementById('smtpPassword');
const smtpFromNameInput = document.getElementById('smtpFromName');
const smtpFromAddressInput = document.getElementById('smtpFromAddress');
const smtpSummary = document.getElementById('smtpSummary');
const smtpError = document.getElementById('smtpError');
const smtpTestRecipientInput = document.getElementById('smtpTestRecipient');
const smtpTestBtn = document.getElementById('smtpTestBtn');
const smtpTestError = document.getElementById('smtpTestError');

const emailRemindersForm = document.getElementById('emailRemindersForm');
const emailRemindersError = document.getElementById('emailRemindersError');
const emailRemindersRunNowBtn = document.getElementById('emailRemindersRunNowBtn');

const calendarSyncForm = document.getElementById('calendarSyncForm');
const calendarSyncEnabledInput = document.getElementById('calendarSyncEnabled');
const calendarSyncError = document.getElementById('calendarSyncError');
const calendarSyncTestBtn = document.getElementById('calendarSyncTestBtn');
const calendarSyncTestError = document.getElementById('calendarSyncTestError');

const REMINDER_FIELDS = {
  reservationUpcoming:{
    enabled:document.getElementById('reminderUpcomingEnabled'),
    subject:document.getElementById('reminderUpcomingSubject'),
    body:document.getElementById('reminderUpcomingBody')
  },
  pickupOverdue:{
    enabled:document.getElementById('reminderPickupEnabled'),
    subject:document.getElementById('reminderPickupSubject'),
    body:document.getElementById('reminderPickupBody')
  },
  returnOverdue:{
    enabled:document.getElementById('reminderReturnEnabled'),
    subject:document.getElementById('reminderReturnSubject'),
    body:document.getElementById('reminderReturnBody')
  },
  passengerJoined:{
    enabled:document.getElementById('reminderPassengerJoinedEnabled'),
    subject:document.getElementById('reminderPassengerJoinedSubject'),
    body:document.getElementById('reminderPassengerJoinedBody')
  },
  rideWatchMatch:{
    enabled:document.getElementById('reminderRideWatchMatchEnabled'),
    subject:document.getElementById('reminderRideWatchMatchSubject'),
    body:document.getElementById('reminderRideWatchMatchBody')
  },
  cnhExpiring:{
    enabled:document.getElementById('reminderCnhExpiringEnabled'),
    subject:document.getElementById('reminderCnhExpiringSubject'),
    body:document.getElementById('reminderCnhExpiringBody')
  }
};

let integrationsLoaded = false;

async function loadEntraSsoForm(){
  const status = await apiRequest('/api/settings/entra-sso');
  entraTenantIdInput.value = status.tenantId || '';
  entraClientIdInput.value = status.clientId || '';
  entraRedirectUriInput.value = status.redirectUri || '';
  entraAllowedDomainsInput.value = status.allowedDomains || '';
  entraClientSecretInput.value = '';
  entraClientSecretInput.placeholder = status.clientSecretConfigured
    ? 'Deixe em branco para manter o segredo atual'
    : 'Nenhum segredo definido — informe o client secret';
  const domainsNote = status.allowedDomains
    ? ` Restrito aos domínios: ${status.allowedDomains}.`
    : ' Sem restrição de domínio.';
  entraSsoSummary.textContent = (status.enabled
    ? 'Login via Microsoft está habilitado.'
    : 'Login via Microsoft ainda não está totalmente configurado.') + domainsNote;
  entraSsoError.textContent = '';
}

async function loadSmtpForm(){
  const status = await apiRequest('/api/settings/smtp');
  smtpHostInput.value = status.host || '';
  smtpPortInput.value = status.port || 587;
  smtpSecurityInput.value = status.security || 'starttls';
  smtpUsernameInput.value = status.username || '';
  smtpFromNameInput.value = status.fromName || '';
  smtpFromAddressInput.value = status.fromAddress || '';
  smtpPasswordInput.value = '';
  smtpPasswordInput.placeholder = status.passwordConfigured
    ? 'Deixe em branco para manter a senha atual'
    : 'Nenhuma senha definida';
  smtpSummary.textContent = status.host
    ? `Configurado: ${status.host}:${status.port}`
    : 'E-mail para envio ainda não configurado.';
  smtpError.textContent = '';
  smtpTestError.textContent = '';
}

async function loadEmailRemindersForm(){
  const settings = await apiRequest('/api/settings/email-reminders');
  Object.keys(REMINDER_FIELDS).forEach(type => {
    const fields = REMINDER_FIELDS[type];
    const item = settings[type] || {};
    fields.enabled.checked = item.enabled === true;
    fields.subject.value = item.subject || '';
    fields.body.value = item.body || '';
  });
  emailRemindersError.textContent = '';
}

async function loadCalendarSyncForm(){
  const settings = await apiRequest('/api/settings/calendar-sync');
  calendarSyncEnabledInput.checked = settings.enabled === true;
  calendarSyncError.textContent = '';
  calendarSyncTestError.textContent = '';
}

async function renderIntegrationsManagement(){
  if(!canManageIntegrations()) return;
  // Botões "Visualizar e-mail" (ver js/management-email-preview.js). São
  // criados a partir de REMINDER_FIELDS e a função é idempotente, então
  // pode ser chamada a cada abertura da aba.
  if(typeof setupEmailPreviewButtons === 'function') setupEmailPreviewButtons();
  try{
    await Promise.all([loadEntraSsoForm(), loadSmtpForm(), loadEmailRemindersForm(), loadCalendarSyncForm()]);
    integrationsLoaded = true;
  }catch(error){
    if(!integrationsLoaded){
      entraSsoError.textContent = error.message;
    }
  }
}

entraSsoForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageIntegrations()) return;
  entraSsoError.textContent = '';
  const tenantId = entraTenantIdInput.value.trim();
  const clientId = entraClientIdInput.value.trim();
  const redirectUri = entraRedirectUriInput.value.trim();
  const allowedDomains = entraAllowedDomainsInput.value.trim();
  const clientSecret = entraClientSecretInput.value.trim();
  if(!tenantId || !clientId || !redirectUri){
    entraSsoError.textContent = 'Preencha Tenant ID, Client ID e a URI de redirecionamento.';
    return;
  }
  const confirmed = await showSiteConfirm(
    'Confirma a alteração da configuração de login via Microsoft (Entra ID)?',
    { title:'Confirmar alteração', type:'warning', confirmText:'Salvar', cancelText:'Cancelar' }
  );
  if(!confirmed) return;
  try{
    await apiRequest('/api/settings/entra-sso', {
      method:'PUT',
      body:{ tenantId, clientId, redirectUri, allowedDomains, clientSecret }
    });
    await loadEntraSsoForm();
    await showSiteAlert('Configuração do Entra ID salva com sucesso.', {
      title:'Integração atualizada', type:'success'
    });
  }catch(error){
    entraSsoError.textContent = error.message;
  }
});

smtpForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageIntegrations()) return;
  smtpError.textContent = '';
  const host = smtpHostInput.value.trim();
  const port = Number(smtpPortInput.value);
  const fromAddress = smtpFromAddressInput.value.trim();
  if(!host || !Number.isInteger(port) || !fromAddress){
    smtpError.textContent = 'Preencha host, porta e o e-mail do remetente.';
    return;
  }
  const confirmed = await showSiteConfirm(
    'Confirma a alteração da configuração de e-mail (SMTP)?',
    { title:'Confirmar alteração', type:'warning', confirmText:'Salvar', cancelText:'Cancelar' }
  );
  if(!confirmed) return;
  try{
    await apiRequest('/api/settings/smtp', {
      method:'PUT',
      body:{
        host, port,
        security:smtpSecurityInput.value,
        username:smtpUsernameInput.value.trim(),
        password:smtpPasswordInput.value.trim(),
        fromName:smtpFromNameInput.value.trim(),
        fromAddress
      }
    });
    await loadSmtpForm();
    await showSiteAlert('Configuração de e-mail salva com sucesso.', {
      title:'Integração atualizada', type:'success'
    });
  }catch(error){
    smtpError.textContent = error.message;
  }
});

smtpTestBtn.addEventListener('click', async function(){
  if(!canManageIntegrations()) return;
  smtpTestError.textContent = '';
  const testRecipient = smtpTestRecipientInput.value.trim();
  const host = smtpHostInput.value.trim();
  const port = Number(smtpPortInput.value);
  const fromAddress = smtpFromAddressInput.value.trim();
  if(!host || !Number.isInteger(port) || !fromAddress || !testRecipient){
    smtpTestError.textContent = 'Preencha host, porta, e-mail do remetente e o destinatário do teste.';
    return;
  }
  smtpTestBtn.disabled = true;
  const originalHTML = smtpTestBtn.innerHTML;
  smtpTestBtn.textContent = 'Testando...';
  try{
    await apiRequest('/api/settings/smtp/test', {
      method:'POST',
      body:{
        host, port,
        security:smtpSecurityInput.value,
        username:smtpUsernameInput.value.trim(),
        password:smtpPasswordInput.value.trim(),
        fromName:smtpFromNameInput.value.trim(),
        fromAddress,
        testRecipient
      }
    });
    await showSiteAlert('E-mail de teste enviado com sucesso para ' + testRecipient + '.', {
      title:'Conexão SMTP validada', type:'success'
    });
  }catch(error){
    smtpTestError.textContent = error.message;
  }finally{
    smtpTestBtn.disabled = false;
    smtpTestBtn.innerHTML = originalHTML;
  }
});

emailRemindersForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageIntegrations()) return;
  emailRemindersError.textContent = '';
  const body = {};
  for(const type of Object.keys(REMINDER_FIELDS)){
    const fields = REMINDER_FIELDS[type];
    const enabled = fields.enabled.checked;
    const subject = fields.subject.value.trim();
    const text = fields.body.value.trim();
    if(enabled && (!subject || !text)){
      emailRemindersError.textContent = 'Preencha assunto e corpo antes de habilitar um lembrete.';
      return;
    }
    body[type] = { enabled, subject, body:text };
  }
  const confirmed = await showSiteConfirm(
    'Confirma a alteração dos lembretes automáticos por e-mail?',
    { title:'Confirmar alteração', type:'warning', confirmText:'Salvar', cancelText:'Cancelar' }
  );
  if(!confirmed) return;
  try{
    await apiRequest('/api/settings/email-reminders', { method:'PUT', body });
    await loadEmailRemindersForm();
    await showSiteAlert('Lembretes automáticos por e-mail atualizados com sucesso.', {
      title:'Lembretes atualizados', type:'success'
    });
  }catch(error){
    emailRemindersError.textContent = error.message;
  }
});

emailRemindersRunNowBtn.addEventListener('click', async function(){
  if(!canManageIntegrations()) return;
  emailRemindersRunNowBtn.disabled = true;
  const originalHTML = emailRemindersRunNowBtn.innerHTML;
  emailRemindersRunNowBtn.textContent = 'Executando...';
  try{
    const summary = await apiRequest('/api/settings/email-reminders/run-now', { method:'POST' });
    await showSiteAlert(
      `Varredura concluída: ${summary.sent} enviado(s), ${summary.skipped} ignorado(s), ${summary.failed} com falha.`,
      { title:'Lembretes por e-mail', type:summary.failed ? 'warning' : 'success' }
    );
  }catch(error){
    await showSiteAlert(error.message || 'Falha ao executar a varredura de lembretes.', {
      title:'Não foi possível concluir', type:'danger'
    });
  }finally{
    emailRemindersRunNowBtn.disabled = false;
    emailRemindersRunNowBtn.innerHTML = originalHTML;
  }
});

calendarSyncForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageIntegrations()) return;
  calendarSyncError.textContent = '';
  const enabled = calendarSyncEnabledInput.checked;
  const confirmed = await showSiteConfirm(
    enabled
      ? 'Confirma ativar a criação automática de eventos no calendário do Outlook?'
      : 'Confirma desativar a sincronização com o calendário do Outlook?',
    { title:'Confirmar alteração', type:'warning', confirmText:'Salvar', cancelText:'Cancelar' }
  );
  if(!confirmed) return;
  try{
    await apiRequest('/api/settings/calendar-sync', { method:'PUT', body:{ enabled } });
    await loadCalendarSyncForm();
    await showSiteAlert('Configuração de sincronização com o calendário salva com sucesso.', {
      title:'Integração atualizada', type:'success'
    });
  }catch(error){
    calendarSyncError.textContent = error.message;
  }
});

calendarSyncTestBtn.addEventListener('click', async function(){
  if(!canManageIntegrations()) return;
  calendarSyncTestError.textContent = '';
  calendarSyncTestBtn.disabled = true;
  const originalHTML = calendarSyncTestBtn.innerHTML;
  calendarSyncTestBtn.textContent = 'Testando...';
  try{
    await apiRequest('/api/settings/calendar-sync/test', { method:'POST' });
    await showSiteAlert('Evento de teste criado e removido com sucesso no seu calendário do Outlook.', {
      title:'Sincronização validada', type:'success'
    });
  }catch(error){
    calendarSyncTestError.textContent = error.message;
  }finally{
    calendarSyncTestBtn.disabled = false;
    calendarSyncTestBtn.innerHTML = originalHTML;
  }
});
