const siteDialogModal = document.getElementById('siteDialogModal');
const siteDialogCard = document.getElementById('siteDialogCard');
const siteDialogIcon = document.getElementById('siteDialogIcon');
const siteDialogTitle = document.getElementById('siteDialogTitle');
const siteDialogMessage = document.getElementById('siteDialogMessage');
const siteDialogInputWrap = document.getElementById('siteDialogInputWrap');
const siteDialogInput = document.getElementById('siteDialogInput');
const siteDialogCloseBtn = document.getElementById('siteDialogCloseBtn');
const siteDialogCancelBtn = document.getElementById('siteDialogCancelBtn');
const siteDialogConfirmBtn = document.getElementById('siteDialogConfirmBtn');
let siteDialogQueue = Promise.resolve();

const SITE_DIALOG_ICONS = {
  info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v6M12 7h.01"></path></svg>',
  warning:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4M12 17h.01"></path></svg>',
  danger:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6M15 9l-6 6"></path></svg>',
  success:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path></svg>'
};

function openSiteDialog(options){
  const settings = options || {};
  const run = () => new Promise(resolve => {
    const type = ['info','warning','danger','success'].includes(settings.type)
      ? settings.type
      : 'warning';
    const previousFocus = document.activeElement;
    siteDialogCard.className = 'modal-card site-dialog-card site-dialog-' + type;
    siteDialogIcon.className = 'site-dialog-icon ' + type;
    siteDialogIcon.innerHTML = SITE_DIALOG_ICONS[type];
    siteDialogTitle.textContent = settings.title || (type === 'danger' ? 'Atenção' : 'Aviso');
    siteDialogMessage.textContent = String(settings.message || '');
    siteDialogConfirmBtn.textContent = settings.confirmText || 'Entendi';
    siteDialogConfirmBtn.className = 'submit-btn site-dialog-confirm' + (type === 'danger' ? ' danger' : '');
    siteDialogCancelBtn.textContent = settings.cancelText || 'Cancelar';
    siteDialogCancelBtn.classList.toggle('hidden', settings.cancelable !== true);
    siteDialogInputWrap.classList.toggle('hidden', settings.input !== true);
    siteDialogInput.value = settings.inputValue || '';
    siteDialogInput.placeholder = settings.inputPlaceholder || '';
    siteDialogModal.classList.remove('hidden');

    let finished = false;
    function finish(confirmed){
      if(finished) return;
      finished = true;
      document.removeEventListener('keydown', onKeyDown);
      siteDialogModal.classList.add('hidden');
      if(previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      resolve({ confirmed:!!confirmed, value:siteDialogInput.value.trim() });
    }
    function onKeyDown(event){
      if(event.key === 'Escape' && settings.cancelable === true) finish(false);
      if(event.key === 'Enter' && document.activeElement !== siteDialogCancelBtn) finish(true);
    }
    siteDialogCloseBtn.onclick = () => finish(false);
    siteDialogCancelBtn.onclick = () => finish(false);
    siteDialogConfirmBtn.onclick = () => finish(true);
    siteDialogModal.onclick = event => {
      if(event.target === siteDialogModal && settings.cancelable === true) finish(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      if(settings.input === true) siteDialogInput.focus();
      else siteDialogConfirmBtn.focus();
    }, 0);
  });
  const result = siteDialogQueue.then(run, run);
  siteDialogQueue = result.catch(() => {});
  return result;
}

function showSiteAlert(message, options){
  return openSiteDialog({ ...(options || {}), message, cancelable:false }).then(() => undefined);
}

function showSiteConfirm(message, options){
  return openSiteDialog({
    confirmText:'Confirmar',
    ...(options || {}),
    message,
    cancelable:true
  }).then(result => result.confirmed);
}

function showSitePrompt(message, options){
  return openSiteDialog({
    confirmText:'Continuar',
    ...(options || {}),
    message,
    cancelable:true,
    input:true
  }).then(result => result.confirmed ? result.value : null);
}
