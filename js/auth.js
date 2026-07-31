/* Autenticação local, contas, permissões e navegação por abas */
/* As contas deste protótipo são persistidas somente neste navegador. */
function getCurrentUser(){
  try{
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  }catch(e){
    return null;
  }
}

function setCurrentUser(user){
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearCurrentUser(){
  localStorage.removeItem(USER_KEY);
}

function normalizeUserPermissions(permissions){
  const source = permissions || {};
  return {
    reservations:source.reservations === true,
    fleet:source.fleet === true,
    blocks:source.blocks === true,
    reports:source.reports === true
  };
}

function normalizeSystemUser(account){
  return {
    id:String(account.id || ('user-' + Date.now())),
    username:String(account.username || '').trim().toLowerCase(),
    nome:String(account.nome || account.username || '').trim(),
    role:account.role === 'admin' ? 'admin' : (account.role === 'facilities' ? 'facilities' : 'user'),
    active:account.active !== false,
    permissions:normalizeUserPermissions(account.permissions)
  };
}

function getSystemUsers(){
  try{
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeSystemUser) : [];
  }catch(e){
    return [];
  }
}

function saveSystemUsers(accounts){
  const normalized = accounts.map(normalizeSystemUser);
  localStorage.setItem(USERS_KEY, JSON.stringify(normalized));
  return normalized;
}

function ensureSystemUsers(){
  return getSystemUsers();
}

function findSystemUser(username){
  const normalized = String(username || '').trim().toLowerCase();
  return getSystemUsers().find(account => account.username === normalized) || null;
}

function accountToSession(account){
  return {
    id:account.id,
    username:account.username,
    nome:account.nome,
    email:'',
    isAdmin:account.role === 'admin',
    role:account.role,
    permissions:normalizeUserPermissions(account.permissions)
  };
}

function isAdmin(){
  const user = getCurrentUser();
  return !!(user && (user.isAdmin === true || user.role === 'admin'));
}

function isFacilities(){
  const user = getCurrentUser();
  return !!(user && user.role === 'facilities');
}

function hasManagementPermission(permission){
  if(isAdmin()) return true;
  const user = getCurrentUser();
  return !!(user && user.permissions && user.permissions[permission] === true);
}

function canAccessManagement(){
  return isAdmin() || ['reservations','fleet','blocks','reports'].some(hasManagementPermission);
}

function canManageReservations(){
  return hasManagementPermission('reservations');
}

function canManageFleet(){
  return hasManagementPermission('fleet');
}

function canManageBlocks(){
  return hasManagementPermission('blocks');
}

function canViewReports(){
  return hasManagementPermission('reports');
}

function canAccessAdminSection(section){
  if(isAdmin()) return true;
  const permissionBySection = {
    reservas:'reservations',
    frota:'fleet',
    bloqueios:'blocks',
    relatorios:'reports'
  };
  return !!permissionBySection[section] && hasManagementPermission(permissionBySection[section]);
}

const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const loginNomeInput = document.getElementById('loginNome');
const loginEmailInput = document.getElementById('loginEmail');

const headerUserName = document.getElementById('headerUserName');
const avatarInitials = document.getElementById('avatarInitials');
const solicitanteHint = document.getElementById('solicitanteHint');
const adminTabBtn = document.getElementById('adminTabBtn');

const profileBtn = document.getElementById('profileBtn');
const profileModal = document.getElementById('profileModal');
const profileCloseBtn = document.getElementById('profileCloseBtn');
const profileAvatarLg = document.getElementById('profileAvatarLg');
const profileName = document.getElementById('profileName');
const profileRole = document.getElementById('profileRole');
const logoutBtn = document.getElementById('logoutBtn');

function configureManagementPanel(){
  const orderedSections = ['reservas','frota','bloqueios','relatorios','auditoria','regras','usuarios'];
  const firstAllowedSection = orderedSections.find(canAccessAdminSection) || 'reservas';
  document.querySelectorAll('.admin-section-btn').forEach(btn => {
    const section = btn.getAttribute('data-admin-section');
    btn.classList.toggle('hidden', !canAccessAdminSection(section));
    btn.classList.toggle('active', section === firstAllowedSection);
  });
  document.querySelectorAll('.admin-section-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== 'admin-section-' + firstAllowedSection);
  });
  const title = document.getElementById('managementPanelTitle');
  if(title){
    title.textContent = isAdmin() ? 'Painel de Administração' :
      (isFacilities() ? 'Painel de Facilities' : 'Painel de Gestão');
  }
  const newReservationBtn = document.getElementById('adminNovaReservaBtn');
  if(newReservationBtn){
    newReservationBtn.textContent = isAdmin() ? 'Nova reserva (como admin)' :
      (isFacilities() ? 'Nova reserva (Facilities)' : 'Nova reserva (gestão)');
  }
}

function setLoginError(fieldId, message){
  const field = document.getElementById('field-' + fieldId);
  const errorEl = document.getElementById('error-' + fieldId);
  if(message){
    field.classList.add('invalid');
    errorEl.textContent = message;
  } else {
    field.classList.remove('invalid');
    errorEl.textContent = '';
  }
}

