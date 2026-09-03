/* Gestão — usuários e permissões */

/* =========================================================
   Usuários e permissões
   ========================================================= */
const userAccountForm = document.getElementById('userAccountForm');
const userAccountNameInput = document.getElementById('userAccountName');
const userAccountUsernameInput = document.getElementById('userAccountUsername');
const userAccountEmailInput = document.getElementById('userAccountEmail');
const userAccountPasswordInput = document.getElementById('userAccountPassword');
const userAccountCostCenterInput = document.getElementById('userAccountCostCenter');
const userAccountError = document.getElementById('userAccountError');
const userAccountsList = document.getElementById('userAccountsList');
const userAccountsSearch = document.getElementById('userAccountsSearch');
const userAccountsPermissionFilter = document.getElementById('userAccountsPermissionFilter');
const userAccountsPageSize = document.getElementById('userAccountsPageSize');
const userPagination = document.getElementById('userPagination');
const userBulkToolbar = document.getElementById('userBulkToolbar');
const userSelectAllCheckbox = document.getElementById('userSelectAllCheckbox');
const userBulkCount = document.getElementById('userBulkCount');
const userBulkDeactivateBtn = document.getElementById('userBulkDeactivateBtn');
const userBulkDeleteBtn = document.getElementById('userBulkDeleteBtn');
const userBulkPermissionsBtn = document.getElementById('userBulkPermissionsBtn');
const userDeleteModal = document.getElementById('userDeleteModal');
const userDeleteForm = document.getElementById('userDeleteForm');
const userDeleteSummary = document.getElementById('userDeleteSummary');
const userDeleteJustification = document.getElementById('userDeleteJustification');
const userDeleteError = document.getElementById('userDeleteError');
const userDeleteSubmitBtn = document.getElementById('userDeleteSubmitBtn');
const userBulkPermissionsModal = document.getElementById('userBulkPermissionsModal');
const userBulkPermissionsForm = document.getElementById('userBulkPermissionsForm');
const userBulkPermissionsSummary = document.getElementById('userBulkPermissionsSummary');
const userBulkPermissionsError = document.getElementById('userBulkPermissionsError');
const userBulkPermissionsSubmitBtn = document.getElementById('userBulkPermissionsSubmitBtn');
const userPermissionInputs = {
  reservations:document.getElementById('permissionReservations'),
  branches:document.getElementById('permissionBranches'),
  fleet:document.getElementById('permissionFleet'),
  blocks:document.getElementById('permissionBlocks'),
  reports:document.getElementById('permissionReports'),
  audit:document.getElementById('permissionAudit'),
  rules:document.getElementById('permissionRules'),
  users:document.getElementById('permissionUsers'),
  integrations:document.getElementById('permissionIntegrations')
};
const bulkPermissionInputs = {
  reservations:document.getElementById('bulkPermissionReservations'),
  branches:document.getElementById('bulkPermissionBranches'),
  fleet:document.getElementById('bulkPermissionFleet'),
  blocks:document.getElementById('bulkPermissionBlocks'),
  reports:document.getElementById('bulkPermissionReports'),
  audit:document.getElementById('bulkPermissionAudit'),
  rules:document.getElementById('bulkPermissionRules'),
  users:document.getElementById('bulkPermissionUsers'),
  integrations:document.getElementById('bulkPermissionIntegrations')
};
let userDeleteId = null;
let userDeleteMode = 'single'; // 'single' | 'bulk'
let userSearchTerm = '';
let userPermissionFilter = '';
let userCurrentPage = 1;
let USER_PAGE_SIZE = 25;
const selectedUserIds = new Set();

const MS_LOGO_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="1" y="1" width="9.5" height="9.5" fill="#f25022"></rect>' +
    '<rect x="12.5" y="1" width="9.5" height="9.5" fill="#7fba00"></rect>' +
    '<rect x="1" y="12.5" width="9.5" height="9.5" fill="#00a4ef"></rect>' +
    '<rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#ffb900"></rect>' +
  '</svg>';

