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
// Código do veículo recomendado do momento - lido pelo optionExtra abaixo
// pra colorir a etiqueta "Recomendado" dentro da lista (ver js/styled-select.js).
let carroRecommendedCodigo = null;
const carroStyledSelect = createStyledSelect(carroSelect, {
  optionExtra: function(optionEl){
    if(!optionEl.value || optionEl.value !== String(carroRecommendedCodigo || '')) return '';
    return '<span class="recommended-badge">Recomendado</span>';
  }
});
const dataIdaInput = document.getElementById('dataIda');
const dataVoltaInput = document.getElementById('dataVolta');
const horarioRetiradaSelect = document.getElementById('horarioRetirada');
const horarioDevolucaoSelect = document.getElementById('horarioDevolucao');
const motivoInput = document.getElementById('motivo');
const passageirosWidget = createInteractiveOccupancyWidget('passageirosOccupancyWidget', {
  getContext:function(){
    // getCurrentUser() só existe depois que auth.js carrega, mais tarde que este
    // script - mas o widget já renderiza (vazio) no momento em que é criado.
    const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    return { nome:currentUser ? currentUser.nome : '', partida:partidaSelect.value, carro:carroSelect.value };
  }
});
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
const rodizioWarning = document.getElementById('rodizioWarning');
let mobileReservationStep = 1;
let myReservationsView = 'active';

function refreshRodizioWarning(){
  updateRodizioWarning(rodizioWarning, {
    partida:partidaSelect.value,
    destino:getDestinoValue(),
    carro:carroSelect.value,
    dataIda:dataIdaInput.value,
    dataVolta:dataVoltaInput.value,
    horarioRetirada:horarioRetiradaSelect.value,
    horarioDevolucao:horarioDevolucaoSelect.value
  });
}

[
  partidaSelect, destinoSelect, destinoOutroInput, carroSelect,
  dataIdaInput, dataVoltaInput, horarioRetiradaSelect, horarioDevolucaoSelect
].forEach(element => {
  element.addEventListener('input', refreshRodizioWarning);
  element.addEventListener('change', refreshRodizioWarning);
});

[partidaSelect, carroSelect].forEach(element => {
  element.addEventListener('change', function(){ passageirosWidget.refresh(); });
});

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
  if(shouldScroll){
    form.closest('.card').scrollIntoView({ behavior:'smooth', block:'start' });
  }
  // As caronas compatíveis ajudam a decidir o trajeto/data (etapas 1 e 2);
  // na etapa 3 (motivo/passageiros/confirmar) elas só ocupariam espaço.
  if(typeof checkAndShowCompatibleRides === 'function') checkAndShowCompatibleRides();
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
      setError('carro', 'Selecione o veículo do local de partida.');
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
    if(dataIda && retirada && isReservationPickupInPast(dataIda, retirada)){
      setError('horarioRetirada', 'Este horário já passou. Escolha um horário futuro.');
      valid = false;
    }
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
        setError('horarioRetirada', reservationConflictPrefix() + buildConflictMessage(conflicts));
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
  showMobileReservationStep(mobileReservationStep - 1, true);
});

