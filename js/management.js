/* Gestão de frota, bloqueios, operação, auditoria e relatórios */

function operationPhotoFilename(photo, index, phaseLabel){
  const original = String(photo && photo.nome || '').trim();
  const fallbackExtension = String(photo && photo.tipo || '').includes('png') ? '.png' : '.jpg';
  const fallback = 'foto-' + String(phaseLabel || 'veiculo').toLowerCase() + '-' +
    (index + 1) + fallbackExtension;
  return (original || fallback)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function renderOperationPhoto(photo, index, phaseLabel){
  const dataUrl = String(photo && photo.dados || '');
  const protectedUrl = String(photo && photo.url || '');
  const source = dataUrl.startsWith('data:image/')
    ? dataUrl
    : (protectedUrl.startsWith('/api/reservations/') ? protectedUrl : '');
  if(!source) return '';
  const filename = operationPhotoFilename(photo, index, phaseLabel);
  const safeSource = escapeHTML(source);
  const downloadSource = escapeHTML(protectedUrl
    ? protectedUrl + (protectedUrl.includes('?') ? '&' : '?') + 'download=1'
    : source);
  const safeFilename = escapeHTML(filename);
  return '<div class="operation-photo-card">' +
    '<a class="operation-photo-preview" href="' + safeSource + '" target="_blank" rel="noopener" ' +
      'aria-label="Abrir ' + safeFilename + '">' +
      '<img src="' + safeSource + '" alt="' + safeFilename + '">' +
    '</a>' +
    '<a class="operation-photo-download" href="' + downloadSource + '" download="' + safeFilename + '">' +
      '&#8595; Baixar imagem' +
    '</a>' +
  '</div>';
}

function operationPhotoBlob(dataUrl){
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if(!match) return null;

  try{
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for(let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }catch(error){
    console.error('Nao foi possivel processar a foto.', error);
    return null;
  }
}

function downloadOperationPhoto(link){
  const blob = operationPhotoBlob(String(link.getAttribute('href') || ''));
  if(!blob) return false;

  try{
    const objectUrl = URL.createObjectURL(blob);
    const temporaryLink = document.createElement('a');
    temporaryLink.href = objectUrl;
    temporaryLink.download = link.getAttribute('download') || 'foto-veiculo.jpg';
    temporaryLink.hidden = true;
    document.body.appendChild(temporaryLink);
    temporaryLink.click();
    temporaryLink.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  }catch(error){
    console.error('Nao foi possivel baixar a foto.', error);
    return false;
  }
}

function openOperationPhoto(link){
  const blob = operationPhotoBlob(String(link.getAttribute('href') || ''));
  if(!blob) return false;
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  return true;
}

document.addEventListener('click', function(event){
  const downloadLink = event.target.closest('.operation-photo-download');
  if(downloadLink){
    if(!String(downloadLink.getAttribute('href') || '').startsWith('data:image/')) return;
    event.preventDefault();
    downloadOperationPhoto(downloadLink);
    return;
  }

  const previewLink = event.target.closest('.operation-photo-preview');
  if(previewLink){
    if(!String(previewLink.getAttribute('href') || '').startsWith('data:image/')) return;
    event.preventDefault();
    openOperationPhoto(previewLink);
  }
});

function renderOperationDetails(reserva){
  const operacao = reserva.operacao || {};
  const encerramento = reserva.encerramentoAdministrativo;
  if(!operacao.retirada && !operacao.devolucao && !encerramento) return '';
  const renderPhase = (label, data) => {
    if(!data) return '';
    const photos = Array.isArray(data.fotos) ? data.fotos : [];
    return '<div class="operation-record">' +
      '<strong>' + label + '</strong>' +
      '<span>Km ' + Number(data.quilometragem || 0).toLocaleString('pt-BR') + ' · Combustível: ' + escapeHTML(data.combustivel || '—') + '</span>' +
      (data.avarias ? '<span>Avarias/observações: ' + escapeHTML(data.avarias) + '</span>' : '') +
      '<span>Registrado por ' + escapeHTML(data.registradoPor || '—') + ' em ' + escapeHTML(formatDateTime(data.registradoEm)) + '</span>' +
      (photos.length ? '<div class="operation-photos">' +
        photos.map((photo, index) => renderOperationPhoto(photo, index, label)).join('') +
      '</div>' : '') +
    '</div>';
  };
  return '<details class="operation-details"><summary>Ver retirada e devolução</summary>' +
    renderPhase('Retirada', operacao.retirada) +
    renderPhase('Devolução', operacao.devolucao) +
    (encerramento ? '<div class="operation-record operation-record-administrative">' +
      '<strong>Encerramento administrativo</strong>' +
      '<span>Justificativa: ' + escapeHTML(encerramento.justificativa || '—') + '</span>' +
      '<span>Registrado por ' + escapeHTML(encerramento.registradoPor || '—') + ' em ' +
        escapeHTML(formatDateTime(encerramento.registradoEm)) + '</span>' +
    '</div>' : '') +
  '</details>';
}

function bindReservationFeatureButtons(container){
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openSelfEditReservation(this.getAttribute('data-id'));
    });
  });
  container.querySelectorAll('.operation-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(this.getAttribute('data-pickup-info') === 'true'){
        const reservationId = this.getAttribute('data-id');
        const reservation = getReservations().find(item => String(item.id) === String(reservationId));
        if(reservation && canRegisterPickupNow(reservation)){
          openOperationModal(reservationId, 'retirada');
        } else {
          openPickupAvailabilityModal(reservationId);
        }
        return;
      }
      openOperationModal(this.getAttribute('data-id'), this.getAttribute('data-phase'));
    });
  });
}

const pickupAvailabilityModal = document.getElementById('pickupAvailabilityModal');
const pickupAvailabilityDate = document.getElementById('pickupAvailabilityDate');
const pickupAvailabilitySummary = document.getElementById('pickupAvailabilitySummary');

function openPickupAvailabilityModal(reservationId){
  const reservation = getReservations().find(item => String(item.id) === String(reservationId));
  if(!reservation) return;
  pickupAvailabilityDate.textContent = formatPickupAvailableFrom(reservation);
  pickupAvailabilitySummary.textContent = reservation.partida + ' → ' + reservation.destino + ' · ' +
    getVehicleDisplayName(reservation);
  pickupAvailabilityModal.classList.remove('hidden');
}

function closePickupAvailabilityModal(){
  pickupAvailabilityModal.classList.add('hidden');
}

document.getElementById('pickupAvailabilityCloseBtn').addEventListener('click', closePickupAvailabilityModal);
document.getElementById('pickupAvailabilityOkBtn').addEventListener('click', closePickupAvailabilityModal);
pickupAvailabilityModal.addEventListener('click', event => {
  if(event.target === pickupAvailabilityModal) closePickupAvailabilityModal();
});

/* =========================================================
   Navegação interna do painel administrativo
   ========================================================= */
const adminSectionTabs = document.getElementById('adminSectionTabs');