const USER_PERMISSION_LABELS = {
  reservations:'Reservas',
  branches: 'Locais',
  fleet:'Veículos',
  blocks:'Bloqueios',
  audit:'Auditoria',
  reports:'Relatórios',
  rules:'Regras',
  integrations:'Integrações',
  users:'Usuários'
};

function selectedUserPermissions(){
  const permissions = {};
  Object.keys(userPermissionInputs).forEach(key => {
    permissions[key] = userPermissionInputs[key].checked;
  });
  return permissions;
}

function selectedBulkPermissions(){
  const permissions = {};
  Object.keys(bulkPermissionInputs).forEach(key => {
    permissions[key] = bulkPermissionInputs[key].checked;
  });
  return permissions;
}

function bulkSummaryMessage(summary, verb){
  let message = summary.processed + ' usuário(s) ' + verb;
  if(summary.skipped) message += ', ' + summary.skipped + ' ignorado(s)';
  if(summary.errors && summary.errors.length) message += ', ' + summary.errors.length + ' com erro';
  return message + '.';
}

// O formulário de "Novo usuário" cria e só cria - a edição vive no modal
// (ver openUserEditModal). Antes os dois compartilhavam os mesmos campos, e
// ficava ambíguo se o envio ia criar alguém ou alterar quem estava carregado.
function resetUserAccountForm(){
  userAccountForm.reset();
  userAccountError.textContent = '';
}

function closeUserDeleteModal(){
  userDeleteModal.classList.add('hidden');
  userDeleteForm.reset();
  userDeleteError.textContent = '';
  userDeleteSubmitBtn.disabled = false;
  userDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  userDeleteId = null;
  userDeleteMode = 'single';
}