function showApp(user){
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  headerUserName.textContent = user.nome;
  avatarInitials.textContent = initials(user.nome);
  profileName.textContent = user.nome;
  profileAvatarLg.textContent = initials(user.nome);
  if(profileRole){
    profileRole.textContent = isAdmin() ? 'Administrador' :
      (isFacilities() ? 'Facilities' : (canAccessManagement() ? 'Gestão personalizada' : 'Usuário'));
  }
  solicitanteHint.textContent = 'Reservando como: ' + user.nome;
  adminTabBtn.textContent = isFacilities() ? 'Facilities' : (isAdmin() ? 'Admin' : 'Gestão');
  adminTabBtn.setAttribute(
    'data-mobile-label',
    isFacilities() ? 'Facilities' : (isAdmin() ? 'Admin' : 'Gestão')
  );
  adminTabBtn.classList.toggle('hidden', !canAccessManagement());
  configureManagementPanel();
  switchTab('minhas');
  renderMyReservations();
  renderCarSelector();
  renderMainCalendar();
  renderAvailableRides();
}

function showLogin(){
  appScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginForm.reset();
  adminTabBtn.classList.add('hidden');
}

loginForm.addEventListener('submit', async function(e){
  e.preventDefault();
  setLoginError('loginNome', '');
  setLoginError('loginEmail', '');

  const nome = loginNomeInput.value.trim();
  const senha = loginEmailInput.value.trim();
  let valid = true;

  if(!nome){
    setLoginError('loginNome', 'Informe seu usuário.');
    valid = false;
  }
  if(!senha){
    setLoginError('loginEmail', 'Informe sua senha.');
    valid = false;
  }

  if(!valid) return;

  try{
    const authentication = await apiRequest('/api/auth/login', {
      method:'POST',
      body:{ username:nome, password:senha }
    });
    const user = accountToSession(authentication.user);
    setCurrentUser(user);
    await hydrateDatabaseState();
    showApp(user);
  }catch(error){
    clearCurrentUser();
    setLoginError('loginEmail', error.message || 'Usuário ou senha incorretos.');
  }
});

profileBtn.addEventListener('click', function(){
  profileModal.classList.remove('hidden');
});

profileCloseBtn.addEventListener('click', function(){
  profileModal.classList.add('hidden');
});

profileModal.addEventListener('click', function(e){
  if(e.target === profileModal) profileModal.classList.add('hidden');
});

logoutBtn.addEventListener('click', async function(){
  try{
    await apiRequest('/api/auth/logout', { method:'POST' });
  }catch(error){
    console.error('Falha ao encerrar sessão no servidor:', error);
  }
  databaseHydrated = false;
  clearCurrentUser();
  profileModal.classList.add('hidden');
  showLogin();
});

/* =========================================================
   Navegação por abas
   ========================================================= */
const tabsNav = document.getElementById('tabsNav');
const mobileNavToggle = document.getElementById('mobileNavToggle');
const mobileNavCurrent = document.getElementById('mobileNavCurrent');
const myNewReservationBtn = document.getElementById('myNewReservationBtn');
const panels = {
  nova: document.getElementById('panel-nova'),
  calendario: document.getElementById('panel-calendario'),
  minhas: document.getElementById('panel-minhas'),
  caronas: document.getElementById('panel-caronas'),
  admin: document.getElementById('panel-admin')
};

function setMobileNavOpen(open){
  const expanded = !!open;
  tabsNav.classList.toggle('mobile-collapsed', !expanded);
  mobileNavToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function switchTab(tabName){
  if(tabName === 'admin' && !canAccessManagement()) return;
  appScreen.classList.toggle('calendar-mobile-view', tabName === 'calendario');
  Object.keys(panels).forEach(key => {
    panels[key].classList.toggle('hidden', key !== tabName);
  });
  tabsNav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  const selectedButton = tabsNav.querySelector('.tab-btn[data-tab="' + tabName + '"]');
  if(selectedButton){
    mobileNavCurrent.textContent = selectedButton.textContent.trim();
  }
  if(window.matchMedia('(max-width:480px)').matches){
    setMobileNavOpen(false);
  }
  if(tabName === 'minhas') renderMyReservations();
  if(tabName === 'calendario'){ renderCarSelector(); renderMainCalendar(); }
  if(tabName === 'caronas') renderAvailableRides();
  if(tabName === 'admin'){
    const activeSection = document.querySelector('.admin-section-btn.active:not(.hidden)');
    if(activeSection && typeof renderAdminSection === 'function'){
      renderAdminSection(activeSection.getAttribute('data-admin-section'));
    }
  }
}

myNewReservationBtn.addEventListener('click', function(){
  switchTab('nova');
  if(typeof showMobileReservationStep === 'function'){
    showMobileReservationStep(1, false);
  }
  if(typeof window.scrollTo === 'function'){
    window.scrollTo({ top:0, behavior:'smooth' });
  }
});

mobileNavToggle.addEventListener('click', function(){
  setMobileNavOpen(this.getAttribute('aria-expanded') !== 'true');
});

tabsNav.addEventListener('click', function(e){
  const btn = e.target.closest('.tab-btn');
  if(!btn) return;
  switchTab(btn.getAttribute('data-tab'));
});

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') setMobileNavOpen(false);
});