function renderAdminSection(section){
  if(!canAccessAdminSection(section)) return;
  if(section === 'reservas') renderAdminTab();
  if(section === 'frota') renderFleetManagement();
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

/* =========================================================
   Usuários e permissões
   ========================================================= */
const userAccountForm = document.getElementById('userAccountForm');
const userAccountFormTitle = document.getElementById('userAccountFormTitle');
const userAccountNameInput = document.getElementById('userAccountName');
const userAccountUsernameInput = document.getElementById('userAccountUsername');
const userAccountPasswordInput = document.getElementById('userAccountPassword');
const userAccountPasswordHint = document.getElementById('userAccountPasswordHint');
const userAccountError = document.getElementById('userAccountError');
const userAccountSubmitBtn = document.getElementById('userAccountSubmitBtn');
const userAccountCancelBtn = document.getElementById('userAccountCancelBtn');
const userAccountsList = document.getElementById('userAccountsList');
const userDeleteModal = document.getElementById('userDeleteModal');
const userDeleteForm = document.getElementById('userDeleteForm');
const userDeleteSummary = document.getElementById('userDeleteSummary');
const userDeleteJustification = document.getElementById('userDeleteJustification');
const userDeleteError = document.getElementById('userDeleteError');
const userDeleteSubmitBtn = document.getElementById('userDeleteSubmitBtn');
const userPermissionInputs = {
  reservations:document.getElementById('permissionReservations'),
  fleet:document.getElementById('permissionFleet'),
  blocks:document.getElementById('permissionBlocks'),
  reports:document.getElementById('permissionReports'),
  audit:document.getElementById('permissionAudit'),
  rules:document.getElementById('permissionRules'),
  users:document.getElementById('permissionUsers')
};
let userAccountEditingId = null;
let userDeleteId = null;

const USER_PERMISSION_LABELS = {
  reservations:'Reservas',
  fleet:'Filiais e veículos',
  blocks:'Bloqueios',
  reports:'Relatórios',
  audit:'Auditoria',
  rules:'Regras',
  users:'Usuários'
};

function selectedUserPermissions(){
  const permissions = {};
  Object.keys(userPermissionInputs).forEach(key => {
    permissions[key] = userPermissionInputs[key].checked;
  });
  return permissions;
}

function resetUserAccountForm(){
  userAccountEditingId = null;
  userAccountForm.reset();
  userAccountUsernameInput.disabled = false;
  Object.values(userPermissionInputs).forEach(input => { input.disabled = false; });
  userAccountFormTitle.textContent = 'Novo usuário';
  userAccountPasswordHint.textContent = 'A senha é obrigatória no primeiro cadastro.';
  userAccountSubmitBtn.textContent = 'Criar usuário';
  userAccountCancelBtn.classList.add('hidden');
  userAccountError.textContent = '';
  if(typeof setFieldRequiredMarker === 'function') setFieldRequiredMarker('userAccountPassword', true);
}

function closeUserDeleteModal(){
  userDeleteModal.classList.add('hidden');
  userDeleteForm.reset();
  userDeleteError.textContent = '';
  userDeleteSubmitBtn.disabled = false;
  userDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  userDeleteId = null;
}

function openUserDeleteModal(userId){
  if(!canManageUsers()) return;
  const account = getSystemUsers().find(item => String(item.id) === String(userId));
  if(!account || account.role === 'admin') return;
  userDeleteId = account.id;
  userDeleteForm.reset();
  userDeleteError.textContent = '';
  userDeleteSummary.innerHTML =
    '<strong>' + escapeHTML(account.nome) + '</strong>' +
    '<small>@' + escapeHTML(account.username) + ' · ' +
      (account.active ? 'Ativo' : 'Inativo') + '</small>';
  userDeleteModal.classList.remove('hidden');
  userDeleteJustification.focus();
}

function permissionBadges(account){
  if(account.role === 'admin') return '<span>Acesso total</span>';
  const granted = Object.keys(USER_PERMISSION_LABELS).filter(key => account.permissions[key]);
  if(!granted.length) return '<span>Usuário comum</span>';
  return granted.map(key => '<span>' + escapeHTML(USER_PERMISSION_LABELS[key]) + '</span>').join('');
}

function renderUserManagement(){
  if(!canManageUsers()) return;
  ensureSystemUsers();
  const accounts = getSystemUsers().slice().sort((a,b) => {
    if(a.role === 'admin') return -1;
    if(b.role === 'admin') return 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  userAccountsList.innerHTML = accounts.length ? accounts.map(account =>
    '<div class="management-item' + (account.active ? '' : ' is-inactive') + '">' +
      '<div><strong>' + escapeHTML(account.nome) + '</strong>' +
        '<small>@' + escapeHTML(account.username) + ' · ' +
          '<span class="' + (account.active ? '' : 'user-status-inactive') + '">' + (account.active ? 'Ativo' : 'Inativo') + '</span></small>' +
        '<div class="user-permissions">' + permissionBadges(account) + '</div>' +
      '</div>' +
      '<div class="management-actions">' +
        (account.role !== 'admin' || isAdmin()
          ? '<button type="button" class="secondary-btn user-edit-btn" data-id="' + escapeHTML(account.id) + '">Editar</button>'
          : '') +
        (account.role !== 'admin'
          ? '<button type="button" class="secondary-btn user-toggle-btn" data-id="' + escapeHTML(account.id) + '">' +
              (account.active ? 'Desativar' : 'Ativar') + '</button>' +
            '<button type="button" class="delete-btn user-delete-btn" data-id="' + escapeHTML(account.id) + '">Excluir</button>'
          : '') +
      '</div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum usuário cadastrado.</div>';

  userAccountsList.querySelectorAll('.user-edit-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageUsers()) return;
      const account = getSystemUsers().find(item => String(item.id) === String(this.getAttribute('data-id')));
      if(!account || (account.role === 'admin' && !isAdmin())) return;
      userAccountEditingId = account.id;
      userAccountNameInput.value = account.nome;
      userAccountUsernameInput.value = account.username;
      userAccountUsernameInput.disabled = true;
      userAccountPasswordInput.value = '';
      Object.keys(userPermissionInputs).forEach(key => {
        userPermissionInputs[key].checked = account.role === 'admin' || account.permissions[key] === true;
        userPermissionInputs[key].disabled = account.role === 'admin';
      });
      userAccountFormTitle.textContent = 'Editar usuário';
      userAccountPasswordHint.textContent = 'Deixe a senha vazia para manter a atual.';
      if(typeof setFieldRequiredMarker === 'function') setFieldRequiredMarker('userAccountPassword', false);
      userAccountSubmitBtn.textContent = 'Salvar alterações';
      userAccountCancelBtn.classList.remove('hidden');
      userAccountError.textContent = '';
      userAccountNameInput.focus();
    });
  });

  userAccountsList.querySelectorAll('.user-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async function(){
      if(!canManageUsers()) return;
      const accounts = getSystemUsers();
      const account = accounts.find(item => String(item.id) === String(this.getAttribute('data-id')));
      if(!account || account.role === 'admin') return;
      try{
        const result = await apiRequest('/api/users/' + encodeURIComponent(account.id), {
          method:'PATCH',
          body:{
            nome:account.nome,
            active:!account.active,
            permissions:account.permissions
          }
        });
        const index = accounts.findIndex(item => String(item.id) === String(account.id));
        accounts[index] = normalizeSystemUser(result.user);
        saveSystemUsers(accounts);
        if(userAccountEditingId === account.id) resetUserAccountForm();
        renderUserManagement();
      }catch(error){
        userAccountError.textContent = error.message;
      }
    });
  });

  userAccountsList.querySelectorAll('.user-delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openUserDeleteModal(this.getAttribute('data-id'));
    });
  });
}

document.getElementById('userDeleteCloseBtn').addEventListener('click', closeUserDeleteModal);
document.getElementById('userDeleteCancelBtn').addEventListener('click', closeUserDeleteModal);
userDeleteModal.addEventListener('click', function(e){
  if(e.target === userDeleteModal) closeUserDeleteModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !userDeleteModal.classList.contains('hidden')){
    closeUserDeleteModal();
  }
});
userDeleteForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageUsers() || !userDeleteId) return;
  const justification = userDeleteJustification.value.trim();
  userDeleteError.textContent = '';
  if(justification.length < 5){
    userDeleteError.textContent = 'Informe uma justificativa com pelo menos 5 caracteres.';
    userDeleteJustification.focus();
    return;
  }
  userDeleteSubmitBtn.disabled = true;
  userDeleteSubmitBtn.textContent = 'Excluindo...';
  try{
    await apiRequest('/api/users/' + encodeURIComponent(userDeleteId), {
      method:'DELETE',
      body:{ justification }
    });
    await hydrateDatabaseState();
    if(String(userAccountEditingId) === String(userDeleteId)) resetUserAccountForm();
    closeUserDeleteModal();
    renderUserManagement();
  }catch(error){
    userDeleteError.textContent = error.message;
    userDeleteSubmitBtn.disabled = false;
    userDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  }
});

userAccountCancelBtn.addEventListener('click', resetUserAccountForm);

userAccountForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageUsers()) return;
  userAccountError.textContent = '';
  const nome = userAccountNameInput.value.trim();
  const username = userAccountUsernameInput.value.trim().toLowerCase();
  const password = userAccountPasswordInput.value.trim();
  const accounts = getSystemUsers();
  const editing = accounts.find(account => String(account.id) === String(userAccountEditingId));

  if(!nome){
    userAccountError.textContent = 'Informe o nome do usuário.';
    return;
  }
  if(!editing && !/^[a-z0-9._-]{3,40}$/.test(username)){
    userAccountError.textContent = 'Use de 3 a 40 caracteres no usuário: letras minúsculas, números, ponto, hífen ou sublinhado.';
    return;
  }
  if(!editing && accounts.some(account => account.username === username)){
    userAccountError.textContent = 'Já existe uma conta com esse usuário.';
    return;
  }
  if(!editing && password.length < 8){
    userAccountError.textContent = 'A senha deve ter pelo menos 8 caracteres.';
    return;
  }
  if(editing && password && password.length < 8){
    userAccountError.textContent = 'A nova senha deve ter pelo menos 8 caracteres.';
    return;
  }

  try{
    if(editing){
      const body = {
        nome:nome,
        permissions:editing.role === 'admin'
          ? editing.permissions
          : selectedUserPermissions()
      };
      if(password) body.password = password;
      const result = await apiRequest('/api/users/' + encodeURIComponent(editing.id), {
        method:'PATCH',
        body:body
      });
      const index = accounts.findIndex(account => String(account.id) === String(editing.id));
      accounts[index] = normalizeSystemUser(result.user);
      saveSystemUsers(accounts);
      const current = getCurrentUser();
      if(current && String(current.id) === String(editing.id)){
        const refreshed = accountToSession(result.user);
        setCurrentUser(refreshed);
        headerUserName.textContent = refreshed.nome;
        profileName.textContent = refreshed.nome;
        avatarInitials.textContent = initials(refreshed.nome);
        profileAvatarLg.textContent = initials(refreshed.nome);
        configureManagementPanel();
      }
    } else {
      const result = await apiRequest('/api/users', {
        method:'POST',
        body:{
          username:username,
          nome:nome,
          password:password,
          permissions:selectedUserPermissions()
        }
      });
      accounts.push(normalizeSystemUser(result.user));
      saveSystemUsers(accounts);
    }
    resetUserAccountForm();
    renderUserManagement();
  }catch(error){
    userAccountError.textContent = error.message;
  }
});

/* =========================================================
   Filiais e veículos
   ========================================================= */
const branchForm = document.getElementById('branchForm');
const branchNameInput = document.getElementById('branchName');
const branchesList = document.getElementById('branchesList');
const vehicleForm = document.getElementById('vehicleForm');
const vehicleBranchSelect = document.getElementById('vehicleBranch');
const vehiclePlateInput = document.getElementById('vehiclePlate');
const vehicleBrandInput = document.getElementById('vehicleBrand');
const vehicleModelInput = document.getElementById('vehicleModel');
const vehicleCapacityInput = document.getElementById('vehicleCapacity');
const vehiclesList = document.getElementById('vehiclesList');
const fleetEditModal = document.getElementById('fleetEditModal');
const fleetEditForm = document.getElementById('fleetEditForm');
const fleetEditTitle = document.getElementById('fleetEditTitle');
const fleetEditSubtitle = document.getElementById('fleetEditSubtitle');
const fleetEditBranchFields = document.getElementById('fleetEditBranchFields');
const fleetEditVehicleFields = document.getElementById('fleetEditVehicleFields');
const fleetEditBranchNameInput = document.getElementById('fleetEditBranchName');
const fleetEditVehicleBranchSelect = document.getElementById('fleetEditVehicleBranch');
const fleetEditVehiclePlateInput = document.getElementById('fleetEditVehiclePlate');
const fleetEditVehicleBrandInput = document.getElementById('fleetEditVehicleBrand');
const fleetEditVehicleModelInput = document.getElementById('fleetEditVehicleModel');
const fleetEditVehicleCapacityInput = document.getElementById('fleetEditVehicleCapacity');
const fleetEditError = document.getElementById('fleetEditError');
const vehicleDeleteModal = document.getElementById('vehicleDeleteModal');
const vehicleDeleteForm = document.getElementById('vehicleDeleteForm');
const vehicleDeleteSummary = document.getElementById('vehicleDeleteSummary');
const vehicleDeleteJustification = document.getElementById('vehicleDeleteJustification');
const vehicleDeleteError = document.getElementById('vehicleDeleteError');
const vehicleDeleteSubmitBtn = document.getElementById('vehicleDeleteSubmitBtn');
const branchDeleteModal = document.getElementById('branchDeleteModal');
const branchDeleteForm = document.getElementById('branchDeleteForm');
const branchDeleteSummary = document.getElementById('branchDeleteSummary');
const branchDeleteJustification = document.getElementById('branchDeleteJustification');
const branchDeleteError = document.getElementById('branchDeleteError');
const branchDeleteSubmitBtn = document.getElementById('branchDeleteSubmitBtn');
let fleetEditType = null;
let fleetEditId = null;
let vehicleDeleteId = null;
let branchDeleteId = null;

function closeFleetEditModal(){
  fleetEditModal.classList.add('hidden');
  fleetEditForm.reset();
  fleetEditError.textContent = '';
  fleetEditType = null;
  fleetEditId = null;
}

function openBranchEditModal(branchId){
  if(!canManageFleet()) return;
  const branch = getBranches().find(item => String(item.id) === String(branchId));
  if(!branch) return;
  fleetEditType = 'branch';
  fleetEditId = branch.id;
  fleetEditForm.reset();
  fleetEditTitle.textContent = 'Editar filial';
  fleetEditSubtitle.textContent = 'A alteração será aplicada aos veículos, bloqueios e reservas vinculados.';
  fleetEditBranchFields.classList.remove('hidden');
  fleetEditVehicleFields.classList.add('hidden');
  fleetEditBranchNameInput.value = branch.nome;
  fleetEditError.textContent = '';
  fleetEditModal.classList.remove('hidden');
  fleetEditBranchNameInput.focus();
}

function openVehicleEditModal(vehicleId){
  if(!canManageFleet()) return;
  const vehicle = getVehicles().find(item => String(item.id) === String(vehicleId));
  if(!vehicle) return;
  fleetEditType = 'vehicle';
  fleetEditId = vehicle.id;
  fleetEditForm.reset();
  fleetEditTitle.textContent = 'Editar veículo';
  fleetEditSubtitle.textContent = 'Atualize a filial, a placa, a marca, o modelo e a capacidade do veículo.';
  fleetEditBranchFields.classList.add('hidden');
  fleetEditVehicleFields.classList.remove('hidden');
  fleetEditVehicleBranchSelect.innerHTML = getBranches().map(branch =>
    '<option value="' + escapeHTML(branch.nome) + '">' + escapeHTML(branch.nome) +
      (branch.ativo === false ? ' (inativa)' : '') + '</option>'
  ).join('');
  fleetEditVehicleBranchSelect.value = vehicle.filial;
  fleetEditVehiclePlateInput.value = vehicle.placa || '';
  fleetEditVehicleBrandInput.value = getVehicleBrand(vehicle);
  fleetEditVehicleModelInput.value = getVehicleModelName(vehicle);
  fleetEditVehicleCapacityInput.value = vehicle.capacidade || CAPACIDADE_MAXIMA;
  fleetEditError.textContent = '';
  fleetEditModal.classList.remove('hidden');
  fleetEditVehiclePlateInput.focus();
}

function closeVehicleDeleteModal(){
  vehicleDeleteModal.classList.add('hidden');
  vehicleDeleteForm.reset();
  vehicleDeleteError.textContent = '';
  vehicleDeleteSubmitBtn.disabled = false;
  vehicleDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  vehicleDeleteId = null;
}

function openVehicleDeleteModal(vehicleId){
  if(!canManageFleet()) return;
  const vehicle = getVehicles().find(item => String(item.id) === String(vehicleId));
  if(!vehicle) return;
  vehicleDeleteId = vehicle.id;
  vehicleDeleteForm.reset();
  vehicleDeleteError.textContent = '';
  vehicleDeleteSummary.innerHTML =
    '<strong>' + escapeHTML(getVehicleFullModel(vehicle)) +
      (vehicle.placa ? ' · ' + escapeHTML(vehicle.placa) : '') + '</strong>' +
    '<small>' + escapeHTML(vehicle.filial) + '</small>';
  vehicleDeleteModal.classList.remove('hidden');
  vehicleDeleteJustification.focus();
}

function closeBranchDeleteModal(){
  branchDeleteModal.classList.add('hidden');
  branchDeleteForm.reset();
  branchDeleteError.textContent = '';
  branchDeleteSubmitBtn.disabled = false;
  branchDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  branchDeleteId = null;
}