function openUserDeleteModal(userId){
  if(!canManageUsers()) return;
  const account = getSystemUsers().find(item => String(item.id) === String(userId));
  if(!account || account.role === 'admin') return;
  userDeleteMode = 'single';
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

function openBulkDeleteModal(){
  if(!canManageUsers() || !selectedUserIds.size) return;
  userDeleteMode = 'bulk';
  userDeleteId = null;
  userDeleteForm.reset();
  userDeleteError.textContent = '';
  const accounts = getSystemUsers().filter(account => selectedUserIds.has(String(account.id)));
  const names = accounts.slice(0, 10).map(account => escapeHTML(account.nome));
  let namesHTML = names.join(', ');
  if(accounts.length > 10) namesHTML += ' e mais ' + (accounts.length - 10);
  userDeleteSummary.innerHTML =
    '<strong>' + accounts.length + ' usuário(s) selecionado(s)</strong>' +
    '<small>' + namesHTML + '</small>';
  userDeleteModal.classList.remove('hidden');
  userDeleteJustification.focus();
}

function permissionBadges(account){
  if(account.role === 'admin') return '<span>Acesso total</span>';
  const granted = Object.keys(USER_PERMISSION_LABELS).filter(key => account.permissions[key]);
  return granted.map(key => '<span>' + escapeHTML(USER_PERMISSION_LABELS[key]) + '</span>').join('');
}

function sortedAccounts(){
  return getSystemUsers().slice().sort((a,b) => {
    if(a.role === 'admin') return -1;
    if(b.role === 'admin') return 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

// Selo de CNH no card do usuário. O estado vem calculado do servidor
// (users.js -> cnhStatus), para a lista e o portal nunca divergirem.
const CNH_BADGE = {
  valida:{ classe:'tag-success', texto:'CNH válida' },
  vencendo:{ classe:'tag-warning', texto:'CNH vencendo' },
  vencida:{ classe:'tag-danger', texto:'CNH vencida' }
};

function cnhBadge(account){
  const info = CNH_BADGE[account.cnhStatus];
  if(!info) return '';
  const detalhe = account.cnh && account.cnh.validade
    ? ' title="Validade: ' + escapeHTML(formatDate(account.cnh.validade)) + '"'
    : '';
  return '<span class="tag ' + info.classe + '"' + detalhe + '>' + info.texto + '</span>';
}

function filteredAccounts(){
  let accounts = sortedAccounts();
  const term = userSearchTerm.trim().toLowerCase();
  if(term){
    accounts = accounts.filter(account =>
      account.nome.toLowerCase().includes(term) || account.username.toLowerCase().includes(term));
  }
  if(userPermissionFilter){
    accounts = accounts.filter(account => account.permissions && account.permissions[userPermissionFilter]);
  }
  return accounts;
}

function updateBulkToolbarState(){
  const count = selectedUserIds.size;
  userBulkCount.textContent = count + ' selecionado(s)';
  userBulkPermissionsBtn.disabled = count === 0;
  userBulkDeactivateBtn.disabled = count === 0;
  userBulkDeleteBtn.disabled = count === 0;
  const selectableIds = filteredAccounts().filter(account => account.role !== 'admin').map(account => String(account.id));
  const selectedVisible = selectableIds.filter(id => selectedUserIds.has(id));
  userSelectAllCheckbox.checked = selectableIds.length > 0 && selectedVisible.length === selectableIds.length;
  userSelectAllCheckbox.indeterminate = selectedVisible.length > 0 && selectedVisible.length < selectableIds.length;
}

function renderUserPagination(totalItems){
  const totalPages = Math.max(1, Math.ceil(totalItems / USER_PAGE_SIZE));
  if(userCurrentPage > totalPages) userCurrentPage = totalPages;
  if(userCurrentPage < 1) userCurrentPage = 1;

  if(totalItems <= USER_PAGE_SIZE){
    userPagination.innerHTML = '';
    return;
  }

  const firstItem = (userCurrentPage - 1) * USER_PAGE_SIZE + 1;
  const lastItem = Math.min(totalItems, userCurrentPage * USER_PAGE_SIZE);
  userPagination.innerHTML =
    '<div class="user-pagination-info">' + firstItem + '–' + lastItem + ' de ' + totalItems + ' usuários</div>' +
    '<div class="user-pagination-nav">' +
      '<button type="button" class="secondary-btn" id="userPagePrevBtn"' + (userCurrentPage <= 1 ? ' disabled' : '') + '>‹ Anterior</button>' +
      '<span>Página ' + userCurrentPage + ' de ' + totalPages + '</span>' +
      '<button type="button" class="secondary-btn" id="userPageNextBtn"' + (userCurrentPage >= totalPages ? ' disabled' : '') + '>Próxima ›</button>' +
    '</div>';

  const prevBtn = document.getElementById('userPagePrevBtn');
  const nextBtn = document.getElementById('userPageNextBtn');
  if(prevBtn) prevBtn.addEventListener('click', function(){
    userCurrentPage--;
    renderUserManagement();
  });
  if(nextBtn) nextBtn.addEventListener('click', function(){
    userCurrentPage++;
    renderUserManagement();
  });
}

function renderUserManagement(){
  if(!canManageUsers()) return;
  ensureSystemUsers();

  const allIds = new Set(getSystemUsers().map(account => String(account.id)));
  Array.from(selectedUserIds).forEach(id => { if(!allIds.has(id)) selectedUserIds.delete(id); });

  const accounts = filteredAccounts();
  const totalPages = Math.max(1, Math.ceil(accounts.length / USER_PAGE_SIZE));
  if(userCurrentPage > totalPages) userCurrentPage = totalPages;
  if(userCurrentPage < 1) userCurrentPage = 1;
  const pageAccounts = accounts.slice((userCurrentPage - 1) * USER_PAGE_SIZE, userCurrentPage * USER_PAGE_SIZE);

  userAccountsList.innerHTML = pageAccounts.length ? pageAccounts.map(account =>
    '<div class="management-item' + (account.active ? '' : ' is-inactive') + '">' +
      (account.role !== 'admin'
        ? '<input type="checkbox" class="user-select-checkbox" data-id="' + escapeHTML(account.id) + '"' +
            (selectedUserIds.has(String(account.id)) ? ' checked' : '') + '>'
        : '<span class="user-select-spacer"></span>') +
      '<div><strong>' + escapeHTML(account.nome) + '</strong>' +
        '<small>' + escapeHTML(account.email || account.username) + ' · ' +
          '<span class="' + (account.active ? '' : 'user-status-inactive') + '">' + (account.active ? 'Ativo' : 'Inativo') + '</span>' +
          (account.authProvider === 'entra'
            ? ' · <span class="user-auth-icon" role="img" aria-label="Conta Microsoft (Entra ID)" title="Conta Microsoft (Entra ID)">' + MS_LOGO_SVG + '</span>'
            : '') +
        '</small>' +
        '<div class="user-permissions">' + cnhBadge(account) + permissionBadges(account) + '</div>' +
      '</div>' +
      '<div class="management-actions">' +
        '<button type="button" class="secondary-btn user-view-btn" data-id="' + escapeHTML(account.id) + '">Visualizar</button>' +
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
  ).join('') : '<div class="empty-state">Nenhum usuário' +
    (userSearchTerm.trim() || userPermissionFilter ? ' encontrado para este filtro' : ' cadastrado') + '.</div>';

  userAccountsList.querySelectorAll('.user-select-checkbox').forEach(cb => {
    cb.addEventListener('change', function(){
      const id = this.getAttribute('data-id');
      if(this.checked) selectedUserIds.add(id); else selectedUserIds.delete(id);
      updateBulkToolbarState();
    });
  });

  userAccountsList.querySelectorAll('.user-view-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openUserViewModal(this.getAttribute('data-id'));
    });
  });

  userAccountsList.querySelectorAll('.user-edit-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openUserEditModal(this.getAttribute('data-id'));
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
        if(String(userEditingId) === String(account.id)) closeUserEditModal();
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

  updateBulkToolbarState();
  renderUserPagination(accounts.length);
}

userAccountsPageSize.value = String(USER_PAGE_SIZE);
userAccountsPageSize.addEventListener('change', function(){
  USER_PAGE_SIZE = Number(this.value) || 25;
  userCurrentPage = 1;
  renderUserManagement();
});

userAccountsPermissionFilter.addEventListener('change', function(){
  userPermissionFilter = this.value;
  userCurrentPage = 1;
  renderUserManagement();
});

userAccountsSearch.addEventListener('input', function(){
  userSearchTerm = this.value;
  userCurrentPage = 1;
  renderUserManagement();
});

userSelectAllCheckbox.addEventListener('change', function(){
  const selectableIds = filteredAccounts().filter(account => account.role !== 'admin').map(account => String(account.id));
  if(this.checked){
    selectableIds.forEach(id => selectedUserIds.add(id));
  } else {
    selectableIds.forEach(id => selectedUserIds.delete(id));
  }
  renderUserManagement();
});

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
  if(!canManageUsers()) return;
  if(userDeleteMode === 'bulk' ? !selectedUserIds.size : !userDeleteId) return;
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
    if(userDeleteMode === 'bulk'){
      const summary = await apiRequest('/api/users/bulk/delete', {
        method:'POST',
        body:{ userIds:Array.from(selectedUserIds), justification }
      });
      await hydrateDatabaseState();
      if(selectedUserIds.has(String(userEditingId))) closeUserEditModal();
      selectedUserIds.clear();
      closeUserDeleteModal();
      renderUserManagement();
      await showSiteAlert(bulkSummaryMessage(summary, 'excluído(s)'), {
        title:'Exclusão em massa',
        type:summary.errors && summary.errors.length ? 'warning' : 'success'
      });
    } else {
      await apiRequest('/api/users/' + encodeURIComponent(userDeleteId), {
        method:'DELETE',
        body:{ justification }
      });
      await hydrateDatabaseState();
      if(String(userEditingId) === String(userDeleteId)) closeUserEditModal();
      closeUserDeleteModal();
      renderUserManagement();
    }
  }catch(error){
    userDeleteError.textContent = error.message;
    userDeleteSubmitBtn.disabled = false;
    userDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  }
});

