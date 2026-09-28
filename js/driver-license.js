/* =========================================================
   CNH do usuário (aba "Meu perfil")

   A CNH não é digitada: o usuário envia o PDF da e-CNH e o servidor
   confere a assinatura digital do DETRAN, lê número, categoria e
   validade e devolve o resultado (ver server/ecnh/). O arquivo vai
   direto para POST /api/profile/cnh/e-cnh e não é guardado nem aqui
   nem lá - por isso não há pré-visualização nem cópia local.

   O servidor também é a fonte da verdade do estado de vencimento:
   esta tela só renderiza o que /api/profile/cnh devolve (status,
   mensagem, dias restantes), para portal, e-mail e notificação
   dizerem sempre a mesma coisa.
   ========================================================= */

const cnhArquivoInput = document.getElementById('cnhArquivo');
const cnhArquivoLabel = document.getElementById('cnhArquivoLabel');
const cnhArquivoTexto = document.getElementById('cnhArquivoTexto');
const cnhImportTitle = document.getElementById('cnhImportTitle');
const cnhImportStatus = document.getElementById('cnhImportStatus');
const cnhSummaryEl = document.getElementById('cnhSummary');
const cnhResumoNumero = document.getElementById('cnhResumoNumero');
const cnhResumoCategoria = document.getElementById('cnhResumoCategoria');
const cnhResumoValidade = document.getElementById('cnhResumoValidade');
const cnhVerificadaEl = document.getElementById('cnhVerificada');
const cnhErrorEl = document.getElementById('cnhError');
const cnhAlertEl = document.getElementById('cnhAlert');
const cnhDriveBadge = document.getElementById('cnhDriveBadge');
const cnhRemoverBtn = document.getElementById('cnhRemoverBtn');
const cnhCategoriaPreviewEl = document.getElementById('cnhCategoriaPreview');
const cnhCategoriaGuiaBtn = document.getElementById('cnhCategoriaGuiaBtn');
const cnhCategoriaLegendEl = document.getElementById('cnhCategoriaLegend');

// Mesmo limite de server/ecnh/index.js - conferido aqui só para avisar antes
// de enviar; quem decide é o servidor.
const MAX_ECNH_BYTES = 2 * 1024 * 1024;

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

// Mesmo aviso usado nos dois pontos que bloqueiam por CNH: ao tentar abrir
// "Nova Reserva" (js/auth.js, switchTab) e, como rede de segurança, no envio
// do formulário (js/reservations.js) - a CNH pode vencer no meio da sessão.
function showCnhRequiredAlert(){
  return showSiteAlert(
    'Para reservar um veículo como motorista é preciso ter uma CNH válida cadastrada. ' +
    'Abra "Meu perfil" para cadastrar a sua.',
    { title:'CNH obrigatória', type:'warning' }
  );
}