function openBranchDeleteModal(branchId){
  if(!canManageFleet()) return;
  const branch = getBranches().find(item => String(item.id) === String(branchId));
  if(!branch) return;
  branchDeleteId = branch.id;
  branchDeleteForm.reset();
  branchDeleteError.textContent = '';
  const linkedVehicles = getVehicles().filter(vehicle => vehicle.filial === branch.nome).length;
  branchDeleteSummary.innerHTML = '<strong>' + escapeHTML(branch.nome) + '</strong>' +
    '<small>' + linkedVehicles + (linkedVehicles === 1 ? ' veículo vinculado' : ' veículos vinculados') + '</small>';
  branchDeleteModal.classList.remove('hidden');
  branchDeleteJustification.focus();
}

document.getElementById('fleetEditCloseBtn').addEventListener('click', closeFleetEditModal);
document.getElementById('fleetEditCancelBtn').addEventListener('click', closeFleetEditModal);
fleetEditModal.addEventListener('click', function(e){
  if(e.target === fleetEditModal) closeFleetEditModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !fleetEditModal.classList.contains('hidden')) closeFleetEditModal();
});
fleetEditVehiclePlateInput.addEventListener('input', function(){
  this.value = this.value.toUpperCase();
});
document.getElementById('branchDeleteCloseBtn').addEventListener('click', closeBranchDeleteModal);
document.getElementById('branchDeleteCancelBtn').addEventListener('click', closeBranchDeleteModal);
branchDeleteModal.addEventListener('click', function(e){
  if(e.target === branchDeleteModal) closeBranchDeleteModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !branchDeleteModal.classList.contains('hidden')){
    closeBranchDeleteModal();
  }
});

branchDeleteForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageFleet() || !branchDeleteId) return;
  const justification = branchDeleteJustification.value.trim();
  branchDeleteError.textContent = '';
  if(justification.length < 5){
    branchDeleteError.textContent = 'Informe uma justificativa com pelo menos 5 caracteres.';
    branchDeleteJustification.focus();
    return;
  }
  branchDeleteSubmitBtn.disabled = true;
  branchDeleteSubmitBtn.textContent = 'Excluindo...';
  try{
    await deleteBranchPermanently(branchDeleteId, justification);
    await hydrateDatabaseState();
    closeBranchDeleteModal();
    renderFleetManagement();
    renderCarSelector();
    renderMainCalendar();
    renderMyReservations();
    renderAvailableRides();
    renderBlocksManagement();
    refreshDatePickers();
  }catch(error){
    if(error.code === 'STATE_CONFLICT') await hydrateDatabaseState();
    branchDeleteError.textContent = error.message;
    branchDeleteSubmitBtn.disabled = false;
    branchDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  }
});
vehiclePlateInput.addEventListener('input', function(){
  this.value = this.value.toUpperCase();
});
document.getElementById('vehicleDeleteCloseBtn').addEventListener('click', closeVehicleDeleteModal);
document.getElementById('vehicleDeleteCancelBtn').addEventListener('click', closeVehicleDeleteModal);
vehicleDeleteModal.addEventListener('click', function(e){
  if(e.target === vehicleDeleteModal) closeVehicleDeleteModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !vehicleDeleteModal.classList.contains('hidden')){
    closeVehicleDeleteModal();
  }
});

vehicleDeleteForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageFleet() || !vehicleDeleteId) return;
  const justification = vehicleDeleteJustification.value.trim();
  vehicleDeleteError.textContent = '';
  if(justification.length < 5){
    vehicleDeleteError.textContent = 'Informe uma justificativa com pelo menos 5 caracteres.';
    vehicleDeleteJustification.focus();
    return;
  }
  vehicleDeleteSubmitBtn.disabled = true;
  vehicleDeleteSubmitBtn.textContent = 'Excluindo...';
  try{
    await deleteVehiclePermanently(vehicleDeleteId, justification);
    await hydrateDatabaseState();
    closeVehicleDeleteModal();
    renderFleetManagement();
    renderCarSelector();
    renderMainCalendar();
    renderMyReservations();
    renderAvailableRides();
    renderBlocksManagement();
    refreshDatePickers();
  }catch(error){
    if(error.code === 'STATE_CONFLICT') await hydrateDatabaseState();
    vehicleDeleteError.textContent = error.message;
    vehicleDeleteSubmitBtn.disabled = false;
    vehicleDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  }
});

fleetEditForm.addEventListener('submit', function(e){
  e.preventDefault();
  if(!canManageFleet() || !fleetEditType || !fleetEditId) return;
  fleetEditError.textContent = '';

  if(fleetEditType === 'branch'){
    const list = getBranches();
    const branch = list.find(item => String(item.id) === String(fleetEditId));
    const newName = fleetEditBranchNameInput.value.trim();
    if(!branch || !newName){
      fleetEditError.textContent = 'Informe o nome da filial.';
      return;
    }
    if(list.some(item => item.id !== branch.id && item.nome.toLowerCase() === newName.toLowerCase())){
      fleetEditError.textContent = 'Já existe uma filial com esse nome.';
      return;
    }
    const oldName = branch.nome;
    if(newName === oldName){
      closeFleetEditModal();
      return;
    }
    branch.nome = newName;
    saveBranches(list);
    const vehiclesUpdated = getVehicles();
    vehiclesUpdated.forEach(vehicle => { if(vehicle.filial === oldName) vehicle.filial = newName; });
    saveVehicles(vehiclesUpdated);
    const blocksUpdated = getVehicleBlocks();
    blocksUpdated.forEach(block => { if(block.filial === oldName) block.filial = newName; });
    saveVehicleBlocks(blocksUpdated);
    const reservationsUpdated = getReservations();
    reservationsUpdated.forEach(reservation => {
      if(reservation.partida === oldName) reservation.partida = newName;
      if(reservation.destino === oldName) reservation.destino = newName;
    });
    saveReservations(reservationsUpdated);
    logAudit('editou', 'filial', branch.id, oldName + ' → ' + newName);
  } else {
    const list = getVehicles();
    const vehicle = list.find(item => String(item.id) === String(fleetEditId));
    const filial = fleetEditVehicleBranchSelect.value;
    const marca = fleetEditVehicleBrandInput.value.trim();
    const modelo = fleetEditVehicleModelInput.value.trim();
    const placa = fleetEditVehiclePlateInput.value.trim().toUpperCase();
    const capacidade = Number(fleetEditVehicleCapacityInput.value);
    if(!vehicle || !filial || !placa || !marca || !modelo || !Number.isInteger(capacidade) || capacidade < 1 || capacidade > 20){
      fleetEditError.textContent = 'Preencha filial, placa, marca, modelo e uma capacidade entre 1 e 20.';
      return;
    }
    if(list.some(item =>
      item.id !== vehicle.id && String(item.placa || '').toUpperCase() === placa
    )){
      fleetEditError.textContent = 'Já existe um veículo com essa placa.';
      return;
    }
    const oldFilial = vehicle.filial;
    const oldCode = String(vehicle.codigo);
    vehicle.filial = filial;
    vehicle.marca = marca;
    vehicle.modelo = modelo;
    vehicle.placa = placa;
    vehicle.capacidade = capacidade;
    saveVehicles(list);
    if(oldFilial !== filial){
      const blocksUpdated = getVehicleBlocks();
      blocksUpdated.forEach(block => {
        if(block.filial === oldFilial && String(block.carro) === oldCode){
          block.filial = filial;
        }
      });
      saveVehicleBlocks(blocksUpdated);
      const reservationsUpdated = getReservations();
      reservationsUpdated.forEach(reservation => {
        if(reservation.partida === oldFilial && String(reservation.carro) === oldCode){
          reservation.partida = filial;
        }
      });
      saveReservations(reservationsUpdated);
    }
    logAudit('editou', 'veículo', vehicle.id,
      oldFilial + ' → ' + filial + ' · ' + marca + ' ' + modelo + ' · ' + placa);
  }

  closeFleetEditModal();
  renderFleetManagement();
  renderCarSelector();
  renderMainCalendar();
  renderMyReservations();
  renderAvailableRides();
  refreshDatePickers();
});