userBulkDeleteBtn.addEventListener('click', function(){
  openBulkDeleteModal();
});

userBulkDeactivateBtn.addEventListener('click', async function(){
  if(!canManageUsers() || !selectedUserIds.size) return;
  const confirmed = await showSiteConfirm('Desativar ' + selectedUserIds.size + ' usuário(s) selecionado(s)?', {
    title:'Desativar em massa',
    confirmText:'Desativar'
  });
  if(!confirmed) return;
  userBulkDeactivateBtn.disabled = true;
  const originalHTML = userBulkDeactivateBtn.innerHTML;
  userBulkDeactivateBtn.textContent = 'Desativando...';
  try{
    const summary = await apiRequest('/api/users/bulk/deactivate', {
      method:'POST',
      body:{ userIds:Array.from(selectedUserIds) }
    });
    await hydrateDatabaseState();
    selectedUserIds.clear();
    renderUserManagement();
    await showSiteAlert(bulkSummaryMessage(summary, 'desativado(s)'), {
      title:'Desativação em massa',
      type:summary.errors && summary.errors.length ? 'warning' : 'success'
    });
  }catch(error){
    await showSiteAlert(error.message || 'Falha ao desativar os usuários selecionados.', {
      title:'Não foi possível concluir',
      type:'danger'
    });
  }finally{
    userBulkDeactivateBtn.disabled = false;
    userBulkDeactivateBtn.innerHTML = originalHTML;
  }
});

