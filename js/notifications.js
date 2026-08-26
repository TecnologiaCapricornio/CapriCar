let notificationItems = [];
let notificationPollTimer = null;

const notificationCenter = document.getElementById('notificationCenter');
const notificationBell = document.getElementById('notificationBell');
const notificationBadge = document.getElementById('notificationBadge');
const notificationPanel = document.getElementById('notificationPanel');
const notificationList = document.getElementById('notificationList');
const notificationUnreadLabel = document.getElementById('notificationUnreadLabel');
const notificationReadAllBtn = document.getElementById('notificationReadAllBtn');

function notificationTimeLabel(value){
  const timestamp = new Date(value).getTime();
  if(!Number.isFinite(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if(seconds < 60) return 'agora';
  if(seconds < 3600) return 'há ' + Math.floor(seconds / 60) + ' min';
  if(seconds < 86400) return 'há ' + Math.floor(seconds / 3600) + ' h';
  if(seconds < 604800) return 'há ' + Math.floor(seconds / 86400) + ' dia' + (seconds >= 172800 ? 's' : '');
  return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
    .format(new Date(timestamp));
}

function notificationIcon(type){
  if(type === 'pickup_overdue') return 'key';
  if(type === 'reservation_upcoming') return 'clock';
  if(type === 'passenger_added') return 'ride';
  if(type === 'operation_report') return 'report';
  return 'cancel';
}

function renderNotifications(){
  if(!notificationList) return;
  const unread = notificationItems.filter(item => !item.read).length;
  notificationBadge.textContent = unread > 99 ? '99+' : String(unread);
  notificationBadge.classList.toggle('hidden', unread === 0);
  notificationUnreadLabel.textContent = unread === 0
    ? 'Nenhuma não lida'
    : unread + ' não lida' + (unread === 1 ? '' : 's');
  notificationReadAllBtn.disabled = unread === 0;
  notificationList.replaceChildren();
  if(!notificationItems.length){
    const empty = document.createElement('div');
    empty.className = 'notification-empty';
    empty.textContent = 'Você não possui notificações.';
    notificationList.appendChild(empty);
    return;
  }
  notificationItems.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notification-item' + (item.read ? '' : ' unread');
    button.dataset.notificationId = item.id;
    const icon = document.createElement('span');
    icon.className = 'notification-item-icon ' + notificationIcon(item.type);
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.type === 'pickup_overdue' ? '🔑' :
      (item.type === 'reservation_upcoming' ? '◷' :
        (item.type === 'passenger_added' ? '👥' :
          (item.type === 'operation_report' ? '⚠' : '×')));
    const copy = document.createElement('span');
    copy.className = 'notification-item-copy';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const message = document.createElement('span');
    message.textContent = item.message;
    const time = document.createElement('small');
    time.textContent = notificationTimeLabel(item.createdAt);
    copy.append(title, message, time);
    button.append(icon, copy);
    notificationList.appendChild(button);
  });
}

async function refreshNotifications(){
  if(!getCurrentUser()) return;
  try{
    const payload = await apiRequest('/api/notifications');
    notificationItems = Array.isArray(payload.notifications) ? payload.notifications : [];
    renderNotifications();
  }catch(error){
    if(error.status !== 401) console.warn('Não foi possível atualizar as notificações:', error);
  }
}

async function markNotificationRead(id){
  const item = notificationItems.find(entry => String(entry.id) === String(id));
  if(!item || item.read) return;
  item.read = true;
  renderNotifications();
  try{
    await apiRequest('/api/notifications/' + encodeURIComponent(id) + '/read', { method:'PATCH' });
  }catch(error){
    item.read = false;
    renderNotifications();
  }
}

function closeNotificationPanel(){
  notificationPanel.classList.add('hidden');
  notificationBell.setAttribute('aria-expanded', 'false');
}

function initializeNotifications(){
  if(notificationPollTimer) clearInterval(notificationPollTimer);
  refreshNotifications();
  notificationPollTimer = setInterval(refreshNotifications, 60000);
}

function stopNotifications(){
  if(notificationPollTimer) clearInterval(notificationPollTimer);
  notificationPollTimer = null;
  notificationItems = [];
  closeNotificationPanel();
  renderNotifications();
}

notificationBell.addEventListener('click', function(event){
  event.stopPropagation();
  const opening = notificationPanel.classList.contains('hidden');
  notificationPanel.classList.toggle('hidden', !opening);
  notificationBell.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if(opening) refreshNotifications();
});

const NOTIFICATION_TAB_BY_TYPE = {
  reservation_upcoming:'minhas',
  pickup_overdue:'minhas',
  passenger_added:'minhas',
  passenger_cancelled:'minhas',
  admin_cancelled:'minhas',
  passenger_joined:'minhas',
  ride_watch_match:'caronas',
  operation_report:'admin'
};

function navigateToNotificationTarget(type){
  const tab = NOTIFICATION_TAB_BY_TYPE[type];
  if(!tab || typeof switchTab !== 'function') return;
  switchTab(tab);
  if(type === 'operation_report'){
    const reservasBtn = document.querySelector('[data-admin-section="reservas"]');
    if(reservasBtn) reservasBtn.click();
  }
}

notificationPanel.addEventListener('click', function(event){
  event.stopPropagation();
  const item = event.target.closest('.notification-item');
  if(!item) return;
  const notificationId = item.dataset.notificationId;
  markNotificationRead(notificationId);
  const notification = notificationItems.find(entry => String(entry.id) === String(notificationId));
  if(notification){
    navigateToNotificationTarget(notification.type);
    closeNotificationPanel();
  }
});

notificationReadAllBtn.addEventListener('click', async function(){
  notificationItems.forEach(item => { item.read = true; });
  renderNotifications();
  try{
    await apiRequest('/api/notifications/read-all', { method:'POST' });
  }catch(error){
    refreshNotifications();
  }
});

document.addEventListener('click', function(event){
  if(notificationCenter && !notificationCenter.contains(event.target)) closeNotificationPanel();
});

document.addEventListener('visibilitychange', function(){
  if(!document.hidden && getCurrentUser()) refreshNotifications();
});