function refreshBranchSelectors(){
  syncFleetGlobals();
  const branches = getBranches().filter(f => f.ativo !== false);
  const options = branches.map(f => '<option value="' + escapeHTML(f.nome) + '">' + escapeHTML(f.nome) + '</option>').join('');

  [vehicleBranchSelect].forEach(select => {
    if(!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecione...</option>' + options;
    if(branches.some(f => f.nome === current)) select.value = current;
  });

  [
    { el: document.getElementById('partida'), first: '<option value="">Selecione...</option>' },
    { el: document.getElementById('aPartida'), first: '<option value="">Selecione...</option>' },
    { el: document.getElementById('adminFiltroFilial'), first: '<option value="">Todas</option>' },
    { el: document.getElementById('reportBranch'), first: '<option value="">Todas</option>' }
  ].forEach(item => {
    if(!item.el) return;
    const current = item.el.value;
    item.el.innerHTML = item.first + options;
    if(branches.some(f => f.nome === current)) item.el.value = current;
  });

  if(typeof populateDestinoOptions === 'function') populateDestinoOptions();
  if(typeof populateAdminDestinoOptions === 'function') populateAdminDestinoOptions();
  if(typeof populateAdminFilters === 'function') populateAdminFilters();
  populateManagementVehicleSelectors();
}

function populateManagementVehicleSelectors(){
  const vehicles = getVehicles().filter(v => v.ativo !== false);
  const vehicleOptions = vehicles.map(v =>
    '<option value="' + escapeHTML(v.filial + '|' + v.codigo) + '">' +
      escapeHTML(v.filial + ' · ' + getVehicleFullModel(v) + (v.placa ? ' · ' + v.placa : '')) +
    '</option>'
  ).join('');
  const blockVehicle = document.getElementById('blockVehicle');
  if(blockVehicle){
    const current = blockVehicle.value;
    blockVehicle.innerHTML = '<option value="">Selecione...</option>' + vehicleOptions;
    blockVehicle.value = current;
  }

  const reportVehicle = document.getElementById('reportVehicle');
  if(reportVehicle){
    const current = reportVehicle.value;
    reportVehicle.innerHTML = '<option value="">Todos</option>' + vehicleOptions;
    reportVehicle.value = current;
  }
}

function renderFleetManagement(){
  if(!canManageFleet()) return;
  refreshBranchSelectors();
  const branches = getBranches();
  branchesList.innerHTML = branches.length ? branches.map(branch =>
    '<div class="management-item' + (branch.ativo === false ? ' is-inactive' : '') + '">' +
      '<div><strong>' + escapeHTML(branch.nome) + '</strong><small>' + (branch.ativo === false ? 'Inativa' : 'Ativa') + '</small></div>' +
      '<div class="management-actions"><button type="button" class="secondary-btn branch-edit-btn" data-id="' + escapeHTML(branch.id) + '">Editar</button>' +
      '<button type="button" class="secondary-btn branch-toggle-btn" data-id="' + escapeHTML(branch.id) + '">' + (branch.ativo === false ? 'Ativar' : 'Desativar') + '</button>' +
      '<button type="button" class="delete-btn branch-delete-btn" data-id="' + escapeHTML(branch.id) + '">Excluir</button></div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhuma filial cadastrada.</div>';

  const vehicles = getVehicles();
  vehiclesList.innerHTML = vehicles.length ? vehicles.map(vehicle =>
    '<div class="management-item' + (vehicle.ativo === false ? ' is-inactive' : '') + '">' +
      '<div><strong>' + escapeHTML(getVehicleFullModel(vehicle)) +
        (vehicle.placa ? ' · ' + escapeHTML(vehicle.placa) : '') + '</strong>' +
      '<small>' + escapeHTML(vehicle.filial) + ' · ' + Number(vehicle.capacidade || CAPACIDADE_MAXIMA) + ' lugares · ' + (vehicle.ativo === false ? 'Inativo' : 'Ativo') + '</small></div>' +
      '<div class="management-actions"><button type="button" class="secondary-btn vehicle-edit-btn" data-id="' + escapeHTML(vehicle.id) + '">Editar</button>' +
      '<button type="button" class="secondary-btn vehicle-toggle-btn" data-id="' + escapeHTML(vehicle.id) + '">' + (vehicle.ativo === false ? 'Ativar' : 'Desativar') + '</button>' +
      '<button type="button" class="delete-btn vehicle-delete-btn" data-id="' + escapeHTML(vehicle.id) + '">Excluir</button></div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum veículo cadastrado.</div>';

  branchesList.querySelectorAll('.branch-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageFleet()) return;
      const list = getBranches();
      const branch = list.find(f => String(f.id) === String(this.getAttribute('data-id')));
      if(!branch) return;
      branch.ativo = branch.ativo === false;
      saveBranches(list);
      logAudit(branch.ativo ? 'ativou' : 'desativou', 'filial', branch.id, branch.nome);
      renderFleetManagement();
    });
  });

  branchesList.querySelectorAll('.branch-edit-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openBranchEditModal(this.getAttribute('data-id'));
    });
  });

  branchesList.querySelectorAll('.branch-delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openBranchDeleteModal(this.getAttribute('data-id'));
    });
  });

  vehiclesList.querySelectorAll('.vehicle-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageFleet()) return;
      const list = getVehicles();
      const vehicle = list.find(v => String(v.id) === String(this.getAttribute('data-id')));
      if(!vehicle) return;
      vehicle.ativo = vehicle.ativo === false;
      saveVehicles(list);
      logAudit(vehicle.ativo ? 'ativou' : 'desativou', 'veículo', vehicle.id,
        vehicle.filial + ' · ' + getVehicleFullModel(vehicle) +
        (vehicle.placa ? ' · ' + vehicle.placa : ''));
      renderFleetManagement();
      renderCarSelector();
      renderMainCalendar();
    });
  });

  vehiclesList.querySelectorAll('.vehicle-edit-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openVehicleEditModal(this.getAttribute('data-id'));
    });
  });

  vehiclesList.querySelectorAll('.vehicle-delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openVehicleDeleteModal(this.getAttribute('data-id'));
    });
  });
}

if(branchForm){
  branchForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageFleet()) return;
    const nome = branchNameInput.value.trim();
    if(!nome) return;
    const list = getBranches();
    if(list.some(f => f.nome.toLowerCase() === nome.toLowerCase())){
      await showSiteAlert('Já existe uma filial com esse nome.', {
        title:'Filial não cadastrada',
        type:'warning'
      });
      return;
    }
    const branch = { id: 'filial-' + Date.now(), nome: nome, ativo: true };
    list.push(branch);
    try{
      await saveBranches(list);
    }catch(error){
      await hydrateDatabaseState();
      await showSiteAlert(error.message, {
        title:'Não foi possível cadastrar a filial',
        type:'danger'
      });
      renderFleetManagement();
      return;
    }
    logAudit('cadastrou', 'filial', branch.id, nome);
    branchForm.reset();
    renderFleetManagement();
  });
}

if(vehicleForm){
  vehicleForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageFleet()) return;
    const filial = vehicleBranchSelect.value;
    const placa = vehiclePlateInput.value.trim().toUpperCase();
    const marca = vehicleBrandInput.value.trim();
    const modelo = vehicleModelInput.value.trim();
    const capacidade = Number(vehicleCapacityInput.value);
    if(!filial || !placa || !marca || !modelo || !Number.isFinite(capacidade) || capacidade < 1){
      await showSiteAlert('Preencha filial, placa, marca, modelo e capacidade.', {
        title:'Revise os dados do veículo',
        type:'warning'
      });
      return;
    }
    const list = getVehicles();
    if(list.some(v => String(v.placa || '').toUpperCase() === placa)){
      await showSiteAlert('Já existe um veículo com essa placa.', {
        title:'Veículo não cadastrado',
        type:'warning'
      });
      return;
    }
    const vehicle = {
      id: 'veiculo-' + Date.now(),
      filial: filial,
      codigo: placa,
      placa: placa,
      marca: marca,
      modelo: modelo,
      capacidade: capacidade,
      ativo: true
    };
    list.push(vehicle);
    try{
      await saveVehicles(list);
    }catch(error){
      await hydrateDatabaseState();
      await showSiteAlert(error.message, {
        title:'Não foi possível cadastrar o veículo',
        type:'danger'
      });
      renderFleetManagement();
      return;
    }
    logAudit('cadastrou', 'veículo', vehicle.id,
      filial + ' · ' + vehicle.marca + ' ' + vehicle.modelo + ' · ' + placa);
    vehicleForm.reset();
    vehicleCapacityInput.value = '5';
    renderFleetManagement();
    renderCarSelector();
    renderMainCalendar();
  });
}