function closeUserBulkPermissionsModal(){
  userBulkPermissionsModal.classList.add('hidden');
  userBulkPermissionsForm.reset();
  userBulkPermissionsError.textContent = '';
  userBulkPermissionsSubmitBtn.disabled = false;
  userBulkPermissionsSubmitBtn.textContent = 'Aplicar a todos';
}

function openUserBulkPermissionsModal(){
  if(!canManageUsers() || !selectedUserIds.size) return;
  userBulkPermissionsForm.reset();
  userBulkPermissionsError.textContent = '';
  userBulkPermissionsSummary.innerHTML =
    '<strong>' + selectedUserIds.size + ' usuário(s) selecionado(s)</strong>' +
    '<small>As permissões marcadas substituirão as permissões atuais de cada usuário.</small>';
  userBulkPermissionsModal.classList.remove('hidden');
}

userBulkPermissionsBtn.addEventListener('click', openUserBulkPermissionsModal);
document.getElementById('userBulkPermissionsCloseBtn').addEventListener('click', closeUserBulkPermissionsModal);
document.getElementById('userBulkPermissionsCancelBtn').addEventListener('click', closeUserBulkPermissionsModal);
userBulkPermissionsModal.addEventListener('click', function(e){
  if(e.target === userBulkPermissionsModal) closeUserBulkPermissionsModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !userBulkPermissionsModal.classList.contains('hidden')){
    closeUserBulkPermissionsModal();
  }
});
userBulkPermissionsForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageUsers() || !selectedUserIds.size) return;
  userBulkPermissionsError.textContent = '';
  userBulkPermissionsSubmitBtn.disabled = true;
  userBulkPermissionsSubmitBtn.textContent = 'Aplicando...';
  try{
    const summary = await apiRequest('/api/users/bulk/permissions', {
      method:'POST',
      body:{ userIds:Array.from(selectedUserIds), permissions:selectedBulkPermissions() }
    });
    await hydrateDatabaseState();
    selectedUserIds.clear();
    closeUserBulkPermissionsModal();
    renderUserManagement();
    await showSiteAlert(bulkSummaryMessage(summary, 'atualizado(s)'), {
      title:'Permissões em massa',
      type:summary.errors && summary.errors.length ? 'warning' : 'success'
    });
  }catch(error){
    userBulkPermissionsError.textContent = error.message;
    userBulkPermissionsSubmitBtn.disabled = false;
    userBulkPermissionsSubmitBtn.textContent = 'Aplicar a todos';
  }
});


userAccountForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageUsers()) return;
  userAccountError.textContent = '';
  const accounts = getSystemUsers();
  const nome = userAccountNameInput.value.trim();
  const username = userAccountUsernameInput.value.trim().toLowerCase();
  const email = userAccountEmailInput.value.trim();
  const password = userAccountPasswordInput.value.trim();

  if(!nome){
    userAccountError.textContent = 'Informe o nome do usuário.';
    return;
  }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    userAccountError.textContent = 'Informe um e-mail válido.';
    return;
  }
  if(!/^[a-z0-9._-]{3,40}$/.test(username)){
    userAccountError.textContent = 'Use de 3 a 40 caracteres no usuário: letras minúsculas, números, ponto, hífen ou sublinhado.';
    return;
  }
  if(accounts.some(account => account.username === username)){
    userAccountError.textContent = 'Já existe uma conta com esse usuário.';
    return;
  }
  if(password.length < 8){
    userAccountError.textContent = 'A senha deve ter pelo menos 8 caracteres.';
    return;
  }

  try{
    const result = await apiRequest('/api/users', {
      method:'POST',
      body:{
        username:username,
        nome:nome,
        email:email,
        password:password,
        centroCusto:userAccountCostCenterInput.value.trim(),
        permissions:selectedUserPermissions()
      }
    });
    accounts.push(normalizeSystemUser(result.user));
    saveSystemUsers(accounts);
    resetUserAccountForm();
    renderUserManagement();
  }catch(error){
    userAccountError.textContent = error.message;
  }
});

/* =========================================================
   Modal de edição de usuário
   ========================================================= */
const userEditModal = document.getElementById('userEditModal');
const userEditForm = document.getElementById('userEditForm');
const userEditTitle = document.getElementById('userEditTitle');
const userEditNameInput = document.getElementById('userEditName');
const userEditUsernameInput = document.getElementById('userEditUsername');
const userEditEmailInput = document.getElementById('userEditEmail');
const userEditPasswordInput = document.getElementById('userEditPassword');
const userEditCostCenterInput = document.getElementById('userEditCostCenter');
const userEditPasswordHint = document.getElementById('userEditPasswordHint');
const userEditError = document.getElementById('userEditError');
const userEditCloseBtn = document.getElementById('userEditCloseBtn');
const userEditCancelBtn = document.getElementById('userEditCancelBtn');

const userEditPermissionInputs = {
  reservations:document.getElementById('editPermissionReservations'),
  branches:document.getElementById('editPermissionBranches'),
  fleet:document.getElementById('editPermissionFleet'),
  blocks:document.getElementById('editPermissionBlocks'),
  audit:document.getElementById('editPermissionAudit'),
  reports:document.getElementById('editPermissionReports'),
  rules:document.getElementById('editPermissionRules'),
  integrations:document.getElementById('editPermissionIntegrations'),
  users:document.getElementById('editPermissionUsers')
};

let userEditingId = null;

function selectedUserEditPermissions(){
  const permissions = {};
  Object.keys(userEditPermissionInputs).forEach(key => {
    permissions[key] = userEditPermissionInputs[key].checked;
  });
  return permissions;
}

function closeUserEditModal(){
  userEditingId = null;
  userEditModal.classList.add('hidden');
  userEditForm.reset();
  userEditError.textContent = '';
}

function openUserEditModal(accountId){
  if(!canManageUsers()) return;
  const account = getSystemUsers().find(item => String(item.id) === String(accountId));
  if(!account || (account.role === 'admin' && !isAdmin())) return;

  // Conta vinda do Entra ID: nome, e-mail e senha são governados lá, então
  // aqui só as permissões podem mudar.
  const isEntra = account.authProvider === 'entra';

  userEditingId = account.id;
  userEditTitle.textContent = 'Editar ' + account.nome;
  userEditNameInput.value = account.nome;
  userEditNameInput.disabled = isEntra;
  userEditUsernameInput.value = account.username;
  userEditEmailInput.value = account.email || '';
  userEditEmailInput.disabled = isEntra;
  userEditPasswordInput.value = '';
  userEditPasswordInput.disabled = isEntra;
  userEditCostCenterInput.value = account.centroCusto || '';
  userEditPasswordHint.textContent = isEntra
    ? 'Conta gerenciada pelo Microsoft Entra ID — nome, e-mail, usuário e senha não podem ser alterados aqui.'
    : 'Deixe a senha vazia para manter a atual.';

  // Admin tem tudo por definição, e não por marcação - por isso as caixas
  // aparecem marcadas e travadas.
  Object.keys(userEditPermissionInputs).forEach(key => {
    userEditPermissionInputs[key].checked = account.role === 'admin' || account.permissions[key] === true;
    userEditPermissionInputs[key].disabled = account.role === 'admin';
  });

  userEditError.textContent = '';
  userEditModal.classList.remove('hidden');
  if(!isEntra) userEditNameInput.focus();
}

