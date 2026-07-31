/* Criação, validação e listagem de reservas */
/* =========================================================
   Formulário de reserva
   ========================================================= */
const form = document.getElementById('reservaForm');
const partidaSelect = document.getElementById('partida');
const destinoSelect = document.getElementById('destino');
const destinoOutroInput = document.getElementById('destinoOutro');
const fieldCarro = document.getElementById('field-carro');
const carroSelect = document.getElementById('carro');
const dataIdaInput = document.getElementById('dataIda');
const dataVoltaInput = document.getElementById('dataVolta');
const horarioRetiradaSelect = document.getElementById('horarioRetirada');
const horarioDevolucaoSelect = document.getElementById('horarioDevolucao');
const motivoInput = document.getElementById('motivo');
const responsavelInput = document.getElementById('responsavel');
const passageirosWidget = createPassengerListWidget('passageirosListContainer');
const confirmation = document.getElementById('confirmation');
const confirmationText = document.getElementById('confirmation-text');
const myReservationsList = document.getElementById('myReservationsList');
const minhasConfirmation = document.getElementById('minhasConfirmation');
const minhasConfirmationText = document.getElementById('minhasConfirmation-text');
const reservationViewButtons = document.querySelectorAll('[data-reservation-view]');
const activeReservationsCount = document.getElementById('activeReservationsCount');
const historyReservationsCount = document.getElementById('historyReservationsCount');
const mobileReservationBackBtn = document.getElementById('mobileReservationBackBtn');
const mobileReservationNextBtn = document.getElementById('mobileReservationNextBtn');
const mobileReservationStepLabel = document.getElementById('mobileReservationStepLabel');
let mobileReservationStep = 1;
let myReservationsView = 'active';

function showCreatedReservationInMyReservations(message){
  renderMyReservations();
  minhasConfirmationText.textContent = message;
  minhasConfirmation.classList.add('show');
  switchTab('minhas');
  if(typeof window.scrollTo === 'function'){
    window.scrollTo({ top:0, behavior:'smooth' });
  }
  setTimeout(() => {
    minhasConfirmation.classList.remove('show');
  }, 6000);
}

populateHorarioOptions(horarioRetiradaSelect);
populateHorarioOptions(horarioDevolucaoSelect);

function refreshAvailableTimeOptions(){
  const selectedPickup = horarioRetiradaSelect.value;
  const selectedReturn = horarioDevolucaoSelect.value;
  const availability = getAvailableReservationTimeOptions(
    partidaSelect.value,
    carroSelect.value,
    dataIdaInput.value,
    dataVoltaInput.value,
    '',
    null
  );
  populateHorarioOptions(horarioRetiradaSelect, availability.pickup);
  if(availability.pickup.includes(selectedPickup)){
    horarioRetiradaSelect.value = selectedPickup;
  }

  const returnAvailability = getAvailableReservationTimeOptions(
    partidaSelect.value,
    carroSelect.value,
    dataIdaInput.value,
    dataVoltaInput.value,
    horarioRetiradaSelect.value,
    null
  );
  populateHorarioOptions(horarioDevolucaoSelect, returnAvailability.return);
  if(returnAvailability.return.includes(selectedReturn)){
    horarioDevolucaoSelect.value = selectedReturn;
  }

  const hasCompletePeriod = partidaSelect.value && carroSelect.value &&
    dataIdaInput.value && dataVoltaInput.value;
  if(hasCompletePeriod && !availability.pickup.length){
    setError('horarioRetirada', 'Não há horários disponíveis para este carro no período selecionado.');
  }
}

function isMobileReservationWizard(){
  return window.matchMedia('(max-width:480px)').matches;
}

function showMobileReservationStep(step, shouldScroll){
  mobileReservationStep = Math.max(1, Math.min(3, Number(step) || 1));
  form.setAttribute('data-mobile-step', String(mobileReservationStep));
  document.querySelectorAll('#mobileReservationProgress [data-progress-step]').forEach(item => {
    item.classList.toggle(
      'active',
      Number(item.getAttribute('data-progress-step')) === mobileReservationStep
    );
  });
  mobileReservationBackBtn.disabled = mobileReservationStep === 1;
  mobileReservationStepLabel.textContent = 'Etapa ' + mobileReservationStep + ' de 3';
  if(shouldScroll && isMobileReservationWizard()){
    form.closest('.card').scrollIntoView({ behavior:'smooth', block:'start' });
  }
}