/* =========================================================
   Bloqueios da frota
   ========================================================= */
const blockForm = document.getElementById('blockForm');
const blocksList = document.getElementById('blocksList');

function renderBlocksManagement(){
  if(!canManageBlocks()) return;
  populateManagementVehicleSelectors();
  const blocks = getVehicleBlocks().slice().sort((a,b) => a.dataInicio.localeCompare(b.dataInicio));
  blocksList.innerHTML = blocks.length ? blocks.map(block =>
    '<div class="management-item block-item">' +
      '<div><strong>' + escapeHTML(block.tipo) + ' · ' + escapeHTML(block.filial) + ' · ' +
        escapeHTML(getVehicleDisplayName({ partida:block.filial, carro:block.carro })) + '</strong>' +
      '<small>' + formatDate(block.dataInicio) + ' até ' + formatDate(block.dataFim) + (block.observacoes ? ' · ' + escapeHTML(block.observacoes) : '') + '</small></div>' +
      '<button type="button" class="delete-btn block-delete-btn" data-id="' + escapeHTML(block.id) + '">Remover</button>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum bloqueio cadastrado.</div>';

  blocksList.querySelectorAll('.block-delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageBlocks()) return;
      const id = this.getAttribute('data-id');
      const old = getVehicleBlocks().find(b => String(b.id) === String(id));
      saveVehicleBlocks(getVehicleBlocks().filter(b => String(b.id) !== String(id)));
      logAudit('removeu', 'bloqueio', id, old ? old.tipo + ' · ' + old.filial + ' · ' + old.carro : '');
      renderBlocksManagement();
      refreshDatePickers();
    });
  });
}

if(blockForm){
  blockForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageBlocks()) return;
    const key = document.getElementById('blockVehicle').value;
    const dataInicio = document.getElementById('blockStart').value;
    const dataFim = document.getElementById('blockEnd').value;
    if(!key || !dataInicio || !dataFim || dataFim < dataInicio){
      await showSiteAlert('Selecione o veículo e informe um período válido.', {
        title:'Revise os dados do bloqueio',
        type:'warning'
      });
      return;
    }
    const splitAt = key.lastIndexOf('|');
    const block = {
      id: 'bloqueio-' + Date.now(),
      filial: key.slice(0, splitAt),
      carro: key.slice(splitAt + 1),
      tipo: document.getElementById('blockType').value,
      dataInicio: dataInicio,
      dataFim: dataFim,
      observacoes: document.getElementById('blockNotes').value.trim(),
      criadoEm: new Date().toISOString()
    };
    const reservations = getReservations().filter(r =>
      !isReservationCompleted(r) &&
      r.partida === block.filial && String(r.carro) === String(block.carro) &&
      !(r.dataVolta < dataInicio || r.dataIda > dataFim)
    );
    if(reservations.length && !await showSiteConfirm(
      (reservations.length === 1
        ? 'Existe 1 reserva no período.'
        : 'Existem ' + reservations.length + ' reservas no período.') +
      ' Deseja criar o bloqueio mesmo assim?',
      {
        title:'Reservas no período',
        confirmText:'Criar bloqueio',
        type:'warning'
      }
    )) return;
    const list = getVehicleBlocks();
    list.push(block);
    try{
      await saveVehicleBlocks(list);
    }catch(error){
      await hydrateDatabaseState();
      await showSiteAlert(error.message, {
        title:'Não foi possível criar o bloqueio',
        type:'danger'
      });
      renderBlocksManagement();
      return;
    }
    logAudit('bloqueou', 'veículo', block.id, block.tipo + ' · ' + block.filial + ' · ' + block.carro);
    blockForm.reset();
    renderBlocksManagement();
    refreshDatePickers();
  });
}

/* =========================================================
   Retirada e devolução
   ========================================================= */
const operationModal = document.getElementById('operationModal');
const operationForm = document.getElementById('operationForm');
const operationTitle = document.getElementById('operationTitle');
const operationSummary = document.getElementById('operationSummary');
const operationError = document.getElementById('operationError');
let operationReservationId = null;
let operationPhase = null;

async function openOperationModal(reservationId, phase){
  const reserva = getReservations().find(r => String(r.id) === String(reservationId));
  const currentUser = getCurrentUser();
  if(!reserva || !currentUser || (reserva.nome !== currentUser.nome && !isAdmin())) return;
  const operacao = reserva.operacao || {};
  if((phase === 'retirada' && operacao.retirada) || (phase === 'devolucao' && (!operacao.retirada || operacao.devolucao))) return;
  if(phase === 'retirada' && !canRegisterPickupNow(reserva)){
    await showSiteAlert(
      'A retirada só pode ser registrada a partir de ' +
      formatPickupAvailableFrom(reserva) + '.',
      {
        title:'Retirada ainda indisponível',
        type:'info'
      }
    );
    return;
  }
  operationReservationId = reservationId;
  operationPhase = phase;
  operationForm.reset();
  operationError.textContent = '';
  document.getElementById('operationPhotoHint').textContent = '';
  operationTitle.textContent = phase === 'retirada' ? 'Registrar retirada' : 'Registrar devolução';
  operationSummary.textContent = reserva.partida + ' → ' + reserva.destino + ' · ' +
    getVehicleDisplayName(reserva) + ' · ' + formatDate(reserva.dataIda);
  if(phase === 'devolucao' && operacao.retirada){
    document.getElementById('operationKm').min = String(operacao.retirada.quilometragem || 0);
  } else {
    document.getElementById('operationKm').min = '0';
  }
  operationModal.classList.remove('hidden');
}

function closeOperationModal(){
  operationModal.classList.add('hidden');
  operationReservationId = null;
  operationPhase = null;
}

document.getElementById('operationCloseBtn').addEventListener('click', closeOperationModal);
operationModal.addEventListener('click', e => {
  if(e.target === operationModal) closeOperationModal();
});

document.getElementById('operationPhotos').addEventListener('change', function(){
  const count = Math.min(this.files.length, 3);
  document.getElementById('operationPhotoHint').textContent = count
    ? count + (count === 1 ? ' foto selecionada.' : ' fotos selecionadas.')
    : '';
});

