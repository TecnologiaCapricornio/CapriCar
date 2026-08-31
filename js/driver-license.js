/* =========================================================
   CNH do usuário (aba "Meu perfil")

   O servidor é a fonte da verdade do estado de vencimento: esta tela só
   renderiza o que /api/profile/cnh devolve (status, mensagem, dias
   restantes). Não recalcular a regra aqui é o que garante que portal,
   e-mail e notificação digam sempre a mesma coisa.
   ========================================================= */

const cnhForm = document.getElementById('cnhForm');
const cnhNumeroInput = document.getElementById('cnhNumero');
const cnhCategoriaSelect = document.getElementById('cnhCategoria');
const cnhValidadeInput = document.getElementById('cnhValidade');
const cnhFrenteInput = document.getElementById('cnhFrente');
const cnhVersoInput = document.getElementById('cnhVerso');
const cnhFrenteEstado = document.getElementById('cnhFrenteEstado');
const cnhVersoEstado = document.getElementById('cnhVersoEstado');
const cnhErrorEl = document.getElementById('cnhError');
const cnhAlertEl = document.getElementById('cnhAlert');
const cnhDriveBadge = document.getElementById('cnhDriveBadge');
const cnhRemoverBtn = document.getElementById('cnhRemoverBtn');

const MAX_CNH_PHOTO_BYTES = 1024 * 1024;

// Último payload recebido do servidor. Outras telas (nova reserva, cartão do
// painel) consultam por aqui em vez de refazer a chamada.
let currentLicenseState = null;

function getLicenseState(){
  return currentLicenseState;
}

// Só quem tem CNH válida (ou vencendo) pode figurar como motorista.
function userCanDrive(){
  return !!currentLicenseState &&
    (currentLicenseState.status === 'valida' || currentLicenseState.status === 'vencendo');
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
    reader.readAsDataURL(file);
  });
}

function renderCnhAlert(state){
  if(!cnhAlertEl) return;
  if(!state || !state.mensagem){
    cnhAlertEl.className = 'hidden';
    cnhAlertEl.textContent = '';
    return;
  }
  // Vencida é erro; vencendo é atenção. Usa a tabela de variantes de
  // css/components.css, sem cor solta.
  cnhAlertEl.className = state.status === 'vencida' ? 'notice notice-danger' : 'notice notice-warning';
  cnhAlertEl.textContent = state.mensagem;
}

function renderDriveBadge(state){
  if(!cnhDriveBadge) return;
  const podeDirigir = state && (state.status === 'valida' || state.status === 'vencendo');
  cnhDriveBadge.className = 'tag ' + (podeDirigir ? 'tag-success' : 'tag-info');
  cnhDriveBadge.textContent = podeDirigir ? 'Pode dirigir' : 'Apenas passageiro';
}

function renderPhotoState(el, enviada, userId, lado){
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

function renderLicense(state){
  currentLicenseState = state;
  const cnh = state && state.cnh;
  const user = getCurrentUser();

  if(cnhCategoriaSelect && !cnhCategoriaSelect.dataset.populated && state && state.categorias){
    cnhCategoriaSelect.innerHTML = '<option value="">Selecione...</option>' +
      state.categorias.map(c => '<option value="' + escapeHTML(c) + '">' + escapeHTML(c) + '</option>').join('');
    cnhCategoriaSelect.dataset.populated = '1';
  }

  cnhNumeroInput.value = cnh ? cnh.numero : '';
  cnhCategoriaSelect.value = cnh ? cnh.categoria : '';
  cnhValidadeInput.value = cnh ? cnh.validade : '';
  cnhFrenteInput.value = '';
  cnhVersoInput.value = '';
  cnhErrorEl.textContent = '';

  renderPhotoState(cnhFrenteEstado, cnh && cnh.fotos.frente, user && user.id, 'frente');
  renderPhotoState(cnhVersoEstado, cnh && cnh.fotos.verso, user && user.id, 'verso');
  renderCnhAlert(state);
  renderDriveBadge(state);
  if(cnhRemoverBtn) cnhRemoverBtn.classList.toggle('hidden', !cnh);

  refreshDatePickers();
  // A trava de "só motorista com CNH" vive em js/reservations.js.
  if(typeof refreshDriverGate === 'function') refreshDriverGate();
}

async function loadDriverLicense(){
  if(!getCurrentUser()) return;
  try{
    renderLicense(await apiRequest('/api/profile/cnh'));
  }catch(error){
    currentLicenseState = null;
  }
}

// createDatePicker vem de js/modals.js, carregado depois deste arquivo -
// por isso a inicialização roda sob demanda, na primeira abertura do perfil,
// e nunca no escopo de topo.
let cnhDatePickerReady = false;
function ensureCnhDatePicker(){
  if(cnhDatePickerReady) return;
  cnhDatePickerReady = true;
  createDatePicker(cnhValidadeInput, document.getElementById('wrap-cnhValidade'), null, {
    title:'Validade da CNH'
    // Sem getMinDate: uma CNH já vencida precisa poder ser cadastrada, senão
    // não há como registrar a situação real de quem está com o documento
    // atrasado.
  });
}

if(cnhForm){
  cnhForm.addEventListener('submit', async function(event){
    event.preventDefault();
    cnhErrorEl.textContent = '';

    const numero = cnhNumeroInput.value.trim();
    const categoria = cnhCategoriaSelect.value;
    const validade = cnhValidadeInput.value;

    if(!numero || !categoria || !validade){
      cnhErrorEl.textContent = 'Informe número, categoria e validade da CNH.';
      return;
    }

    const payload = { numero, categoria, validade };

    try{
      for(const [campo, input] of [['frente', cnhFrenteInput], ['verso', cnhVersoInput]]){
        const file = input.files && input.files[0];
        if(!file) continue;
        if(file.size > MAX_CNH_PHOTO_BYTES){
          cnhErrorEl.textContent = 'Cada foto da CNH deve ter no máximo 1 MB.';
          return;
        }
        payload[campo] = await fileToDataUrl(file);
      }
    }catch(error){
      cnhErrorEl.textContent = error.message;
      return;
    }

    try{
      renderLicense(await apiRequest('/api/profile/cnh', { method:'PUT', body:payload }));
      await showSiteAlert('Dados da CNH salvos.', { title:'CNH atualizada', type:'success' });
    }catch(error){
      cnhErrorEl.textContent = error.message;
    }
  });
}

if(cnhRemoverBtn){
  cnhRemoverBtn.addEventListener('click', async function(){
    const confirmado = await showSiteConfirm(
      'Remover os dados e as fotos da sua CNH? Sem CNH cadastrada você deixa de poder reservar veículo como motorista.',
      { title:'Remover CNH', confirmText:'Sim, remover', type:'warning' }
    );
    if(!confirmado) return;
    try{
      renderLicense(await apiRequest('/api/profile/cnh', {
        method:'PUT',
        body:{ numero:'', categoria:'', validade:'' }
      }));
    }catch(error){
      cnhErrorEl.textContent = error.message;
    }
  });
}