function validateMobileReservationStep(step){
  if(step === 1){
    ['partida','destino','carro'].forEach(id => setError(id, ''));
    let valid = true;
    const partida = partidaSelect.value;
    const destino = getDestinoValue();
    if(!partida){
      setError('partida', 'Selecione o local de partida.');
      valid = false;
    }
    if(!destinoSelect.value){
      setError('destino', 'Selecione o destino.');
      valid = false;
    } else if(destinoSelect.value === 'Outro' && !destino){
      setError('destino', 'Digite o destino.');
      valid = false;
    } else if(partida && destino === partida){
      setError('destino', 'Destino deve ser diferente da partida.');
      valid = false;
    }
    if(partida && !carroSelect.value){
      setError('carro', 'Selecione o carro da filial de partida.');
      valid = false;
    }
    return valid;
  }

  if(step === 2){
    ['dataIda','dataVolta','horarioRetirada','horarioDevolucao','carro'].forEach(id => setError(id, ''));
    let valid = true;
    const dataIda = dataIdaInput.value;
    const dataVolta = dataVoltaInput.value;
    const retirada = horarioRetiradaSelect.value;
    const devolucao = horarioDevolucaoSelect.value;
    if(!dataIda){ setError('dataIda', 'Informe a data de ida.'); valid = false; }
    if(!dataVolta){ setError('dataVolta', 'Informe a data de volta.'); valid = false; }
    if(!retirada){ setError('horarioRetirada', 'Informe o horário de retirada.'); valid = false; }
    if(!devolucao){ setError('horarioDevolucao', 'Informe o horário de devolução.'); valid = false; }
    if(dataIda && dataVolta && dataVolta < dataIda){
      setError('dataVolta', 'A data de volta deve ser igual ou posterior à data de ida.');
      valid = false;
    }
    if(dataIda && dataVolta && dataIda === dataVolta && retirada && devolucao && devolucao <= retirada){
      setError('horarioDevolucao', 'O horário de devolução deve ser após o horário de retirada.');
      valid = false;
    }
    const currentUser = getCurrentUser();
    if(dataIda && dataVolta && currentUser){
      const ruleValidation = validateReservationRules(currentUser.nome, dataIda, dataVolta, null);
      if(!ruleValidation.ok){
        setError(ruleValidation.field, ruleValidation.message);
        valid = false;
      }
    }
    if(valid){
      const conflicts = findConflictingReservations(
        partidaSelect.value,
        carroSelect.value,
        dataIda,
        dataVolta,
        retirada,
        devolucao,
        null
      );
      if(conflicts.length){
        setError('horarioRetirada', 'Este carro já está reservado neste horário. ' + buildConflictMessage(conflicts));
        setError('horarioDevolucao', 'Escolha outro horário para continuar.');
        valid = false;
      }
      const blocks = findVehicleBlocks(
        partidaSelect.value,
        carroSelect.value,
        dataIda,
        dataVolta,
        null
      );
      if(blocks.length){
        setError('carro', 'Veículo indisponível no período selecionado.');
        valid = false;
        showMobileReservationStep(1, true);
      }
    }
    return valid;
  }

  return true;
}

mobileReservationBackBtn.addEventListener('click', function(){
  if(!isMobileReservationWizard()) return;
  showMobileReservationStep(mobileReservationStep - 1, true);
});

mobileReservationNextBtn.addEventListener('click', function(){
  if(!isMobileReservationWizard()) return;
  if(!validateMobileReservationStep(mobileReservationStep)) return;
  showMobileReservationStep(mobileReservationStep + 1, true);
});

showMobileReservationStep(1, false);

function setError(fieldId, message){
  const field = document.getElementById('field-' + fieldId) ||
    (fieldId === 'dataVolta' ? document.getElementById('field-dataIda') : null);
  const errorEl = document.getElementById('error-' + fieldId);
  if(field) field.classList.toggle('invalid', !!message);
  if(errorEl) errorEl.textContent = message || '';
}

