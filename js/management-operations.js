/* Gestão — retirada, devolução e fotos de operação */

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

