/* Gestão — navegação do painel administrativo e regras de reserva */

/* =========================================================
   Navegação interna do painel administrativo
   ========================================================= */
const adminSectionTabs = document.getElementById('adminSectionTabs');

function renderAdminSection(section){
  if(!canAccessAdminSection(section)) return;
  if(section === 'reservas') renderAdminTab();
  if(section === 'frota') renderFleetManagement();
  if(section === 'veiculos') renderFleetManagement();
  if(section === 'bloqueios') renderBlocksManagement();
  if(section === 'auditoria') renderAuditLog();
  if(section === 'relatorios') renderReports();
  if(section === 'regras') renderReservationRules();
  if(section === 'usuarios') renderUserManagement();
}

if(adminSectionTabs){
  adminSectionTabs.addEventListener('click', function(e){
    const btn = e.target.closest('.admin-section-btn');
    if(!btn) return;
    const section = btn.getAttribute('data-admin-section');
    if(!canAccessAdminSection(section)) return;
    adminSectionTabs.querySelectorAll('.admin-section-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.admin-section-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.id !== 'admin-section-' + section);
    });
    renderAdminSection(section);
  });
}

/* =========================================================
   Regras de reserva
   ========================================================= */
const reservationRulesForm = document.getElementById('reservationRulesForm');
const ruleMaxConsecutiveDaysInput = document.getElementById('ruleMaxConsecutiveDays');
const ruleMaxAdvanceDaysInput = document.getElementById('ruleMaxAdvanceDays');
const ruleMaxReservationsInput = document.getElementById('ruleMaxReservations');
const ruleReservationBufferMinutesInput = document.getElementById('ruleReservationBufferMinutes');
const rulePickupAdvanceMinutesInput = document.getElementById('rulePickupAdvanceMinutes');
const rulesSummary = document.getElementById('rulesSummary');
const rulesError = document.getElementById('rulesError');

function renderReservationRules(){
  if(!canManageRules()) return;
  const rules = getReservationRules();
  ruleMaxConsecutiveDaysInput.value = rules.maxConsecutiveDays;
  ruleMaxAdvanceDaysInput.value = rules.maxAdvanceDays;
  ruleMaxReservationsInput.value = rules.maxReservationsInWindow;
  ruleReservationBufferMinutesInput.value = rules.reservationBufferMinutes;
  rulePickupAdvanceMinutesInput.value = rules.pickupAdvanceMinutes;
  rulesSummary.textContent =
    'Atualmente: até ' + rules.maxConsecutiveDays + ' dias seguidos, ' +
    rules.maxAdvanceDays + ' dias de antecedência e ' +
    rules.maxReservationsInWindow + ' reservas por usuário nesse período e ' +
    rules.reservationBufferMinutes + ' minutos livres entre reservas, com retirada liberada ' +
    rules.pickupAdvanceMinutes + ' minutos antes do horário.';
  rulesError.textContent = '';
}

reservationRulesForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageRules()) return;
  const maxConsecutiveDays = Number(ruleMaxConsecutiveDaysInput.value);
  const maxAdvanceDays = Number(ruleMaxAdvanceDaysInput.value);
  const maxReservationsInWindow = Number(ruleMaxReservationsInput.value);
  const reservationBufferMinutes = Number(ruleReservationBufferMinutesInput.value);
  const pickupAdvanceMinutes = Number(rulePickupAdvanceMinutesInput.value);
  if(!Number.isInteger(maxConsecutiveDays) || maxConsecutiveDays < 1 ||
     !Number.isInteger(maxAdvanceDays) || maxAdvanceDays < 1 ||
     !Number.isInteger(maxReservationsInWindow) || maxReservationsInWindow < 1 ||
     !Number.isInteger(reservationBufferMinutes) || reservationBufferMinutes < 0 || reservationBufferMinutes > 1440 ||
     !Number.isInteger(pickupAdvanceMinutes) || pickupAdvanceMinutes < 0 || pickupAdvanceMinutes > 1440){
    rulesError.textContent = 'Informe valores inteiros válidos. Os valores em minutos devem ficar entre 0 e 1440.';
    return;
  }
  rulesError.textContent = '';
  const currentRules = getReservationRules();
  const changes = [
    ['Dias consecutivos', Number(currentRules.maxConsecutiveDays), maxConsecutiveDays],
    ['Antecedência', Number(currentRules.maxAdvanceDays), maxAdvanceDays],
    ['Reservas por usuário', Number(currentRules.maxReservationsInWindow), maxReservationsInWindow],
    ['Intervalo entre reservas', Number(currentRules.reservationBufferMinutes), reservationBufferMinutes],
    ['Antecedência para retirada', Number(currentRules.pickupAdvanceMinutes), pickupAdvanceMinutes]
  ].filter(change => change[1] !== change[2]);
  if(!changes.length){
    await showSiteAlert('Nenhuma regra foi modificada.', {
      title:'Sem alterações',
      type:'info',
      confirmText:'Entendi'
    });
    return;
  }
  const confirmationMessage = 'Você alterou:\n' + changes.map(change =>
    '• ' + change[0] + ': ' + change[1] + ' → ' + change[2]
  ).join('\n') + '\n\nDeseja confirmar a alteração?';
  const confirmed = await showSiteConfirm(confirmationMessage, {
    title:'Confirmar alteração de regras',
    type:'warning',
    confirmText:'Alterar regras',
    cancelText:'Cancelar'
  });
  if(!confirmed){
    renderReservationRules();
    return;
  }

  const rules = saveReservationRules({
    maxConsecutiveDays,
    maxAdvanceDays,
    maxReservationsInWindow,
    reservationBufferMinutes,
    pickupAdvanceMinutes
  });
  try{
    if(rules.saved) await rules.saved;
  }catch(error){
    await hydrateDatabaseState();
    rulesError.textContent = error.message;
    renderReservationRules();
    return;
  }
  logAudit(
    'editou',
    'regras de reserva',
    'global',
    rules.maxConsecutiveDays + ' dias · ' + rules.maxAdvanceDays + ' dias de antecedência · ' +
    rules.maxReservationsInWindow + ' reservas · ' + rules.reservationBufferMinutes +
    ' minutos entre reservas · retirada ' + rules.pickupAdvanceMinutes + ' minutos antes'
  );
  renderReservationRules();
  refreshDatePickers();
  await showSiteAlert('As regras de reserva foram alteradas com sucesso.', {
    title:'Regras atualizadas',
    type:'success',
    confirmText:'Entendi'
  });
});