function clearAllErrors(){
  [
    'partida','destino','carro','motivo','responsavel',
    'dataIda','dataVolta','horarioRetirada','horarioDevolucao','passageirosConfirmados'
  ].forEach(id => setError(id, ''));
}

function getDestinoValue(){
  if(destinoSelect.value === 'Outro'){
    return destinoOutroInput.value.trim();
  }
  return destinoSelect.value;
}

function toggleDestinoOutro(){
  if(destinoSelect.value === 'Outro'){
    destinoOutroInput.classList.remove('hidden');
  } else {
    destinoOutroInput.classList.add('hidden');
    destinoOutroInput.value = '';
  }
}

// Retorna um Set de datas ISO totalmente ocupadas (24h) para um carro específico
// (partida + número do carro). Um dia só entra nesse Set se a soma das faixas de
// horário reservadas nesse dia cobrir o dia inteiro (00:00 - 24:00), considerando
// inclusive múltiplas reservas diferentes no mesmo dia. Dias com apenas parte do
// horário ocupado continuam disponíveis para novas reservas em horário livre —
// o bloqueio de horário específico é feito na validação do formulário
// (findConflictingReservations), não no date picker.
function getCarReservedDates(partida, carro){
  const set = new Set();
  if(!partida || !carro) return set;

  const reservas = getReservations().filter(r =>
    !isReservationCompleted(r) && r.partida === partida && r.carro === carro
  );
  if(reservas.length === 0) return set;

  // Agrupa, por dia, todas as faixas [inicio, fim) ocupadas por qualquer reserva desse carro.
  const faixasPorDia = new Map();
  reservas.forEach(r => {
    eachDateISOInRange(r.dataIda, r.dataVolta, iso => {
      const faixa = getOccupiedMinutesRangeForDate(r, iso);
      if(!faixa) return;
      if(!faixasPorDia.has(iso)) faixasPorDia.set(iso, []);
      faixasPorDia.get(iso).push(faixa);
    });
  });

  // Para cada dia, verifica se a união das faixas cobre o dia inteiro (0 a 1440 min).
  faixasPorDia.forEach((faixas, iso) => {
    const ordenadas = faixas.slice().sort((a,b) => a.inicio - b.inicio);
    let cursor = MIN_DIA;
    for(let i = 0; i < ordenadas.length; i++){
      if(ordenadas[i].inicio > cursor) break; // há um buraco antes desta faixa
      if(ordenadas[i].fim > cursor) cursor = ordenadas[i].fim;
    }
    if(cursor >= MAX_DIA) set.add(iso);
  });

  return set;
}

function populateCarroOptions(){
  const partida = partidaSelect.value;
  const carros = getVehicles().filter(v => v.ativo !== false && v.filial === partida);
  carroSelect.innerHTML = '<option value="">Selecione...</option>' +
    carros.map(v => '<option value="' + escapeHTML(v.codigo) + '">' + escapeHTML(v.modelo || 'Veículo') + ' · ' + escapeHTML(v.codigo) + (v.placa ? ' · ' + escapeHTML(v.placa) : '') + '</option>').join('');
  carroSelect.value = '';
  if(carros.length){
    fieldCarro.classList.remove('hidden');
  } else {
    fieldCarro.classList.add('hidden');
  }
}

// Atualiza as opções do select de Destino, removendo a cidade igual à partida selecionada.
// Se o destino atual ficar inválido (era igual à nova partida), reseta o destino e esconde o campo "Outro".
function populateDestinoOptions(){
  const partida = partidaSelect.value;
  const currentDestino = destinoSelect.value;

  let html = '<option value="">Selecione...</option>';
  CIDADES.forEach(cidade => {
    if(cidade === partida) return;
    html += '<option value="' + cidade + '">' + cidade + '</option>';
  });
  html += '<option value="Outro">Outro</option>';
  destinoSelect.innerHTML = html;

  if(currentDestino && currentDestino !== partida){
    destinoSelect.value = currentDestino;
  } else {
    destinoSelect.value = '';
    toggleDestinoOutro();
  }
}