if(userEditCloseBtn) userEditCloseBtn.addEventListener('click', closeUserEditModal);
if(userEditCancelBtn) userEditCancelBtn.addEventListener('click', closeUserEditModal);

if(userEditModal){
  userEditModal.addEventListener('click', function(event){
    if(event.target === userEditModal) closeUserEditModal();
  });
}

if(userEditForm){
  userEditForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageUsers()) return;
    userEditError.textContent = '';

    const accounts = getSystemUsers();
    const editing = accounts.find(account => String(account.id) === String(userEditingId));
    if(!editing){
      userEditError.textContent = 'Usuário não encontrado. Feche e abra a edição novamente.';
      return;
    }

    const isEntra = editing.authProvider === 'entra';
    const nome = isEntra ? editing.nome : userEditNameInput.value.trim();
    const email = isEntra ? (editing.email || '') : userEditEmailInput.value.trim();
    const password = isEntra ? '' : userEditPasswordInput.value.trim();

    if(!nome){
      userEditError.textContent = 'Informe o nome do usuário.';
      return;
    }
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      userEditError.textContent = 'Informe um e-mail válido.';
      return;
    }
    if(password && password.length < 8){
      userEditError.textContent = 'A nova senha deve ter pelo menos 8 caracteres.';
      return;
    }

    try{
      const body = {
        nome:nome,
        email:email,
        centroCusto:userEditCostCenterInput.value.trim(),
        permissions:editing.role === 'admin' ? editing.permissions : selectedUserEditPermissions()
      };
      if(!isEntra && password) body.password = password;

      const result = await apiRequest('/api/users/' + encodeURIComponent(editing.id), {
        method:'PATCH',
        body:body
      });

      const index = accounts.findIndex(account => String(account.id) === String(editing.id));
      accounts[index] = normalizeSystemUser(result.user);
      saveSystemUsers(accounts);

      // Editar a si mesmo precisa refletir no cabeçalho e nas permissões da
      // sessão em curso, senão a tela fica mostrando o estado antigo.
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

      closeUserEditModal();
      renderUserManagement();
    }catch(error){
      userEditError.textContent = error.message;
    }
  });
}

/* =========================================================
   Modal de visualização de usuário (somente leitura)
   Mesmos dados do modal de edição, mais a CNH - sem formulário, sem botão
   de salvar, pra evitar alteração sem querer no cadastro.
   ========================================================= */
const userViewModal = document.getElementById('userViewModal');
const userViewTitle = document.getElementById('userViewTitle');
const userViewUsername = document.getElementById('userViewUsername');
const userViewStatus = document.getElementById('userViewStatus');
const userViewEmail = document.getElementById('userViewEmail');
const userViewAuthProvider = document.getElementById('userViewAuthProvider');
const userViewCostCenter = document.getElementById('userViewCostCenter');
const userViewPermissions = document.getElementById('userViewPermissions');
const userViewCnhBadge = document.getElementById('userViewCnhBadge');
const userViewCnhDetails = document.getElementById('userViewCnhDetails');
const userViewCnhNumero = document.getElementById('userViewCnhNumero');
const userViewCnhCategoria = document.getElementById('userViewCnhCategoria');
const userViewCnhCategoriaPreview = document.getElementById('userViewCnhCategoriaPreview');
const userViewCnhValidade = document.getElementById('userViewCnhValidade');
const userViewCnhFrente = document.getElementById('userViewCnhFrente');
const userViewCnhVerso = document.getElementById('userViewCnhVerso');
const userViewCloseBtn = document.getElementById('userViewCloseBtn');
const userViewFooterCloseBtn = document.getElementById('userViewFooterCloseBtn');

function renderUserViewPhotoState(el, enviada, userId, lado){
  if(!el) return;
  if(!enviada){
    el.textContent = 'Nenhuma foto enviada.';
    el.classList.remove('cnh-photo-ok');
    return;
  }
  el.classList.add('cnh-photo-ok');
  el.innerHTML = 'Foto enviada · <a href="/api/profile/cnh/' +
    encodeURIComponent(userId) + '/' + encodeURIComponent(lado) +
    '" target="_blank" rel="noopener">ver</a>';
}