function filesToDataUrls(files){
  const selected = Array.from(files || []).slice(0, 3);
  return Promise.all(selected.map(file => new Promise((resolve, reject) => {
    if(file.size > 1024 * 1024){
      reject(new Error('Cada foto deve ter no máximo 1 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ nome: file.name, tipo: file.type, dados: reader.result });
    reader.onerror = () => reject(new Error('Não foi possível ler uma das fotos.'));
    reader.readAsDataURL(file);
  })));
}

operationForm.addEventListener('submit', async function(e){
  e.preventDefault();
  const list = getReservations();
  const idx = list.findIndex(r => String(r.id) === String(operationReservationId));
  if(idx === -1) return;
  const reserva = list[idx];
  if(operationPhase === 'retirada' && !canRegisterPickupNow(reserva)){
    operationError.textContent =
      'A retirada só pode ser registrada a partir de ' +
      formatPickupAvailableFrom(reserva) + '.';
    return;
  }
  const km = Number(document.getElementById('operationKm').value);
  const fuel = document.getElementById('operationFuel').value;
  if(!Number.isFinite(km) || km < 0 || !fuel){
    operationError.textContent = 'Informe quilometragem e combustível.';
    return;
  }
  if(operationPhase === 'devolucao' && reserva.operacao && reserva.operacao.retirada && km < Number(reserva.operacao.retirada.quilometragem || 0)){
    operationError.textContent = 'A quilometragem final não pode ser menor que a inicial.';
    return;
  }
  try{
    const photos = await filesToDataUrls(document.getElementById('operationPhotos').files);
    reserva.operacao = reserva.operacao || {};
    reserva.operacao[operationPhase] = {
      quilometragem: km,
      combustivel: fuel,
      avarias: document.getElementById('operationDamages').value.trim(),
      fotos: photos,
      registradoPor: getCurrentUser().nome,
      registradoEm: new Date().toISOString()
    };
    reserva.status = operationPhase === 'retirada' ? 'em uso' : 'concluída';
    list[idx] = reserva;
    await saveReservations(list);
    logAudit(operationPhase === 'retirada' ? 'retirou' : 'devolveu', 'reserva', reserva.id, reserva.partida + ' · ' + reserva.carro + ' · km ' + km);
    closeOperationModal();
    renderMyReservations();
    if(canManageReservations()) renderAdminTab();
  }catch(error){
    operationError.textContent = error.message;
  }
});

/* =========================================================
   Auditoria
   ========================================================= */
const auditList = document.getElementById('auditList');
const auditUserFilter = document.getElementById('auditUserFilter');
const auditActionFilter = document.getElementById('auditActionFilter');

function formatDateTime(iso){
  if(!iso) return '';
  const date = new Date(iso);
  return date.toLocaleString('pt-BR');
}

function renderAuditLog(){
  if(!canViewAudit()) return;
  const userFilter = auditUserFilter.value.trim().toLowerCase();
  const actionFilter = auditActionFilter.value;
  const list = getAuditLog().filter(entry => {
    if(userFilter && !String(entry.user).toLowerCase().includes(userFilter)) return false;
    if(actionFilter && entry.action !== actionFilter) return false;
    return true;
  });
  auditList.innerHTML = list.length ? list.slice(0, 500).map(entry =>
    '<div class="audit-entry">' +
      '<div class="audit-marker"></div>' +
      '<div><strong>' + escapeHTML(entry.user) + ' ' + escapeHTML(entry.action) + ' ' + escapeHTML(entry.entity) + '</strong>' +
      '<small>' + escapeHTML(formatDateTime(entry.timestamp)) + ' · ' + escapeHTML(entry.details || '') + '</small></div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum evento encontrado.</div>';
}

[auditUserFilter, auditActionFilter].forEach(el => {
  el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderAuditLog);
});

/* =========================================================
   Relatórios e CSV
   ========================================================= */
const reportInputs = [
  document.getElementById('reportBranch'),
  document.getElementById('reportVehicle'),
  document.getElementById('reportUser'),
  document.getElementById('reportStart'),
  document.getElementById('reportEnd')
];

function getFilteredReportReservations(){
  const filial = document.getElementById('reportBranch').value;
  const vehicleKey = document.getElementById('reportVehicle').value;
  const user = document.getElementById('reportUser').value.trim().toLowerCase();
  const start = document.getElementById('reportStart').value;
  const end = document.getElementById('reportEnd').value;
  return getReservations().filter(r => {
    if(filial && r.partida !== filial) return false;
    if(vehicleKey && carKey(r.partida, r.carro) !== vehicleKey) return false;
    if(user && !String(r.nome).toLowerCase().includes(user)) return false;
    if(start && r.dataVolta < start) return false;
    if(end && r.dataIda > end) return false;
    return true;
  });
}

function reservationKm(reserva){
  const op = reserva.operacao || {};
  if(!op.retirada || !op.devolucao) return 0;
  return Math.max(0, Number(op.devolucao.quilometragem || 0) - Number(op.retirada.quilometragem || 0));
}

function renderReports(){
  if(!canViewReports()) return;
  refreshBranchSelectors();
  const list = getFilteredReportReservations();
  const totalKm = list.reduce((sum, r) => sum + reservationKm(r), 0);
  const completed = list.filter(r => r.operacao && r.operacao.devolucao).length;
  const users = new Set(list.map(r => r.nome)).size;
  document.getElementById('reportSummary').innerHTML =
    '<div><strong>' + list.length + '</strong><span>reservas</span></div>' +
    '<div><strong>' + completed + '</strong><span>concluídas</span></div>' +
    '<div><strong>' + totalKm.toLocaleString('pt-BR') + '</strong><span>quilômetros</span></div>' +
    '<div><strong>' + users + '</strong><span>usuários</span></div>';
  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = list.length ? list.map(r =>
    '<tr>' +
      '<td><strong>' + escapeHTML(getReservationNumberLabel(r)) + '</strong></td>' +
      '<td>' + formatDate(r.dataIda) + ' – ' + formatDate(r.dataVolta) + '</td>' +
      '<td>' + escapeHTML(r.partida) + '</td>' +
      '<td>' + escapeHTML(getVehicleDisplayName(r)) + '</td>' +
      '<td>' + escapeHTML(r.nome) + '</td>' +
      '<td>' + escapeHTML(r.motivo || '') + '</td>' +
      '<td>' + reservationKm(r).toLocaleString('pt-BR') + '</td>' +
      '<td>' + escapeHTML(r.status || 'confirmada') + '</td>' +
    '</tr>'
  ).join('') : '<tr><td colspan="8">Nenhuma reserva encontrada.</td></tr>';
}

reportInputs.forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderReports));

function csvCell(value){
  return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

function exportDateTime(dateISO, time){
  if(!dateISO) return '';
  return formatDate(dateISO) + (time ? ' ' + time : '');
}

function operationDateTime(iso){
  if(!iso) return '';
  const date = new Date(iso);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR') + ' ' +
    date.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

function getReportExportData(){
  const headers = [
    'ID da reserva',
    'Retirada prevista','Devolução prevista',
    'Retirada realizada','Devolução realizada',
    'Filial','Carro','Usuário','Motivo','Ocupantes',
    'Km inicial','Km final','Km rodados',
    'Combustível retirada','Combustível devolução',
    'Avarias retirada','Avarias devolução','Status'
  ];
  const rows = getFilteredReportReservations().map(r => {
    const op = r.operacao || {};
    const retirada = op.retirada || {};
    const devolucao = op.devolucao || {};
    return [
      getReservationNumberLabel(r),
      exportDateTime(r.dataIda, r.horarioRetirada),
      exportDateTime(r.dataVolta, r.horarioDevolucao),
      operationDateTime(retirada.registradoEm),
      operationDateTime(devolucao.registradoEm),
      r.partida, getVehicleDisplayName(r), r.nome, r.motivo || '', getOcupantes(r),
      retirada.quilometragem ?? '', devolucao.quilometragem ?? '', reservationKm(r),
      retirada.combustivel || '', devolucao.combustivel || '', retirada.avarias || '',
      devolucao.avarias || '', r.status || 'confirmada'
    ];
  });
  return { headers, rows };
}

function downloadReportFile(content, type, extension){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'capricar-relatorio-' + todayISO() + extension;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function encodeUtf16LE(text){
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xFF;
  bytes[1] = 0xFE;
  for(let i = 0; i < text.length; i++){
    const code = text.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xFF;
    bytes[3 + i * 2] = code >> 8;
  }
  return bytes;
}

document.getElementById('exportCsvBtn').addEventListener('click', function(){
  if(!canViewReports()) return;
  const data = getReportExportData();
  const excelCsvCell = value => {
    const text = String(value == null ? '' : value);
    if(/^(\d{1,2}\/\d{1,2}|\d{2}\/\d{2}\/\d{4})/.test(text)){
      return csvCell('="' + text + '"');
    }
    if(/^[=+\-@]/.test(text)){
      return csvCell("'" + text);
    }
    return csvCell(text);
  };
  const csv = 'sep=;\r\n' +
    [data.headers].concat(data.rows)
      .map(row => row.map(excelCsvCell).join(';'))
      .join('\r\n');
  downloadReportFile(encodeUtf16LE(csv), 'text/csv;charset=utf-16le;', '.csv');
  logAudit('exportou', 'relatório CSV', todayISO(), data.rows.length + ' reservas exportadas');
});

document.getElementById('exportExcelBtn').addEventListener('click', function(){
  if(!canViewReports()) return;
  const data = getReportExportData();
  const widths = [10,22,22,22,22,16,12,18,20,12,14,14,14,19,19,30,30,16];
  const workbook = buildXlsxWorkbook(data.headers, data.rows, widths);
  downloadReportFile(
    workbook,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xlsx'
  );
  logAudit('exportou', 'relatório Excel', todayISO(), data.rows.length + ' reservas exportadas');
});

function reportFilterText(){
  const branch = document.getElementById('reportBranch');
  const vehicle = document.getElementById('reportVehicle');
  const user = document.getElementById('reportUser').value.trim();
  const start = document.getElementById('reportStart').value;
  const end = document.getElementById('reportEnd').value;
  const parts = [];
  if(branch.value) parts.push('Filial: ' + branch.options[branch.selectedIndex].text);
  if(vehicle.value) parts.push('Veículo: ' + vehicle.options[vehicle.selectedIndex].text);
  if(user) parts.push('Usuário: ' + user);
  if(start) parts.push('Desde: ' + formatDate(start));
  if(end) parts.push('Até: ' + formatDate(end));
  return parts.length ? parts.join(' | ') : 'Todas as filiais, veículos, períodos e usuários';
}

function printableCell(value){
  return escapeHTML(value == null || value === '' ? '—' : String(value));
}

function buildPrintableReport(list){
  const totalKm = list.reduce((sum, item) => sum + reservationKm(item), 0);
  const completed = list.filter(item => item.operacao && item.operacao.devolucao).length;
  const users = new Set(list.map(item => item.nome)).size;
  const generatedAt = new Date().toLocaleString('pt-BR');

  const overviewRows = list.map(item => {
    return '<tr>' +
      '<td><strong>' + printableCell(getReservationNumberLabel(item)) + '</strong></td>' +
      '<td>' + printableCell(exportDateTime(item.dataIda, item.horarioRetirada)) + '<br><small>até ' +
        printableCell(exportDateTime(item.dataVolta, item.horarioDevolucao)) + '</small></td>' +
      '<td><strong>' + printableCell(item.partida) + ' → ' + printableCell(item.destino) + '</strong></td>' +
      '<td>' + printableCell(getVehicleDisplayName(item)) + '</td>' +
      '<td>' + printableCell(item.nome) + '</td>' +
      '<td class="center">' + printableCell(getOcupantes(item)) + '</td>' +
      '<td class="right">' + printableCell(reservationKm(item).toLocaleString('pt-BR')) + '</td>' +
      '<td><span class="status">' + printableCell(item.status || 'confirmada') + '</span></td>' +
    '</tr>';
  }).join('');

  const operationRows = list.map(item => {
    const operation = item.operacao || {};
    const pickup = operation.retirada || {};
    const returnData = operation.devolucao || {};
    const pickupDetails = operation.retirada
      ? '<strong>' + printableCell(operationDateTime(pickup.registradoEm)) + '</strong><br>' +
        printableCell(pickup.quilometragem) + ' km · ' + printableCell(pickup.combustivel)
      : '<span class="pending">Não registrada</span>';
    const returnDetails = operation.devolucao
      ? '<strong>' + printableCell(operationDateTime(returnData.registradoEm)) + '</strong><br>' +
        printableCell(returnData.quilometragem) + ' km · ' + printableCell(returnData.combustivel)
      : '<span class="pending">Não registrada</span>';
    const damages = [
      pickup.avarias ? 'Retirada: ' + pickup.avarias : '',
      returnData.avarias ? 'Devolução: ' + returnData.avarias : ''
    ].filter(Boolean).join(' | ');
    return '<tr>' +
      '<td><strong>' + printableCell(getReservationNumberLabel(item) + ' · ' + item.partida + ' · ' + getVehicleDisplayName(item)) + '</strong><br><small>' +
        printableCell(item.nome) + '</small></td>' +
      '<td>' + pickupDetails + '</td>' +
      '<td>' + returnDetails + '</td>' +
      '<td>' + printableCell(item.motivo || 'Não informado') + '</td>' +
      '<td>' + printableCell(damages || 'Nenhuma avaria informada') + '</td>' +
    '</tr>';
  }).join('');

  const emptyRow = '<tr><td colspan="8" class="empty">Nenhuma reserva encontrada para os filtros selecionados.</td></tr>';
  const emptyOperationRow = '<tr><td colspan="5" class="empty">Nenhum registro operacional encontrado.</td></tr>';

  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<title>Relatório CapriCar - ' + printableCell(todayISO()) + '</title>' +
    '<style>' +
      '@page{size:A4 landscape;margin:12mm}' +
      '*{box-sizing:border-box}' +
      'body{margin:0;color:#172b3d;background:#fff;font:11px Arial,sans-serif}' +
      '.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:3px solid #3a6a95}' +
      '.brand{display:flex;align-items:center;gap:10px}.mark{width:38px;height:38px;border-radius:11px;background:#1e3a5a;color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px}' +
      'h1{margin:0;color:#1e3a5a;font-size:21px}h2{margin:22px 0 9px;color:#1e3a5a;font-size:14px}' +
      '.subtitle,.meta,small{color:#62778a}.meta{text-align:right;line-height:1.5}' +
      '.filters{margin:10px 0;padding:8px 10px;border-radius:7px;background:#edf3f8;color:#3e566b}' +
      '.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:13px 0}' +
      '.summary div{padding:10px;border:1px solid #d8e4ed;border-radius:8px;background:#f8fbfd}' +
      '.summary strong{display:block;color:#1e3a5a;font-size:18px}.summary span{color:#62778a}' +
      'table{width:100%;border-collapse:collapse;table-layout:fixed}' +
      'thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}' +
      'th{padding:8px 7px;background:#1e3a5a;color:#fff;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.25px}' +
      'td{padding:7px;border:1px solid #dbe5ed;vertical-align:top;line-height:1.35;overflow-wrap:anywhere}' +
      'tbody tr:nth-child(even){background:#f5f9fc}.center{text-align:center}.right{text-align:right}' +
      '.status{display:inline-block;padding:3px 6px;border-radius:9px;background:#dceaf5;color:#244d70;font-weight:700}' +
      '.pending{color:#9a5d25;font-style:italic}.empty{text-align:center;padding:22px;color:#62778a}' +
      '.overview th:nth-child(1){width:6%}.overview th:nth-child(2){width:15%}.overview th:nth-child(3){width:15%}.overview th:nth-child(4){width:13%}' +
      '.overview th:nth-child(5){width:15%}.overview th:nth-child(6){width:8%}.overview th:nth-child(7){width:9%}.overview th:nth-child(8){width:11%}' +
      '.operations th:nth-child(1){width:15%}.operations th:nth-child(2),.operations th:nth-child(3){width:19%}' +
      '.operations th:nth-child(4){width:21%}.operations th:nth-child(5){width:26%}' +
      '.footer{margin-top:12px;padding-top:7px;border-top:1px solid #dbe5ed;color:#7b8d9c;text-align:right;font-size:9px}' +
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
    '</style></head><body>' +
      '<header class="header"><div class="brand"><div class="mark">CC</div><div><h1>Relatório de utilização</h1>' +
        '<div class="subtitle">CapriCar · Gestão de veículos e reservas</div></div></div>' +
        '<div class="meta"><strong>Emitido em</strong><br>' + printableCell(generatedAt) + '</div></header>' +
      '<div class="filters"><strong>Filtros:</strong> ' + printableCell(reportFilterText()) + '</div>' +
      '<section class="summary">' +
        '<div><strong>' + list.length + '</strong><span>Reservas</span></div>' +
        '<div><strong>' + completed + '</strong><span>Concluídas</span></div>' +
        '<div><strong>' + printableCell(totalKm.toLocaleString('pt-BR')) + '</strong><span>Quilômetros rodados</span></div>' +
        '<div><strong>' + users + '</strong><span>Usuários</span></div>' +
      '</section>' +
      '<h2>Visão geral das reservas</h2>' +
      '<table class="overview"><thead><tr><th>ID</th><th>Período previsto</th><th>Rota</th><th>Veículo</th><th>Usuário</th>' +
        '<th>Ocupantes</th><th>Km rodados</th><th>Status</th></tr></thead><tbody>' + (overviewRows || emptyRow) + '</tbody></table>' +
      '<h2>Retirada, devolução e condições do veículo</h2>' +
      '<table class="operations"><thead><tr><th>Veículo / usuário</th><th>Retirada realizada</th><th>Devolução realizada</th>' +
        '<th>Motivo</th><th>Avarias e observações</th></tr></thead><tbody>' + (operationRows || emptyOperationRow) + '</tbody></table>' +
      '<div class="footer">Relatório gerado pelo CapriCar · ' + printableCell(generatedAt) + '</div>' +
    '</body></html>';
}

document.getElementById('exportPdfBtn').addEventListener('click', async function(){
  if(!canViewReports()) return;
  const reportWindow = window.open('', '_blank');
  if(!reportWindow){
    await showSiteAlert('Permita a abertura de pop-ups para exportar o relatório em PDF.', {
      title:'Pop-up bloqueado',
      type:'warning'
    });
    return;
  }
  const list = getFilteredReportReservations();
  reportWindow.document.open();
  reportWindow.document.write(buildPrintableReport(list));
  reportWindow.document.close();
  reportWindow.opener = null;
  logAudit('exportou', 'relatório PDF', todayISO(), list.length + ' reservas exportadas');
  reportWindow.setTimeout(function(){
    reportWindow.focus();
    reportWindow.print();
  }, 350);
});