function renderReservationItem(res, opts){
  const currentUser = getCurrentUser();
  const isCreator = isReservationCreator(res, currentUser);
  const completed = isReservationCompleted(res);
  const canDelete = isCreator && !completed;
  const canLeave = !isCreator && !completed;
  const ocupantes = getOcupantes(res);
  const confirmados = getPassageirosConfirmados(res);
  const capacidade = getVehicleCapacity(res);
  const ocupacaoTexto = ocupantes + '/' + capacidade + ' ocupantes' + (confirmados > 0 ? ' (' + confirmados + ' já confirmados)' : '');
  const operacao = res.operacao || {};
  const canOperate = isCreator && !completed;
  const pickupAvailable = canRegisterPickupNow(res);
  const statusClass = operacao.devolucao || completed
    ? 'status-completed'
    : (operacao.retirada ? 'status-in-use' : 'status-waiting');
  const statusLabel = operacao.devolucao || completed
    ? 'Concluída'
    : (operacao.retirada ? 'Em uso' : 'Confirmada');
  const item = document.createElement('div');
  item.className = 'reservation-item' + (completed ? ' reservation-history-item' : '');
  item.innerHTML =
    '<div class="reservation-info">' +
      '<div class="reservation-card-top">' +
        '<div>' +
          '<div class="reservation-route">' + escapeHTML(res.partida) + ' &rarr; ' + escapeHTML(res.destino) + '</div>' +
          '<span class="reservation-car">Polo final ' + escapeHTML(res.carro) + '</span>' +
        '</div>' +
        '<span class="operation-status ' + statusClass + '">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="reservation-details reservation-period">' +
        '<span><strong>Ida</strong> ' + formatDate(res.dataIda) + (res.horarioRetirada ? ' · ' + res.horarioRetirada : '') + '</span>' +
        '<span><strong>Volta</strong> ' + formatDate(res.dataVolta) + (res.horarioDevolucao ? ' · ' + res.horarioDevolucao : '') + '</span>' +
      '</div>' +
      '<div class="reservation-card-chips">' +
        '<span class="role-badge ' + (isCreator ? 'creator' : 'passenger') + '">' + (isCreator ? 'Motorista' : 'Passageiro') + '</span>' +
        '<span class="reservation-occupants">' + PEOPLE_ICON_SVG + '<span>' + ocupacaoTexto + '</span></span>' +
      '</div>' +
      '<details class="reservation-more-details">' +
        '<summary>Ver detalhes da reserva</summary>' +
        '<div class="reservation-more-content">' +
          '<div class="reservation-name"><strong>Solicitante:</strong> ' + escapeHTML(res.nome) + '</div>' +
          '<div class="reservation-business"><strong>Motivo:</strong> ' + escapeHTML(res.motivo || 'Não informado') + '</div>' +
          '<div class="reservation-business"><strong>Responsável:</strong> ' + escapeHTML(res.responsavel || res.nome) + '</div>' +
        '</div>' +
      '</details>' +
      renderOperationDetails(res) +
    '</div>' +
    '<div class="reservation-actions">' +
      (isCreator && !operacao.retirada
        ? '<button class="edit-btn" data-id="' + escapeHTML(res.id) + '">Editar</button>'
        : '') +
      (canOperate && !operacao.retirada
        ? '<button class="operation-btn" data-phase="retirada" data-id="' + escapeHTML(res.id) + '"' +
          (pickupAvailable ? '' : ' disabled title="Disponível somente na data e no horário agendados"') +
          '>' + (pickupAvailable ? 'Registrar retirada' : 'Retirada ainda indisponível') + '</button>'
        : '') +
      (canOperate && operacao.retirada && !operacao.devolucao ? '<button class="operation-btn" data-phase="devolucao" data-id="' + escapeHTML(res.id) + '">Registrar devolução</button>' : '') +
      (canDelete && !operacao.retirada ? '<button class="delete-btn" data-id="' + escapeHTML(res.id) + '">Cancelar</button>' : '') +
      (canLeave ? '<button class="leave-btn" data-id="' + escapeHTML(res.id) + '">Sair da carona</button>' : '') +
    '</div>';
  return item;
}