function renderUserViewCnh(account){
  const info = CNH_BADGE[account.cnhStatus];
  userViewCnhBadge.className = 'tag' + (info ? ' ' + info.classe : '');
  userViewCnhBadge.textContent = info ? info.texto : 'CNH não cadastrada';

  const cnh = account.cnh;
  userViewCnhDetails.classList.toggle('hidden', !cnh);
  if(cnh){
    userViewCnhNumero.textContent = cnh.numero || '—';
    userViewCnhCategoria.textContent = cnh.categoria || '—';
    userViewCnhValidade.textContent = cnh.validade ? formatDate(cnh.validade) : '—';
  }
  if(userViewCnhCategoriaPreview){
    userViewCnhCategoriaPreview.innerHTML = (cnh && cnh.categoria && typeof cnhCategoriaPreviewHTML === 'function')
      ? cnhCategoriaPreviewHTML(cnh.categoria)
      : '';
  }
  renderUserViewPhotoState(userViewCnhFrente, !!(cnh && cnh.fotos && cnh.fotos.frente), account.id, 'frente');
  renderUserViewPhotoState(userViewCnhVerso, !!(cnh && cnh.fotos && cnh.fotos.verso), account.id, 'verso');
}

function closeUserViewModal(){
  userViewModal.classList.add('hidden');
}

function openUserViewModal(accountId){
  if(!canManageUsers()) return;
  const account = getSystemUsers().find(item => String(item.id) === String(accountId));
  if(!account) return;

  userViewTitle.textContent = account.nome;
  userViewUsername.textContent = account.username;
  userViewStatus.textContent = account.active ? 'Ativo' : 'Inativo';
  userViewEmail.textContent = account.email || '—';
  userViewAuthProvider.textContent = account.authProvider === 'entra' ? 'Microsoft (Entra ID)' : 'Local';
  userViewCostCenter.textContent = account.centroCusto || '—';
  userViewPermissions.innerHTML = permissionBadges(account) || '<span>Sem permissões adicionais</span>';

  renderUserViewCnh(account);

  userViewModal.classList.remove('hidden');
}

if(userViewCloseBtn) userViewCloseBtn.addEventListener('click', closeUserViewModal);
if(userViewFooterCloseBtn) userViewFooterCloseBtn.addEventListener('click', closeUserViewModal);

if(userViewModal){
  userViewModal.addEventListener('click', function(event){
    if(event.target === userViewModal) closeUserViewModal();
  });
}

const ssoImportBtn = document.getElementById('ssoImportBtn');

if(ssoImportBtn){
  apiRequest('/api/auth/sso/status').then(status => {
    if(status.graphImportEnabled) ssoImportBtn.classList.remove('hidden');
  }).catch(error => {
    console.error('Falha ao consultar status do login via Microsoft:', error);
  });

  ssoImportBtn.addEventListener('click', async function(){
    if(!canManageUsers()) return;
    ssoImportBtn.disabled = true;
    const originalHTML = ssoImportBtn.innerHTML;
    ssoImportBtn.textContent = 'Importando...';
    try{
      const summary = await apiRequest('/api/users/sso-import', { method:'POST' });
      await hydrateDatabaseState();
      renderUserManagement();
      const parts = [
        summary.created + ' criado(s)',
        summary.updated + ' atualizado(s)',
        summary.skipped + ' ignorado(s)'
      ];
      if(summary.errors && summary.errors.length){
        parts.push(summary.errors.length + ' com erro');
      }
      await showSiteAlert('Importação concluída: ' + parts.join(', ') + '.', {
        title:'Usuários do Entra ID',
        type:summary.errors && summary.errors.length ? 'warning' : 'success'
      });
    }catch(error){
      await showSiteAlert(error.message || 'Falha ao importar usuários do Entra ID.', {
        title:'Não foi possível importar',
        type:'danger'
      });
    }finally{
      ssoImportBtn.disabled = false;
      ssoImportBtn.innerHTML = originalHTML;
    }
  });
}
