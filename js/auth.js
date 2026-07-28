/* Autenticação local, perfil e navegação por abas */
/* =========================================================
   Autenticação simples (usuário + senha local, sem validação real).
   A senha não é armazenada; apenas o nome é usado como identificador.
   ========================================================= */
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

// Retorna true quando o usuário atualmente logado é o administrador.
// Deve ser usado em TODAS as checagens de permissão de admin (nunca comparar
// strings "admin" soltas pelo código).
function isAdmin(){
  const user = getCurrentUser();
  return !!(user && user.isAdmin === true);
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
const logoutBtn = document.getElementById('logoutBtn');

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
  solicitanteHint.textContent = 'Reservando como: ' + user.nome;
  adminTabBtn.classList.toggle('hidden', !isAdmin());
  switchTab('nova');
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

loginForm.addEventListener('submit', function(e){
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

  // A senha é usada apenas para autenticação local e NUNCA é armazenada no
  // localStorage. Exceção: o usuário "admin" exige a senha exata definida
  // abaixo; qualquer outro usuário aceita qualquer senha (comportamento legado).
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = 'Dimitri@24';
  const isAdminUsername = nome.toLowerCase() === ADMIN_USERNAME;

  if(isAdminUsername && senha !== ADMIN_PASSWORD){
    setLoginError('loginEmail', 'Senha incorreta.');
    return;
  }

  const user = { nome: nome, email: '', isAdmin: isAdminUsername };
  setCurrentUser(user);
  showApp(user);
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

logoutBtn.addEventListener('click', function(){
  clearCurrentUser();
  profileModal.classList.add('hidden');
  showLogin();
});

/* =========================================================
   Navegação por abas
   ========================================================= */
const tabsNav = document.getElementById('tabsNav');
const panels = {
  nova: document.getElementById('panel-nova'),
  calendario: document.getElementById('panel-calendario'),
  minhas: document.getElementById('panel-minhas'),
  caronas: document.getElementById('panel-caronas'),
  admin: document.getElementById('panel-admin')
};

function switchTab(tabName){
  if(tabName === 'admin' && !isAdmin()) return; // bloqueia acesso à aba Admin para não-admins
  Object.keys(panels).forEach(key => {
    panels[key].classList.toggle('hidden', key !== tabName);
  });
  tabsNav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  if(tabName === 'minhas') renderMyReservations();
  if(tabName === 'calendario'){ renderCarSelector(); renderMainCalendar(); }
  if(tabName === 'caronas') renderAvailableRides();
  if(tabName === 'admin') renderAdminTab();
}

tabsNav.addEventListener('click', function(e){
  const btn = e.target.closest('.tab-btn');
  if(!btn) return;
  switchTab(btn.getAttribute('data-tab'));
});