function renderMyReservations(){
  const currentUser = getCurrentUser();
  if(!currentUser){
    myReservationsList.innerHTML = '<div class="empty-state">Faça login para ver suas reservas.</div>';
    return;
  }
  const participantReservations = getReservations().filter(r =>
    isPassageiro(r, currentUser.nome)
  );
  const activeList = participantReservations.filter(r => !isReservationCompleted(r));
  const historyList = participantReservations.filter(isReservationCompleted);
  activeReservationsCount.textContent = String(activeList.length);
  historyReservationsCount.textContent = String(historyList.length);
  reservationViewButtons.forEach(button => {
    button.classList.toggle(
      'active',
      button.getAttribute('data-reservation-view') === myReservationsView
    );
  });
  const list = myReservationsView === 'history' ? historyList : activeList;
  if(list.length === 0){
    myReservationsList.innerHTML = '<div class="empty-state">' +
      (myReservationsView === 'history'
        ? 'Nenhuma viagem concluída no histórico.'
        : 'Você não possui reservas ativas.') +
      '</div>';
    return;
  }
  myReservationsList.innerHTML = '';
  list.slice().sort((a, b) => {
    const aDate = String(a.dataIda || '') + 'T' + String(a.horarioRetirada || '');
    const bDate = String(b.dataIda || '') + 'T' + String(b.horarioRetirada || '');
    return myReservationsView === 'history'
      ? bDate.localeCompare(aDate)
      : aDate.localeCompare(bDate);
  }).forEach(res => {
    myReservationsList.appendChild(renderReservationItem(res));
  });
  bindDeleteButtons(myReservationsList);
  bindLeaveButtons(myReservationsList);
  bindReservationFeatureButtons(myReservationsList);
}

reservationViewButtons.forEach(button => {
  button.addEventListener('click', function(){
    myReservationsView = this.getAttribute('data-reservation-view') === 'history'
      ? 'history'
      : 'active';
    renderMyReservations();
  });
});

function bindDeleteButtons(container){
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async function(){
      const id = this.getAttribute('data-id');
      const old = getReservations().find(r => String(r.id) === String(id));
      const currentUser = getCurrentUser();
      if(!isReservationCreator(old, currentUser)){
        alert('Somente o criador pode cancelar esta reserva. Como passageiro, use “Sair da carona”.');
        renderMyReservations();
        return;
      }
      if(!confirm('Tem certeza que deseja excluir esta reserva?')) return;
      const updated = getReservations().filter(r => String(r.id) !== String(id));
      try{
        await saveReservations(updated);
      }catch(error){
        await hydrateDatabaseState();
        alert(error.message);
        renderMyReservations();
        return;
      }
      logAudit('cancelou', 'reserva', id, old ? old.partida + ' → ' + old.destino : 'Reserva cancelada');
      renderMyReservations();
      renderMainCalendar();
      renderAvailableRides();
      refreshDatePickers();
      if(isAdmin()) renderAdminTab();
    });
  });
}

function bindLeaveButtons(container){
  container.querySelectorAll('.leave-btn').forEach(btn => {
    btn.addEventListener('click', async function(){
      const currentUser = getCurrentUser();
      if(!currentUser){
        showLogin();
        return;
      }

      const id = this.getAttribute('data-id');
      const result = await removePassengerFromReservation(id, currentUser);
      if(!result){
        renderMyReservations();
        return;
      }

      const reserva = result.reserva;
      minhasConfirmationText.textContent = 'Você saiu da carona! ' + reserva.partida + ' → ' + reserva.destino + ' (Polo final ' + reserva.carro + ') de ' + formatDate(reserva.dataIda) + ' a ' + formatDate(reserva.dataVolta) + '.';
      minhasConfirmation.classList.add('show');

      renderMyReservations();
      renderMainCalendar();
      renderAvailableRides();
      checkAndShowCompatibleRides();

      setTimeout(() => {
        minhasConfirmation.classList.remove('show');
      }, 6000);
    });
  });
}