mobileReservationNextBtn.addEventListener('click', function(){
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
    'partida','destino','carro','motivo',
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
function getCarReservedDates(partida, carro, excludeId){
  const set = new Set();
  if(!partida || !carro) return set;

  const reservas = getReservations().filter(r =>
    !isReservationCompleted(r) &&
    (excludeId == null || String(r.id) !== String(excludeId)) &&
    r.partida === partida && r.carro === carro
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

// Datas que possuem ao menos uma faixa de horário ocupada. Diferentemente de
// getCarReservedDates, estes dias continuam selecionáveis: o usuário escolhe
// depois um dos horários ainda livres.
function populateCarroOptions(preserveSelection){
  const partida = partidaSelect.value;
  const carros = getVehicles().filter(v => v.ativo !== false && v.local === partida);
  const currentCarro = carroSelect.value;
  const keepCurrent = preserveSelection && carros.some(v => String(v.codigo) === String(currentCarro));

  // Primeiro passo: mostra o campo e a lista de veículos JÁ, sem esperar o
  // cálculo do recomendado - é o que ele adiar (mais abaixo) resolve: antes
  // rodava aqui embaixo, na hora, e segurava tanto este campo quanto a seção
  // de caronas compatíveis (chamada logo depois, no mesmo evento) até
  // terminar.
  carroRecommendedCodigo = null;
  renderCarroOptions(carros, keepCurrent ? currentCarro : '');
  if(carros.length){
    fieldCarro.classList.remove('hidden');
  } else {
    fieldCarro.classList.add('hidden');
  }

  if(typeof getRecommendedVehicleCodigoForBranch !== 'function' || !carros.length) return;
  const applyRecommendation = () => {
    // A partida (ou o próprio veículo) pode ter mudado de novo enquanto o
    // cálculo estava agendado - nesse caso o resultado já não serve.
    if(partidaSelect.value !== partida) return;
    carroRecommendedCodigo = getRecommendedVehicleCodigoForBranch(partida);
    carroStyledSelect.sync();
  };
  if(typeof window.requestIdleCallback === 'function'){
    window.requestIdleCallback(applyRecommendation, { timeout:300 });
  } else {
    setTimeout(applyRecommendation, 0);
  }
}

// Só popula o <select> real - o combobox customizado (trigger + lista, com
// a etiqueta "Recomendado" via optionExtra) é mantido em sincronia
// automaticamente por createStyledSelect (ver js/styled-select.js).
function renderCarroOptions(carros, selectedCodigo){
  carroSelect.innerHTML = '<option value="">Selecione...</option>' +
    carros.map(v => '<option value="' + escapeHTML(v.codigo) + '">' + escapeHTML(getVehicleFullModel(v)) +
      (v.placa ? ' · ' + escapeHTML(v.placa) : '') +
      '</option>').join('');
  carroSelect.value = selectedCodigo || '';
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
  const operacao = res.operacao || {};
  const canOperate = isCreator && !completed;
  const pickupAvailable = canRegisterPickupNow(res);
  const actionsHTML =
    (isCreator && !operacao.retirada
      ? '<button class="edit-btn" data-id="' + escapeHTML(res.id) + '">Editar</button>'
      : '') +
    (canOperate && !operacao.retirada
      ? '<button class="operation-btn" data-phase="retirada" data-id="' + escapeHTML(res.id) + '"' +
        (pickupAvailable ? '' : ' data-pickup-info="true" title="Consultar quando a retirada será liberada"') +
        '>' + (pickupAvailable ? 'Registrar retirada' : 'Retirada ainda indisponível') + '</button>'
      : '') +
    (canOperate && operacao.retirada && !operacao.devolucao ? '<button class="operation-btn" data-phase="devolucao" data-id="' + escapeHTML(res.id) + '">Registrar devolução</button>' : '') +
    (canDelete && !operacao.retirada ? '<button class="delete-btn" data-id="' + escapeHTML(res.id) + '">Cancelar</button>' : '') +
    (canLeave ? '<button class="leave-btn" data-id="' + escapeHTML(res.id) + '">Sair da carona</button>' : '');

  const item = document.createElement('div');
  item.className = 'reservation-item' + (completed ? ' reservation-history-item' : '');
  item.innerHTML = renderReservationCardHTML(res, { actionsHTML: actionsHTML });
  return item;
}

function renderMyReservations(){
  const currentUser = getCurrentUser();
  if(!currentUser){
    myReservationsList.innerHTML = '<div class="empty-state">Faça login para ver suas reservas.</div>';
    return;
  }
  const participantReservations = getReservations().filter(r =>
    isPassageiro(r, currentUser)
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
  bindOccupantRemoveButtons(myReservationsList);
  bindReservationFeatureButtons(myReservationsList);
}

function bindOccupantRemoveButtons(container){
  container.querySelectorAll('.occupant-remove-btn').forEach(btn => {
    btn.addEventListener('click', async function(event){
      event.preventDefault();
      const reservationId = this.getAttribute('data-reservation-id');
      const userId = this.getAttribute('data-user-id');
      const passengerName = (this.getAttribute('aria-label') || '').replace(/^Remover /, '');
      // showSitePrompt devolve null se cancelou e '' se confirmou sem escrever
      // nada - por isso a checagem é contra null, e não pela verdade do valor:
      // a mensagem é opcional.
      const motivo = await showSitePrompt(
        '',
        {
          title:'Remover passageiro',
          confirmText:'Sim, remover',
          type:'warning',
          multiline:true,
          // O nome vem do cadastro, então é escapado antes de virar HTML.
          messageHtml:'Remover <strong>' + escapeHTML(passengerName) + '</strong> desta carona?<br>' +
            'O passageiro será avisado por notificação e e-mail.',
          inputPlaceholder:'Mensagem para ' + passengerName + ' (opcional). Ex.: preciso do lugar para levar equipamento.'
        }
      );
      if(motivo === null) return;
      await removePassengerAsDriver(reservationId, userId, motivo);
      renderMyReservations();
    });
  });
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
        await showSiteAlert('Somente o criador pode cancelar esta reserva. Como passageiro, use “Sair da carona”.', {
          title:'Ação não permitida',
          type:'warning'
        });
        renderMyReservations();
        return;
      }
      if(!await showSiteConfirm('Tem certeza que deseja cancelar esta reserva?', {
        title:'Cancelar reserva',
        confirmText:'Sim, cancelar',
        type:'danger'
      })) return;
      const updated = getReservations().filter(r => String(r.id) !== String(id));
      try{
        await saveReservations(updated);
      }catch(error){
        await hydrateDatabaseState();
        await showSiteAlert(error.message, {
          title:'Não foi possível cancelar',
          type:'danger'
        });
        renderMyReservations();
        return;
      }
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
      const motivo = await showSitePrompt(
        'Sair desta carona? O motorista será avisado por notificação e e-mail.',
        {
          title:'Sair da carona',
          confirmText:'Sim, sair',
          type:'warning',
          multiline:true,
          inputPlaceholder:'Mensagem para o motorista (opcional). Ex.: consegui outra condução.'
        }
      );
      if(motivo === null) return;

      const result = await removePassengerFromReservation(id, currentUser, motivo);
      if(!result){
        renderMyReservations();
        return;
      }

      const reserva = result.reserva;
      minhasConfirmationText.textContent = 'Você saiu da carona! ' + reserva.partida + ' → ' + reserva.destino + ' de ' + formatDate(reserva.dataIda) + ' a ' + formatDate(reserva.dataVolta) + '.';
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
  const validacaoPassageiros = validarListaPassageiros(currentUser ? currentUser.nome : '', passageirosWidget.getPassengers(), limitePassageiros);

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
    setError('carro', 'Selecione o carro do local de partida.');
    valid = false;
  }

  const licenseState = typeof getLicenseState === 'function' ? getLicenseState() : null;
  // licenseState null = CNH ainda carregando (loadDriverLicense roda em segundo
  // plano - ver mesmo comentário em checkCnhCategoriaParaVeiculo, em
  // js/driver-license.js) - não bloqueia sem dado suficiente para decidir.
  if(carro && vehicle && licenseState && typeof cnhAtendeCapacidade === 'function'){
    const categoria = licenseState.cnh ? licenseState.cnh.categoria : '';
    if(!cnhAtendeCapacidade(categoria, vehicle.capacidade)){
      const minima = cnhCategoriaMinimaPara(vehicle.capacidade);
      setError('carro', 'Este veículo (' + vehicle.capacidade + ' lugares) exige CNH categoria ' + minima +
        ' ou superior.' + (categoria ? ' Sua CNH é categoria ' + categoria + '.' : ' Cadastre sua CNH em "Meu perfil".'));
      valid = false;
    }
  }

  if(!motivoInput.value.trim()){
    setError('motivo', 'Informe o motivo da viagem.');
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

  if(dataIda && horarioRetirada && isReservationPickupInPast(dataIda, horarioRetirada)){
    setError('horarioRetirada', 'Este horário já passou. Escolha um horário futuro.');
    valid = false;
  }

  if(!validacaoPassageiros.ok){
    setError('passageirosConfirmados', validacaoPassageiros.message);
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
      const msg = reservationConflictPrefix() + buildConflictMessage(conflitos);
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

// Mostra ou esconde o aviso de CNH obrigatória e desabilita o envio.
// Chamado por js/driver-license.js sempre que o estado da CNH muda.
const driverGateNotice = document.getElementById('driverGateNotice');

function refreshDriverGate(){
  if(!driverGateNotice) return;
  // Enquanto a CNH ainda não carregou, não bloqueia nada - evita travar o
  // formulário por um instante logo depois do login.
  const carregou = typeof getLicenseState === 'function' && getLicenseState() !== null;
  const bloqueado = carregou && !userCanDrive();
  driverGateNotice.classList.toggle('hidden', !bloqueado);
  const submitBtn = form.querySelector('button[type="submit"]');
  if(submitBtn) submitBtn.disabled = bloqueado;
}

form.addEventListener('submit', async function(e){
  e.preventDefault();
  confirmation.classList.remove('show');

  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  // Trava de motorista. A checagem também existe aqui, e não só no botão
  // desabilitado, porque o estado da CNH pode ter mudado desde o carregamento
  // da tela (ex.: venceu durante a sessão aberta).
  if(typeof userCanDrive === 'function' && !userCanDrive()){
    await showCnhRequiredAlert();
    return;
  }

  const pendingReturn = getPendingReturnReservation(currentUser);
  if(pendingReturn){
    await showSiteAlert(pendingReturnReservationMessage(pendingReturn), {
      title:'Devolução pendente',
      type:'warning'
    });
    switchTab('minhas');
    return;
  }

  if(!validateForm()){
    const stepOneHasError = ['partida','destino','carro'].some(id =>
      document.getElementById('error-' + id).textContent
    );
    const stepTwoHasError = ['dataIda','dataVolta','horarioRetirada','horarioDevolucao'].some(id =>
      document.getElementById('error-' + id).textContent
    );
    if(stepOneHasError) showMobileReservationStep(1, true);
    else if(stepTwoHasError) showMobileReservationStep(2, true);
    return;
  }

  const regrasAceitas = await openTripRulesModal();
  if(!regrasAceitas) return;

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
    status: 'confirmada',
    criadoEm: new Date().toISOString(),
    passageiros: [{ nome:currentUser.nome, usuarioId:currentUser.id }].concat(validarListaPassageiros(currentUser.nome, passageirosWidget.getPassengers(), Math.max(0, getVehicleCapacity({ partida: partidaSelect.value, carro: carroSelect.value }) - 1)).passageiros),
    passageirosConfirmados: 0
  };

  const list = getReservations();
  list.push(reserva);
  // Desabilita e troca o texto do botão durante o salvamento - sem isso,
  // clicar duas vezes rápido (rede lenta, mobile) pode enviar a mesma
  // reserva duas vezes antes da primeira resposta voltar.
  const confirmBtn = form.querySelector('button[type="submit"]');
  const confirmBtnOriginalHTML = confirmBtn ? confirmBtn.innerHTML : '';
  if(confirmBtn){
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Salvando...';
  }
  try{
    await saveReservations(list);
  }catch(error){
    await hydrateDatabaseState();
    setError('horarioRetirada', error.message);
    return;
  }finally{
    if(confirmBtn){
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = confirmBtnOriginalHTML;
    }
  }
  Object.assign(reserva, getReservations().find(item => String(item.id) === String(reserva.id)) || {});
  renderMainCalendar();
  renderAvailableRides();

  const vagasRestantes = getVagasRestantes(reserva);
  const qtdConfirmados = getPassageirosConfirmados(reserva);
  const successMessage = 'Reserva ' + getReservationNumberLabel(reserva) + ' confirmada! ' + reserva.partida + ' → ' + reserva.destino + ' de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Você + ' + qtdConfirmados + (qtdConfirmados === 1 ? ' passageiro confirmado' : ' passageiros confirmados') + '. Vagas restantes: ' + vagasRestantes + '.';

  form.reset();
  fieldCarro.classList.add('hidden');
  carroRecommendedCodigo = null;
  renderCarroOptions([], '');
  passageirosWidget.clear();
  populateDestinoOptions();
  toggleDestinoOutro();
  clearAllErrors();
  refreshRodizioWarning();
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
