/* Gestão — usuários e permissões */

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
  branches:document.getElementById('permissionBranches'),
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
  branches: 'Filiais',
  fleet:'Veículos',
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
          '<span class="' + (account.active ? '' : 'user-status-inactive') + '">' + (account.active ? 'Ativo' : 'Inativo') + '</span>' +
          (account.authProvider === 'entra' ? ' · <span class="user-auth-badge">Microsoft</span>' : '') +
        '</small>' +
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