function validateForm(){
  clearAllErrors();
  let valid = true;

  const partida = partidaSelect.value;
  const destino = getDestinoValue();
  const carro = carroSelect.value;
  const dataIda = dataIdaInput.value;
  const dataVolta = dataVoltaInput.value;
  const horarioRetirada = horarioRetiradaSelect.value;
  const horarioDevolucao = horarioDevolucaoSelect.value;
  const currentUser = getCurrentUser();
  const vehicle = getVehicle(partida, carro);
  const limitePassageiros = Math.max(0, Number(vehicle && vehicle.capacidade ? vehicle.capacidade : CAPACIDADE_MAXIMA) - 1);
  const validacaoPassageiros = validarListaPassageiros(currentUser ? currentUser.nome : '', passageirosWidget.getNomes(), limitePassageiros);

  if(!partida){
    setError('partida', 'Selecione o local de partida.');
    valid = false;
  }

  if(!destinoSelect.value){
    setError('destino', 'Selecione o destino.');
    valid = false;
  } else if(destinoSelect.value === 'Outro' && !destino){
    setError('destino', 'Digite o destino.');
    valid = false;
  }

  if(partida && destino && partida === destino){
    setError('destino', 'Destino deve ser diferente da partida.');
    valid = false;
  }

  if(partida && !carro){
    setError('carro', 'Selecione o carro da filial de partida.');
    valid = false;
  }

  if(!dataIda){
    setError('dataIda', 'Informe a data de ida.');
    valid = false;
  }

  if(!dataVolta){
    setError('dataVolta', 'Informe a data de volta.');
    valid = false;
  }

  if(!horarioRetirada){
    setError('horarioRetirada', 'Informe o horário de retirada.');
    valid = false;
  }

  if(!horarioDevolucao){
    setError('horarioDevolucao', 'Informe o horário de devolução.');
    valid = false;
  }

  if(!validacaoPassageiros.ok){
    setError('passageirosConfirmados', validacaoPassageiros.message);
    valid = false;
  }

  if(!motivoInput.value.trim()){
    setError('motivo', 'Informe o motivo da viagem.');
    valid = false;
  }

  if(!responsavelInput.value.trim()){
    setError('responsavel', 'Informe o responsável pela viagem.');
    valid = false;
  }

  if(dataIda && dataVolta && dataVolta < dataIda){
    setError('dataVolta', 'A data de volta deve ser igual ou posterior à data de ida.');
    valid = false;
  }

  if(dataIda && dataVolta && dataIda === dataVolta && horarioRetirada && horarioDevolucao && horarioDevolucao <= horarioRetirada){
    setError('horarioDevolucao', 'O horário de devolução deve ser após o horário de retirada.');
    valid = false;
  }

  if(dataIda && dataVolta && currentUser){
    const ruleValidation = validateReservationRules(currentUser.nome, dataIda, dataVolta, null);
    if(!ruleValidation.ok){
      setError(ruleValidation.field, ruleValidation.message);
      valid = false;
    }
  }

  // Bloqueio: impede confirmar uma reserva cujo horário conflite com outra reserva
  // já existente do mesmo carro (verificação por FAIXA DE HORÁRIO, não pelo dia inteiro).
  if(valid && partida && carro && dataIda && dataVolta && horarioRetirada && horarioDevolucao){
    const conflitos = findConflictingReservations(partida, carro, dataIda, dataVolta, horarioRetirada, horarioDevolucao, null);
    if(conflitos.length > 0){
      const msg = 'Este carro já está reservado neste horário. ' + buildConflictMessage(conflitos);
      setError('horarioRetirada', msg);
      setError('horarioDevolucao', 'Verifique o calendário: horários ocupados para este carro.');
      valid = false;
    }
    const bloqueios = findVehicleBlocks(partida, carro, dataIda, dataVolta, null);
    if(bloqueios.length > 0){
      setError('carro', 'Veículo indisponível: ' + bloqueios.map(b => b.tipo + ' (' + formatDate(b.dataInicio) + ' a ' + formatDate(b.dataFim) + ')').join('; '));
      valid = false;
    }
  }

  return valid;
}

// Monta uma mensagem legível listando os horários já ocupados pelas reservas em conflito,
// ex: "Horários ocupados: 07:00 - 10:00 (14/07); 14:00 - 18:00 (14/07)."
function buildConflictMessage(conflitos){
  const partes = conflitos.map(r => {
    const faixaTexto = (r.horarioRetirada || '00:00') + ' - ' + (r.horarioDevolucao || '23:59');
    return faixaTexto + ' (' + formatDate(r.dataIda) + (r.dataIda !== r.dataVolta ? ' a ' + formatDate(r.dataVolta) : '') + ')';
  });
  return 'Horários ocupados: ' + partes.join('; ') + '.';
}