// Mesma checagem de categoria vs. capacidade usada em js/reservations.js
// (lá como erro inline no campo do carro), aqui como diálogo - o atalho de
// reserva rápida não tem um campo de carro próprio para anexar o erro.
function checkCnhCategoriaParaVeiculo(vehicle){
  if(!vehicle || typeof cnhAtendeCapacidade !== 'function') return true;
  const licenseState = typeof getLicenseState === 'function' ? getLicenseState() : null;
  // licenseState null = a CNH ainda não terminou de carregar (loadDriverLicense
  // roda em segundo plano, sem esperar em showApp) - nesse instante ainda não dá
  // pra saber a categoria, então não bloqueia (mesmo critério de
  // refreshDriverGate, em js/reservations.js). Sem isto, tentar reservar rápido
  // demais pelo calendário logo após o login acusava falta de CNH mesmo para
  // quem já tem uma cadastrada.
  if(licenseState === null) return true;
  const categoria = licenseState.cnh ? licenseState.cnh.categoria : '';
  if(cnhAtendeCapacidade(categoria, vehicle.capacidade)) return true;
  const minima = cnhCategoriaMinimaPara(vehicle.capacidade);
  showSiteAlert(
    'Este veículo (' + vehicle.capacidade + ' lugares) exige CNH categoria ' + minima + ' ou superior.' +
    (categoria ? ' Sua CNH é categoria ' + categoria + '.' : ' Cadastre sua CNH em "Meu perfil".'),
    { title:'Categoria da CNH insuficiente', type:'warning' }
  );
  return false;
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

// Card "Reservando como" da Nova Reserva - nome de quem está reservando,
// mais categoria e validade da CNH (quando cadastrada), pra já dar essa
// informação sem precisar abrir "Meu perfil". Chamado tanto no login
// (antes da CNH terminar de carregar) quanto sempre que ela muda.
// solicitanteHint vem de js/auth.js, carregado depois deste arquivo - só é
// lido dentro de uma função, chamada bem depois de todo script carregado.
function updateSolicitanteHint(){
  if(!solicitanteHint) return;
  const user = getCurrentUser();
  if(!user){
    solicitanteHint.innerHTML = '';
    return;
  }
  const avatarHTML = '<span class="avatar">' + escapeHTML(initials(user.nome)) + '</span>';
  const nameHTML = '<strong>' + escapeHTML(user.nome) + '</strong>';

  // A CNH ainda não terminou de carregar (loadDriverLicense roda em segundo
  // plano) - mostra só o nome em vez de "não cadastrada" por um instante.
  if(currentLicenseState === null){
    solicitanteHint.innerHTML = avatarHTML + '<div class="solicitante-info">' + nameHTML + '</div>';
    return;
  }

  const cnh = currentLicenseState.cnh;
  let tagsHTML;
  if(!cnh || !cnh.categoria){
    tagsHTML = '<span class="tag tag-warning">CNH não cadastrada</span>';
  } else {
    const categoriaTag = '<span class="tag tag-info">Categoria ' + escapeHTML(cnh.categoria) + '</span>';
    const validadeTag = cnh.validade
      ? '<span class="tag ' + (currentLicenseState.status === 'valida' ? 'tag-success' :
          (currentLicenseState.status === 'vencendo' ? 'tag-warning' : 'tag-danger')) + '">' +
        (currentLicenseState.status === 'valida' ? 'Válida até ' :
          (currentLicenseState.status === 'vencendo' ? 'Vence em ' : 'Vencida em ')) +
        escapeHTML(formatDate(cnh.validade)) + '</span>'
      : '';
    tagsHTML = categoriaTag + validadeTag;
  }
  solicitanteHint.innerHTML = avatarHTML + '<div class="solicitante-info">' + nameHTML +
    '<div class="solicitante-tags">' + tagsHTML + '</div></div>';
}

// Ícone + veículos permitidos da categoria escolhida - atualiza tanto ao
// carregar uma CNH já salva quanto a cada troca no <select>, antes mesmo de
// salvar (ver listener mais abaixo).
function renderCategoriaPreview(categoria){
  if(!cnhCategoriaPreviewEl) return;
  cnhCategoriaPreviewEl.innerHTML = typeof cnhCategoriaPreviewHTML === 'function'
    ? cnhCategoriaPreviewHTML(categoria)
    : '';
}

function renderLicenseSummary(cnh){
  const temCnh = !!(cnh && cnh.numero);
  cnhSummaryEl.classList.toggle('hidden', !temCnh);
  cnhVerificadaEl.classList.toggle('hidden', !temCnh);
  if(!temCnh){
    cnhResumoNumero.textContent = '';
    cnhResumoCategoria.textContent = '';
    cnhResumoValidade.textContent = '';
    cnhVerificadaEl.textContent = '';
    return;
  }
  cnhResumoNumero.textContent = cnh.numero;
  cnhResumoCategoria.textContent = cnh.categoria;
  cnhResumoValidade.textContent = formatDate(cnh.validade);
  cnhVerificadaEl.textContent = 'Importada da e-CNH' +
    (cnh.emissor ? ' assinada por ' + cnh.emissor : '') +
    (cnh.verificadaEm ? ' em ' + formatDate(cnh.verificadaEm.slice(0, 10)) : '') + '.';
}

function setImportBusy(busy, message){
  cnhArquivoInput.disabled = busy;
  cnhArquivoLabel.classList.toggle('is-busy', busy);
  cnhArquivoLabel.setAttribute('aria-disabled', busy ? 'true' : 'false');
  cnhImportStatus.classList.toggle('hidden', !message);
  cnhImportStatus.textContent = message || '';
}

function renderLicense(state){
  currentLicenseState = state;
  const cnh = state && state.cnh;

  renderLicenseSummary(cnh);
  renderCategoriaPreview(cnh ? cnh.categoria : '');
  cnhErrorEl.textContent = '';
  cnhImportTitle.textContent = cnh ? 'Atualizar com uma nova e-CNH' : 'Importar e-CNH';

  renderCnhAlert(state);
  renderDriveBadge(state);
  if(cnhRemoverBtn) cnhRemoverBtn.classList.toggle('hidden', !cnh);

  // A trava de "só motorista com CNH" vive em js/reservations.js.
  if(typeof refreshDriverGate === 'function') refreshDriverGate();
  updateSolicitanteHint();
}

async function loadDriverLicense(){
  if(!getCurrentUser()) return;
  try{
    renderLicense(await apiRequest('/api/profile/cnh'));
  }catch(error){
    currentLicenseState = null;
  }
}

async function importECnh(file){
  cnhErrorEl.textContent = '';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if(!isPdf){
    cnhErrorEl.textContent = 'Selecione o arquivo PDF da e-CNH exportado pelo aplicativo Carteira Digital de Trânsito.';
    return;
  }
  if(file.size > MAX_ECNH_BYTES){
    cnhErrorEl.textContent = 'O arquivo é maior que 2 MB. Envie o PDF original exportado pelo aplicativo.';
    return;
  }

  setImportBusy(true, 'Conferindo a assinatura digital e lendo os dados da e-CNH...');
  try{
    // O File vai como corpo bruto (application/pdf), sem base64 nem cópia.
    const state = await apiRequest('/api/profile/cnh/e-cnh', {
      method:'POST',
      headers:{ 'Content-Type':'application/pdf' },
      body:file
    });
    setImportBusy(false);
    renderLicense(state);
    const cnh = state.cnh;
    await showSiteAlert(
      'Dados lidos da sua e-CNH: categoria ' + cnh.categoria + ', válida até ' + formatDate(cnh.validade) +
      '. O arquivo não foi armazenado.',
      { title:'CNH importada', type:'success' }
    );
  }catch(error){
    setImportBusy(false);
    cnhErrorEl.textContent = error.message;
  }
}

if(cnhArquivoInput){
  cnhArquivoInput.addEventListener('change', function(){
    const file = cnhArquivoInput.files && cnhArquivoInput.files[0];
    // Limpa a seleção na hora: permite escolher o mesmo arquivo de novo e
    // não deixa o documento preso no campo depois do envio.
    cnhArquivoInput.value = '';
    if(file) importECnh(file);
  });
}

if(cnhCategoriaGuiaBtn && cnhCategoriaLegendEl){
  cnhCategoriaGuiaBtn.addEventListener('click', function(){
    const abrindo = cnhCategoriaLegendEl.classList.contains('hidden');
    if(abrindo && !cnhCategoriaLegendEl.dataset.populated){
      cnhCategoriaLegendEl.innerHTML = typeof cnhCategoriaLegendHTML === 'function' ? cnhCategoriaLegendHTML() : '';
      cnhCategoriaLegendEl.dataset.populated = '1';
    }
    cnhCategoriaLegendEl.classList.toggle('hidden', !abrindo);
    cnhCategoriaGuiaBtn.textContent = abrindo ? 'Ocultar guia de categorias' : 'Ver guia de categorias';
  });
}

if(cnhRemoverBtn){
  cnhRemoverBtn.addEventListener('click', async function(){
    const confirmado = await showSiteConfirm(
      'Remover os dados da sua CNH? Sem CNH cadastrada você deixa de poder reservar veículo como motorista.',
      { title:'Remover CNH', confirmText:'Sim, remover', type:'warning' }
    );
    if(!confirmado) return;
    try{
      renderLicense(await apiRequest('/api/profile/cnh', { method:'DELETE' }));
    }catch(error){
      cnhErrorEl.textContent = error.message;
    }
  });
}