form.addEventListener('submit', async function(e){
  e.preventDefault();
  confirmation.classList.remove('show');

  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  if(!validateForm()){
    if(isMobileReservationWizard()){
      const stepOneHasError = ['partida','destino','carro'].some(id =>
        document.getElementById('error-' + id).textContent
      );
      const stepTwoHasError = ['dataIda','dataVolta','horarioRetirada','horarioDevolucao'].some(id =>
        document.getElementById('error-' + id).textContent
      );
      if(stepOneHasError) showMobileReservationStep(1, true);
      else if(stepTwoHasError) showMobileReservationStep(2, true);
    }
    return;
  }

  const reserva = {
    id: Date.now(),
    criadorUsuarioId: currentUser.id,
    nome: currentUser.nome,
    email: '',
    partida: partidaSelect.value,
    destino: getDestinoValue(),
    carro: carroSelect.value,
    dataIda: dataIdaInput.value,
    dataVolta: dataVoltaInput.value,
    horarioRetirada: horarioRetiradaSelect.value,
    horarioDevolucao: horarioDevolucaoSelect.value,
    motivo: motivoInput.value.trim(),
    responsavel: responsavelInput.value.trim(),
    status: 'confirmada',
    criadoEm: new Date().toISOString(),
    passageiros: [{ nome: currentUser.nome }].concat(validarListaPassageiros(currentUser.nome, passageirosWidget.getNomes(), Math.max(0, getVehicleCapacity({ partida: partidaSelect.value, carro: carroSelect.value }) - 1)).passageiros),
    passageirosConfirmados: 0
  };

  const list = getReservations();
  list.push(reserva);
  try{
    await saveReservations(list);
  }catch(error){
    await hydrateDatabaseState();
    setError('horarioRetirada', error.message);
    return;
  }
  logAudit('criou', 'reserva', reserva.id, reserva.partida + ' → ' + reserva.destino + ' · ' + reserva.carro);
  renderMainCalendar();
  renderAvailableRides();

  const vagasRestantes = getVagasRestantes(reserva);
  const qtdConfirmados = getPassageirosConfirmados(reserva);
  const successMessage = 'Reserva confirmada! ' + reserva.partida + ' → ' + reserva.destino + ' (Polo final ' + reserva.carro + ') de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Você + ' + qtdConfirmados + (qtdConfirmados === 1 ? ' passageiro confirmado' : ' passageiros confirmados') + '. Vagas restantes: ' + vagasRestantes + '.';

  form.reset();
  fieldCarro.classList.add('hidden');
  carroSelect.innerHTML = '<option value="">Selecione...</option>';
  passageirosWidget.clear();
  populateDestinoOptions();
  toggleDestinoOutro();
  clearAllErrors();
  refreshDatePickers();
  checkAndShowCompatibleRides();
  showMobileReservationStep(1, false);
  showCreatedReservationInMyReservations(successMessage);
});

partidaSelect.addEventListener('change', () => {
  setError('partida', '');
  populateCarroOptions();
  populateDestinoOptions();
  refreshDatePickers();
  refreshAvailableTimeOptions();
  checkAndShowCompatibleRides();
});

destinoSelect.addEventListener('change', () => {
  setError('destino', '');
  toggleDestinoOutro();
  checkAndShowCompatibleRides();
});

destinoOutroInput.addEventListener('input', () => {
  setError('destino', '');
  checkAndShowCompatibleRides();
});

carroSelect.addEventListener('change', () => {
  setError('carro', '');
  refreshDatePickers();
  refreshAvailableTimeOptions();
});

[dataIdaInput, dataVoltaInput].forEach(el => {
  el.addEventListener('input', () => {
    setError(el.id, '');
    refreshAvailableTimeOptions();
    checkAndShowCompatibleRides();
  });
});

horarioRetiradaSelect.addEventListener('change', () => {
  setError('horarioRetirada', '');
  refreshAvailableTimeOptions();
  checkAndShowCompatibleRides();
});

horarioDevolucaoSelect.addEventListener('change', () => {
  setError('horarioDevolucao', '');
  checkAndShowCompatibleRides();
});
