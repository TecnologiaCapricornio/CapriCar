/* Modais de carona, reserva rápida e seletores de data */
/* =========================================================
   Modal de confirmação para "Entrar nessa carona"
   Reutilizado pelos 3 pontos de entrada: aba principal (sugestões),
   aba "Caronas Disponíveis" e Calendário.
   ========================================================= */
const joinConfirmModal = document.getElementById('joinConfirmModal');
const joinConfirmCloseBtn = document.getElementById('joinConfirmCloseBtn');
const joinConfirmCancelBtn = document.getElementById('joinConfirmCancelBtn');
const joinConfirmOkBtn = document.getElementById('joinConfirmOkBtn');
const joinConfirmRoute = document.getElementById('joinConfirmRoute');
const joinConfirmOccupants = document.getElementById('joinConfirmOccupants');

let joinConfirmContext = null; // { id, origin }

function openJoinConfirmModal(id, origin){
  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  const reserva = getReservations().find(r => String(r.id) === String(id));
  if(!reserva) return;

  joinConfirmContext = { id: id, origin: origin };

  joinConfirmRoute.innerHTML = renderReservationSummaryHTML(reserva);
  // No modal de confirmação as etiquetas vêm logo depois da linha de rota e
  // datas (joinConfirmRoute), mantendo a mesma ordem das telas de reserva.
  joinConfirmOccupants.innerHTML =
    '<div class="reservation-card-chips">' + renderOccupancyBadgesHTML(reserva) + '</div>' +
    renderOccupancyHTML(reserva);

  joinConfirmModal.classList.remove('hidden');
}

function closeJoinConfirmModal(){
  joinConfirmModal.classList.add('hidden');
  joinConfirmContext = null;
}

joinConfirmCloseBtn.addEventListener('click', closeJoinConfirmModal);
joinConfirmCancelBtn.addEventListener('click', closeJoinConfirmModal);
joinConfirmModal.addEventListener('click', function(e){
  if(e.target === joinConfirmModal) closeJoinConfirmModal();
});

joinConfirmOkBtn.addEventListener('click', async function(){
  if(!joinConfirmContext) return;
  const { id, origin } = joinConfirmContext;
  closeJoinConfirmModal();

  const regrasAceitas = await openTripRulesModal();
  if(!regrasAceitas) return;

  if(origin === 'available'){
    await joinRideFromAvailable(id);
  } else if(origin === 'calendar'){
    await joinRideFromCalendar(id);
  } else {
    await joinRide(id);
  }
});

/* =========================================================
   Modal de Regras Básicas da Viagem
   Gate de aceite antes de criar uma reserva ou entrar como
   passageiro numa existente - reutilizado nos 3 pontos de entrada
   (form principal, reserva rápida, "Entrar na carona").
   ========================================================= */
const tripRulesModal = document.getElementById('tripRulesModal');
const tripRulesCloseBtn = document.getElementById('tripRulesCloseBtn');
const tripRulesCancelBtn = document.getElementById('tripRulesCancelBtn');
const tripRulesConfirmBtn = document.getElementById('tripRulesConfirmBtn');
const tripRulesCheckbox = document.getElementById('tripRulesCheckbox');

document.querySelectorAll('#tripRulesModal [data-rule-icon]').forEach(function(el){
  const icon = TRIP_RULE_ICONS[el.getAttribute('data-rule-icon')];
  if(icon) el.innerHTML = icon;
});

let tripRulesResolve = null;

// Promise<boolean> - resolve(true) só quando o usuário confirma com a
// caixa marcada; qualquer outra saída (cancelar, X, clique fora) resolve false.
function openTripRulesModal(){
  tripRulesCheckbox.checked = false;
  tripRulesConfirmBtn.disabled = true;
  tripRulesModal.classList.remove('hidden');
  return new Promise(resolve => { tripRulesResolve = resolve; });
}

function finishTripRulesModal(accepted){
  tripRulesModal.classList.add('hidden');
  if(tripRulesResolve){
    const resolve = tripRulesResolve;
    tripRulesResolve = null;
    resolve(accepted);
  }
}

tripRulesCheckbox.addEventListener('change', function(){
  tripRulesConfirmBtn.disabled = !tripRulesCheckbox.checked;
});
tripRulesCloseBtn.addEventListener('click', () => finishTripRulesModal(false));
tripRulesCancelBtn.addEventListener('click', () => finishTripRulesModal(false));
tripRulesConfirmBtn.addEventListener('click', function(){
  if(tripRulesCheckbox.checked) finishTripRulesModal(true);
});
tripRulesModal.addEventListener('click', function(e){
  if(e.target === tripRulesModal) finishTripRulesModal(false);
});

calPrevBtn.addEventListener('click', function(){
  shiftCalendarWeek(-7);
});

calNextBtn.addEventListener('click', function(){
  shiftCalendarWeek(7);
});

/* =========================================================
   Modal de reserva rápida pelo calendário (por carro + dia clicado)
   ========================================================= */
const quickReserveModal = document.getElementById('quickReserveModal');
const quickReserveCloseBtn = document.getElementById('quickReserveCloseBtn');
const quickReserveSummary = document.getElementById('quickReserveSummary');
const quickReserveForm = document.getElementById('quickReserveForm');
const qDestinoSelect = document.getElementById('qDestino');
const qDestinoOutroInput = document.getElementById('qDestinoOutro');
const qDataVoltaInput = document.getElementById('qDataVolta');
const qHorarioRetiradaSelect = document.getElementById('qHorarioRetirada');
const qHorarioDevolucaoSelect = document.getElementById('qHorarioDevolucao');
const qMotivoInput = document.getElementById('qMotivo');
const qRodizioWarning = document.getElementById('qRodizioWarning');
let quickReserveContext = null; // { local, carro, dataIda }
const qPassageirosWidget = createInteractiveOccupancyWidget('qPassageirosOccupancyWidget', {
  getContext:function(){
    // getCurrentUser() só existe depois que auth.js carrega, mais tarde que este
    // script - mas o widget já renderiza (vazio) no momento em que é criado.
    const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    return {
      nome:currentUser ? currentUser.nome : '',
      partida:quickReserveContext ? quickReserveContext.local : '',
      carro:quickReserveContext ? quickReserveContext.carro : ''
    };
  }
});

function refreshQuickRodizioWarning(){
  updateRodizioWarning(qRodizioWarning, {
    partida:quickReserveContext && quickReserveContext.local,
    destino:getQDestinoValue(),
    carro:quickReserveContext && quickReserveContext.carro,
    dataIda:quickReserveContext && quickReserveContext.dataIda,
    dataVolta:qDataVoltaInput.value,
    horarioRetirada:qHorarioRetiradaSelect.value,
    horarioDevolucao:qHorarioDevolucaoSelect.value
  });
}

[qDestinoSelect, qDestinoOutroInput, qDataVoltaInput, qHorarioRetiradaSelect, qHorarioDevolucaoSelect]
  .forEach(element => {
    element.addEventListener('input', refreshQuickRodizioWarning);
    element.addEventListener('change', refreshQuickRodizioWarning);
  });

populateHorarioOptions(qHorarioRetiradaSelect);
populateHorarioOptions(qHorarioDevolucaoSelect);

function refreshQuickAvailableTimeOptions(){
  if(!quickReserveContext){
    populateHorarioOptions(qHorarioRetiradaSelect);
    populateHorarioOptions(qHorarioDevolucaoSelect);
    return;
  }
  const selectedPickup = qHorarioRetiradaSelect.value;
  const selectedReturn = qHorarioDevolucaoSelect.value;
  const availability = getAvailableReservationTimeOptions(
    quickReserveContext.local,
    quickReserveContext.carro,
    quickReserveContext.dataIda,
    qDataVoltaInput.value,
    '',
    null
  );
  populateHorarioOptions(qHorarioRetiradaSelect, availability.pickup);
  if(availability.pickup.includes(selectedPickup)){
    qHorarioRetiradaSelect.value = selectedPickup;
  }

  const returnAvailability = getAvailableReservationTimeOptions(
    quickReserveContext.local,
    quickReserveContext.carro,
    quickReserveContext.dataIda,
    qDataVoltaInput.value,
    qHorarioRetiradaSelect.value,
    null
  );
  populateHorarioOptions(qHorarioDevolucaoSelect, returnAvailability.return);
  if(returnAvailability.return.includes(selectedReturn)){
    qHorarioDevolucaoSelect.value = selectedReturn;
  }

  if(qDataVoltaInput.value && !availability.pickup.length){
    setQError('horarioRetirada', 'Não há horários disponíveis para este carro no período selecionado.');
  }
}

function setQError(fieldId, message){
  const field = document.getElementById('qfield-' + fieldId);
  const errorEl = document.getElementById('error-q' + fieldId.charAt(0).toUpperCase() + fieldId.slice(1));
  if(!field || !errorEl) return;
  if(message){
    field.classList.add('invalid');
    errorEl.textContent = message;
  } else {
    field.classList.remove('invalid');
    errorEl.textContent = '';
  }
}

function clearQErrors(){
  ['destino','dataVolta','horarioRetirada','horarioDevolucao','passageirosConfirmados','motivo'].forEach(id => setQError(id, ''));
}

function getQDestinoValue(){
  if(qDestinoSelect.value === 'Outro'){
    return qDestinoOutroInput.value.trim();
  }
  return qDestinoSelect.value;
}

function toggleQDestinoOutro(){
  if(qDestinoSelect.value === 'Outro'){
    qDestinoOutroInput.classList.remove('hidden');
  } else {
    qDestinoOutroInput.classList.add('hidden');
    qDestinoOutroInput.value = '';
  }
}

qDestinoSelect.addEventListener('change', function(){
  setQError('destino', '');
  toggleQDestinoOutro();
});

qDestinoOutroInput.addEventListener('input', function(){
  setQError('destino', '');
});

function populateQDestinoOptions(local){
  let html = '<option value="">Selecione...</option>';
  CIDADES.forEach(cidade => {
    if(cidade === local) return;
    html += '<option value="' + cidade + '">' + cidade + '</option>';
  });
  html += '<option value="Outro">Outro</option>';
  qDestinoSelect.innerHTML = html;
  qDestinoSelect.value = '';
  toggleQDestinoOutro();
}

function openQuickReserveModal(dataIda, selectedRange){
  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  // Mesma trava de CNH da tela "Nova Reserva" - avisa já ao tentar abrir o
  // atalho pelo calendário, em vez de deixar preencher o formulário inteiro.
  if(
    typeof getLicenseState === 'function' && getLicenseState() !== null &&
    typeof userCanDrive === 'function' && !userCanDrive()
  ){
    showCnhRequiredAlert();
    return;
  }

  const info = getSelectedCarInfo();
  if(!info) return;

  if(typeof checkCnhCategoriaParaVeiculo === 'function' &&
    !checkCnhCategoriaParaVeiculo(getVehicle(info.local, info.carro))){
    return;
  }

  quickReserveContext = { local: info.local, carro: info.carro, dataIda: dataIda };

  quickReserveSummary.innerHTML = 'Origem: ' + escapeHTML(info.local) +
    '<br>' + getVehicleDisplayHTML({ partida:info.local, carro:info.carro });

  populateQDestinoOptions(info.local);
  qDataVoltaInput.value = dataIda;
  qHorarioRetiradaSelect.value = '';
  qHorarioDevolucaoSelect.value = '';
  qMotivoInput.value = '';
  qPassageirosWidget.clear();
  clearQErrors();
  refreshDatePickers();
  refreshQuickAvailableTimeOptions();
  if(selectedRange && selectedRange.horarioRetirada){
    const pickupOption = Array.from(qHorarioRetiradaSelect.options).some(option =>
      option.value === selectedRange.horarioRetirada
    );
    if(pickupOption){
      qHorarioRetiradaSelect.value = selectedRange.horarioRetirada;
      refreshQuickAvailableTimeOptions();
    }
    const returnOption = Array.from(qHorarioDevolucaoSelect.options).some(option =>
      option.value === selectedRange.horarioDevolucao
    );
    if(returnOption){
      qHorarioDevolucaoSelect.value = selectedRange.horarioDevolucao;
    }
  }

  refreshQuickRodizioWarning();
  quickReserveModal.classList.remove('hidden');
}

function closeQuickReserveModal(){
  quickReserveModal.classList.add('hidden');
  quickReserveContext = null;
  refreshQuickRodizioWarning();
}

quickReserveCloseBtn.addEventListener('click', closeQuickReserveModal);
quickReserveModal.addEventListener('click', function(e){
if(e.target === quickReserveModal) closeQuickReserveModal();
});

qDataVoltaInput.addEventListener('input', function(){
  setQError('dataVolta', '');
  refreshQuickAvailableTimeOptions();
});

qHorarioRetiradaSelect.addEventListener('change', function(){
  setQError('horarioRetirada', '');
  refreshQuickAvailableTimeOptions();
});

qHorarioDevolucaoSelect.addEventListener('change', function(){
  setQError('horarioDevolucao', '');
});

quickReserveForm.addEventListener('submit', async function(e){
  e.preventDefault();
  clearQErrors();

  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }
  const pendingReturn = getPendingReturnReservation(currentUser);
  if(pendingReturn){
    await showSiteAlert(pendingReturnReservationMessage(pendingReturn), {
      title:'Devolução pendente',
      type:'warning'
    });
    closeQuickReserveModal();
    switchTab('minhas');
    return;
  }
  if(!quickReserveContext) return;

  let valid = true;
  const destino = getQDestinoValue();
  const dataVolta = qDataVoltaInput.value;
  const horarioRetirada = qHorarioRetiradaSelect.value;
  const horarioDevolucao = qHorarioDevolucaoSelect.value;
  const motivo = qMotivoInput.value.trim();
  const vehicle = getVehicle(quickReserveContext.local, quickReserveContext.carro);
  const validacaoPassageiros = validarListaPassageiros(currentUser.nome, qPassageirosWidget.getPassengers(), Math.max(0, Number(vehicle && vehicle.capacidade ? vehicle.capacidade : CAPACIDADE_MAXIMA) - 1));
  const dataIda = quickReserveContext.dataIda;

  if(!qDestinoSelect.value){
    setQError('destino', 'Selecione o destino.');
    valid = false;
  } else if(qDestinoSelect.value === 'Outro' && !destino){
    setQError('destino', 'Digite o destino.');
    valid = false;
  }

  if(destino && destino === quickReserveContext.local){
    setQError('destino', 'Destino deve ser diferente da partida.');
    valid = false;
  }

  if(!motivo){
    setQError('motivo', 'Informe o motivo da viagem.');
    valid = false;
  }

  if(!dataVolta){
    setQError('dataVolta', 'Informe a data de volta.');
    valid = false;
  } else if(dataVolta < dataIda){
    setQError('dataVolta', 'A data de volta deve ser igual ou posterior à data de ida.');
    valid = false;
  }

  if(!horarioRetirada){
    setQError('horarioRetirada', 'Informe o horário de retirada.');
    valid = false;
  }

  if(!horarioDevolucao){
    setQError('horarioDevolucao', 'Informe o horário de devolução.');
    valid = false;
  }

  if(dataIda && horarioRetirada && isReservationPickupInPast(dataIda, horarioRetirada)){
    setQError('horarioRetirada', 'Este horário já passou. Escolha um horário futuro.');
    valid = false;
  }

  if(dataIda === dataVolta && horarioRetirada && horarioDevolucao && horarioDevolucao <= horarioRetirada){
    setQError('horarioDevolucao', 'O horário de devolução deve ser após o horário de retirada.');
    valid = false;
  }

  if(dataIda && dataVolta){
    const ruleValidation = validateReservationRules(currentUser.nome, dataIda, dataVolta, null);
    if(!ruleValidation.ok){
      setQError(ruleValidation.field === 'dataIda' ? 'dataVolta' : ruleValidation.field, ruleValidation.message);
      valid = false;
    }
  }

  if(!validacaoPassageiros.ok){
    setQError('passageirosConfirmados', validacaoPassageiros.message);
    valid = false;
  }

  if(valid && horarioRetirada && horarioDevolucao){
    const conflitos = findConflictingReservations(quickReserveContext.local, quickReserveContext.carro, dataIda, dataVolta, horarioRetirada, horarioDevolucao, null);
    if(conflitos.length > 0){
      setQError('horarioRetirada', reservationConflictPrefix() + buildConflictMessage(conflitos));
      setQError('horarioDevolucao', 'Verifique o calendário: horários ocupados para este carro.');
      valid = false;
    }
    const bloqueios = findVehicleBlocks(quickReserveContext.local, quickReserveContext.carro, dataIda, dataVolta, null);
    if(bloqueios.length > 0){
      setQError('dataVolta', 'Veículo indisponível no período: ' + bloqueios.map(b => b.tipo).join(', ') + '.');
      valid = false;
    }
  }

  if(!valid) return;

  const regrasAceitas = await openTripRulesModal();
  if(!regrasAceitas) return;

  const reserva = {
    id: Date.now(),
    criadorUsuarioId: currentUser.id,
    nome: currentUser.nome,
    email: '',
    partida: quickReserveContext.local,
    destino: destino,
    carro: quickReserveContext.carro,
    dataIda: dataIda,
    dataVolta: dataVolta,
    horarioRetirada: horarioRetirada,
    horarioDevolucao: horarioDevolucao,
    motivo: motivo,
    status: 'confirmada',
    criadoEm: new Date().toISOString(),
    passageiros: [{ nome:currentUser.nome, usuarioId:currentUser.id }].concat(validacaoPassageiros.passageiros),
    passageirosConfirmados: 0
  };

  const list = getReservations();
  list.push(reserva);
  const confirmBtn = quickReserveForm.querySelector('button[type="submit"]');
  const confirmBtnOriginalText = confirmBtn ? confirmBtn.textContent : '';
  if(confirmBtn){
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Salvando...';
  }
  try{
    await saveReservations(list);
  }catch(error){
    await hydrateDatabaseState();
    setQError('horarioRetirada', error.message);
    return;
  }finally{
    if(confirmBtn){
      confirmBtn.disabled = false;
      confirmBtn.textContent = confirmBtnOriginalText;
    }
  }
  Object.assign(reserva, getReservations().find(item => String(item.id) === String(reserva.id)) || {});

  closeQuickReserveModal();

  const vagasRestantes = getVagasRestantes(reserva);
  const successMessage = 'Reserva ' + getReservationNumberLabel(reserva) + ' confirmada! ' + reserva.partida + ' → ' + reserva.destino + ' de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '.';

  renderMainCalendar();
  showDayDetails(dataIda);
  renderAvailableRides();
  refreshDatePickers();
  showCreatedReservationInMyReservations(successMessage);
});

/* =========================================================
   Date picker customizado com bloqueio de datas já reservadas
   (bloqueio agora é por carro específico, não por rota)
   ========================================================= */
const datePickers = [];

function createDatePicker(inputEl, wrapperEl, getBlockedSetFn, options){
  if(!inputEl || !wrapperEl) return null;
  const settings = options || {};
  const blockedDates = typeof getBlockedSetFn === 'function' ? getBlockedSetFn : () => new Set();
  let viewYear, viewMonth;
  const popup = document.createElement('div');
  popup.className = 'date-popup range-style-date-popup';
  // No <body>, com position:fixed calculado em JS (positionPopup) - não mais
  // filho do wrapper. Preso dentro do modal (position:absolute relativo ao
  // wrapper), o popup ficava sujeito à altura/rolagem do modal e cortava o
  // calendário. Solto do body, ele flutua livre sobre qualquer coisa, sem
  // depender de o modal ter espaço/rolagem para caber.
  document.body.appendChild(popup);

  // Reposiciona colado no input, virando para cima quando não há espaço
  // embaixo (dentro da viewport, nunca cortado).
  function positionPopup(){
    const rect = inputEl.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const popupWidth = popup.offsetWidth || 292;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = rect.left;
    if(left + popupWidth > viewportW - margin) left = viewportW - popupWidth - margin;
    if(left < margin) left = margin;

    const spaceBelow = viewportH - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openBelow = spaceBelow >= spaceAbove;
    const available = Math.max(120, openBelow ? spaceBelow : spaceAbove);

    // Trava a altura do popup ao espaço realmente disponível na direção
    // escolhida - se o calendário não coubesse inteiro, a versão antiga
    // empurrava o topo pra cima até ele cobrir o próprio campo (e o clique
    // que deveria abrir o calendário acabava "errando" o alvo e fechando
    // tudo de novo, no mesmo gesto). Com altura travada, o que não cabe
    // rola por dentro do popup (ver CSS) - ele nunca mais sobe/desce a
    // ponto de tampar o campo que o abriu.
    popup.style.maxHeight = available + 'px';
    popup.style.overflowY = 'auto';

    const popupHeight = Math.min(popup.scrollHeight, available);
    const top = openBelow
      ? rect.bottom + gap
      : Math.max(margin, rect.top - gap - popupHeight);

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  }

  function pickerTitle(){
    if(settings.title) return settings.title;
    const label = document.querySelector('label[for="' + inputEl.id + '"]');
    const labelText = label ? label.textContent.replace('*', '').trim().toLowerCase() : 'data';
    return 'Escolha ' + (labelText.startsWith('data') ? 'a ' : 'o ') + labelText;
  }

  function pickerSubtitle(){
    if(typeof settings.subtitle === 'function') return settings.subtitle();
    if(settings.subtitle) return settings.subtitle;
    return settings.allowPast === true
      ? 'Selecione uma data para consultar'
      : 'Até ' + getReservationRules().maxAdvanceDays + ' dias de antecedência';
  }

  function syncViewToValue(){
    if(inputEl.value){
      const [y, m] = inputEl.value.split('-').map(Number);
      viewYear = y;
      viewMonth = m - 1;
    } else {
      const t = new Date();
      viewYear = t.getFullYear();
      viewMonth = t.getMonth();
    }
  }

  function render(){
    const blocked = blockedDates() || new Set();
    const today = todayISO();
    const selected = inputEl.value;
    const minimum = typeof settings.getMinDate === 'function' ? settings.getMinDate() : settings.minDate;
    const maximum = typeof settings.getMaxDate === 'function' ? settings.getMaxDate() : settings.maxDate;

    let html = '<div class="range-calendar-topline single-date-topline">' +
                 '<div><strong>' + escapeHTML(pickerTitle()) + '</strong>' +
                 '<span>' + escapeHTML(pickerSubtitle()) + '</span></div>' +
               '</div>' +
               '<div class="range-calendar-header">' +
                 '<button type="button" class="range-calendar-nav date-popup-nav-btn" data-nav="prev" aria-label="Mês anterior">&#8249;</button>' +
                 '<strong>' + MESES[viewMonth] + ' de ' + viewYear + '</strong>' +
                 '<button type="button" class="range-calendar-nav date-popup-nav-btn" data-nav="next" aria-label="Próximo mês">&#8250;</button>' +
               '</div>' +
               '<div class="range-calendar-grid date-popup-grid">';

    DIAS_SEMANA.forEach(d => {
      html += '<span class="range-calendar-weekday date-popup-weekday">' + d.charAt(0) + '</span>';
    });

    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    const totalDays = daysInMonth(viewYear, viewMonth);
    const prevMonthDays = daysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);
    // Só as semanas que o mês realmente usa (5 ou 6) - sem isso, um mês que
    // cabe em 5 semanas ainda reservava uma 6ª linha inteira de dias do mês
    // seguinte (escondida com visibility:hidden, que preserva o espaço),
    // deixando um vão vazio entre os dias e a legenda.
    const totalCells = Math.ceil((firstWeekday + totalDays) / 7) * 7;

    for(let i = 0; i < totalCells; i++){
      const offset = i - firstWeekday + 1;
      let day, year, monthIndex, otherMonth;

      if(offset < 1){
        day = prevMonthDays + offset;
        monthIndex = viewMonth === 0 ? 11 : viewMonth - 1;
        year = viewMonth === 0 ? viewYear - 1 : viewYear;
        otherMonth = true;
      } else if(offset > totalDays){
        day = offset - totalDays;
        monthIndex = viewMonth === 11 ? 0 : viewMonth + 1;
        year = viewMonth === 11 ? viewYear + 1 : viewYear;
        otherMonth = true;
      } else {
        day = offset;
        monthIndex = viewMonth;
        year = viewYear;
        otherMonth = false;
      }

      const iso = isoFromParts(year, monthIndex, day);
      const isBlocked = !otherMonth && blocked.has(iso);
      const isPast = !otherMonth && settings.allowPast !== true && iso < today;
      const isOutOfRange = !otherMonth && ((minimum && iso < minimum) || (maximum && iso > maximum));

      let classes = 'range-calendar-day date-popup-day';
      if(otherMonth) classes += ' other-month';
      else if(isBlocked) classes += ' unavailable blocked';
      else if(isPast || isOutOfRange) classes += ' disabled past';
      if(!otherMonth && iso === today) classes += ' today';
      if(!otherMonth && iso === selected) classes += ' range-start selected';

      const disabled = otherMonth || isBlocked || isPast || isOutOfRange;
      html += '<button type="button" class="' + classes + '" data-iso="' + iso +
        '" data-other="' + (otherMonth ? '1' : '0') +
        '" data-blocked="' + (isBlocked ? '1' : '0') +
        '" data-past="' + (isPast || isOutOfRange ? '1' : '0') + '"' +
        (disabled ? ' disabled' : '') +
        ' aria-label="' + day + ' de ' + MESES[monthIndex] + ' de ' + year +
        (isBlocked ? ' — indisponível' : '') + '"><span>' + day + '</span></button>';
    }

    html += '</div>';
    html += '<div class="range-calendar-legend date-popup-legend">' +
              '<span><i class="range-legend-dot selected"></i>Selecionado</span>' +
              (settings.showBlockedLegend !== false
                ? '<span><i class="range-legend-dot unavailable"></i>' +
                    escapeHTML(settings.blockedLegend || 'Indisponível') + '</span>'
                : '') +
            '</div>';
    if(settings.showClear !== false){
      html += '<div class="range-calendar-actions date-popup-actions">' +
                '<button type="button" class="range-clear-btn date-popup-clear-btn"' + (selected ? '' : ' disabled') + '>Limpar</button>' +
              '</div>';
    }

    popup.innerHTML = html;
  }

  function open(){
    syncViewToValue();
    render();
    datePickers.forEach(p => { if(p !== controller) p.close(); });
    popup.classList.add('show');
    positionPopup();
    // Captura (3º argumento true) pra pegar rolagem de qualquer ancestral
    // rolável (ex.: o próprio modal), não só da janela.
    window.addEventListener('scroll', positionPopup, true);
    window.addEventListener('resize', positionPopup);
  }

  function close(){
    popup.classList.remove('show');
    window.removeEventListener('scroll', positionPopup, true);
    window.removeEventListener('resize', positionPopup);
  }

  popup.addEventListener('click', function(e){
    const clearBtn = e.target.closest('.date-popup-clear-btn');
    if(clearBtn){
      e.stopPropagation();
      if(clearBtn.disabled) return;
      inputEl.value = '';
      inputEl.dispatchEvent(new Event('input', { bubbles:true }));
      inputEl.dispatchEvent(new Event('change', { bubbles:true }));
      close();
      return;
    }

    const navBtn = e.target.closest('.date-popup-nav-btn');
    if(navBtn){
      e.stopPropagation();
      if(navBtn.getAttribute('data-nav') === 'prev'){
        viewMonth--;
        if(viewMonth < 0){ viewMonth = 11; viewYear--; }
      } else {
        viewMonth++;
        if(viewMonth > 11){ viewMonth = 0; viewYear++; }
      }
      render();
      return;
    }

    const dayEl = e.target.closest('.date-popup-day');
    if(!dayEl) return;
    e.stopPropagation();
    if(dayEl.getAttribute('data-other') === '1') return;
    if(dayEl.getAttribute('data-blocked') === '1') return;
    if(dayEl.getAttribute('data-past') === '1') return;

    inputEl.value = dayEl.getAttribute('data-iso');
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  });

  inputEl.addEventListener('click', function(e){
    e.stopPropagation();
    open();
  });

  inputEl.addEventListener('focus', function(){
    open();
  });

  const controller = {
    refresh: function(){
      if(popup.classList.contains('show')) render();
    },
    close: close,
    // Expostos pro handler global de "clicar fora fecha" - o popup não é
    // mais filho do wrapper (foi pro body), então não dá pra achar um pelo
    // outro por containment de DOM.
    popup: popup,
    wrapperEl: wrapperEl
  };

  datePickers.push(controller);
  return controller;
}

document.addEventListener('click', function(e){
  datePickers.forEach(p => {
    if(!p.wrapperEl.contains(e.target) && !p.popup.contains(e.target)){
      p.close();
    }
  });
});

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    datePickers.forEach(p => p.close());
  }
});

// Datas indisponíveis para o carro selecionado (bloqueios + reservas já
// existentes) - usado tanto para a ida quanto como base para a volta.
function getReservaFormUnavailableDates(){
  const unavailable = getCarReservedDates(partidaSelect.value, carroSelect.value);
  if(!partidaSelect.value || !carroSelect.value) return unavailable;
  const rules = getReservationRules();
  const endLimit = addDaysISO(todayISO(), rules.maxAdvanceDays + rules.maxConsecutiveDays);
  findVehicleBlocks(partidaSelect.value, carroSelect.value, todayISO(), endLimit, null).forEach(block => {
    eachDateISOInRange(block.dataInicio, block.dataFim, iso => unavailable.add(iso));
  });
  return unavailable;
}

// Além dos dias já indisponíveis, qualquer data de volta cujo intervalo
// [ida, volta] atravesse um dia indisponível também fica bloqueada - mesma
// proteção que o antigo seletor de período dava ao desabilitar esses dias.
function getReservaFormBlockedForVolta(){
  if(!dataIdaInput.value) return new Set();
  const unavailable = getReservaFormUnavailableDates();
  const rules = getReservationRules();
  const maxEnd = addDaysISO(dataIdaInput.value, rules.maxConsecutiveDays - 1);
  const blocked = new Set();
  let crossed = false;
  let cursor = dataIdaInput.value;
  while(cursor <= maxEnd){
    if(unavailable.has(cursor)) crossed = true;
    if(crossed) blocked.add(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return blocked;
}

createDatePicker(dataIdaInput, document.getElementById('wrap-dataIda'), getReservaFormUnavailableDates, {
  title:'Escolha a ida',
  subtitle:() => 'Até ' + getReservationRules().maxAdvanceDays + ' dias de antecedência',
  getMaxDate:() => addDaysISO(todayISO(), getReservationRules().maxAdvanceDays),
  blockedLegend:'Indisponível para este carro'
});

createDatePicker(dataVoltaInput, document.getElementById('wrap-dataVolta'), getReservaFormBlockedForVolta, {
  title:'Escolha a volta',
  subtitle:() => dataIdaInput.value
    ? 'Até ' + getReservationRules().maxConsecutiveDays + ' dias consecutivos'
    : 'Escolha a data de ida primeiro',
  getMinDate:() => dataIdaInput.value || todayISO(),
  getMaxDate:() => dataIdaInput.value
    ? addDaysISO(dataIdaInput.value, getReservationRules().maxConsecutiveDays - 1)
    : null,
  blockedLegend:'Indisponível para este carro'
});

dataIdaInput.addEventListener('change', function(){
  if(dataVoltaInput.value && (dataVoltaInput.value < this.value || getReservaFormBlockedForVolta().has(dataVoltaInput.value))){
    dataVoltaInput.value = '';
    dataVoltaInput.dispatchEvent(new Event('change', { bubbles:true }));
  }
  refreshDatePickers();
});

createDatePicker(qDataVoltaInput, document.getElementById('wrap-qDataVolta'), () => {
  if(!quickReserveContext) return new Set();
  return getCarReservedDates(quickReserveContext.local, quickReserveContext.carro);
}, {
  title:'Escolha a volta',
  subtitle:() => 'Até ' + getReservationRules().maxConsecutiveDays + ' dias consecutivos',
  blockedLegend:'Indisponível para este carro'
});

createDatePicker(
  document.getElementById('filtroData'),
  document.getElementById('wrap-filtroData'),
  null,
  { title:'Escolha a data', subtitle:'Selecione uma data para filtrar', allowPast:true, showBlockedLegend:false }
);

createDatePicker(
  document.getElementById('adminFiltroData'),
  document.getElementById('wrap-adminFiltroData'),
  null,
  { title:'Escolha a data', subtitle:'Selecione uma data para filtrar', allowPast:true, showBlockedLegend:false }
);

// Períodos de filtro (bloqueios, auditoria, relatórios) - mesmo estilo do
// campo único acima, sem data mínima/máxima nem datas bloqueadas: são
// filtros sobre dados já existentes, não uma nova reserva.
[
  ['blockStart', 'wrap-blockStart'], ['blockEnd', 'wrap-blockEnd'],
  ['auditStart', 'wrap-auditStart'], ['auditEnd', 'wrap-auditEnd'],
  ['reportStart', 'wrap-reportStart'], ['reportEnd', 'wrap-reportEnd']
].forEach(([inputId, wrapId]) => {
  createDatePicker(document.getElementById(inputId), document.getElementById(wrapId), null, {
    allowPast:true,
    showBlockedLegend:false
  });
});

// Próxima manutenção: mesma restrição de dataIda (sem allowPast) - um
// lembrete de manutenção não faz sentido com data já passada.
createDatePicker(
  document.getElementById('maintenanceNextDate'),
  document.getElementById('wrap-maintenanceNextDate'),
  null,
  { title:'Escolha a data da manutenção', subtitle:'Selecione a data da próxima manutenção' }
);

function getAdminUnavailableDates(){
  const adminDeparture = document.getElementById('aPartida');
  const adminVehicle = document.getElementById('aCarro');
  if(!adminDeparture || !adminVehicle) return new Set();
  const unavailable = getCarReservedDates(adminDeparture.value, adminVehicle.value, adminEditingId);
  if(!adminDeparture.value || !adminVehicle.value) return unavailable;
  const rules = getReservationRules();
  const endLimit = addDaysISO(todayISO(), rules.maxAdvanceDays + rules.maxConsecutiveDays);
  findVehicleBlocks(adminDeparture.value, adminVehicle.value, todayISO(), endLimit, null).forEach(block => {
    eachDateISOInRange(block.dataInicio, block.dataFim, iso => unavailable.add(iso));
  });
  return unavailable;
}

const adminStartDatePickerInput = document.getElementById('aDataIda');
const adminEndDatePickerInput = document.getElementById('aDataVolta');

function getAdminBlockedForVolta(){
  if(!adminStartDatePickerInput.value) return new Set();
  const unavailable = getAdminUnavailableDates();
  const rules = getReservationRules();
  const maxEnd = addDaysISO(adminStartDatePickerInput.value, rules.maxConsecutiveDays - 1);
  const blocked = new Set();
  let crossed = false;
  let cursor = adminStartDatePickerInput.value;
  while(cursor <= maxEnd){
    if(unavailable.has(cursor)) crossed = true;
    if(crossed) blocked.add(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return blocked;
}

createDatePicker(adminStartDatePickerInput, document.getElementById('wrap-aDataIda'), getAdminUnavailableDates, {
  title:'Escolha a ida',
  subtitle:() => 'Até ' + getReservationRules().maxAdvanceDays + ' dias de antecedência',
  getMaxDate:() => addDaysISO(todayISO(), getReservationRules().maxAdvanceDays),
  blockedLegend:'Indisponível para este carro'
});

createDatePicker(adminEndDatePickerInput, document.getElementById('wrap-aDataVolta'), getAdminBlockedForVolta, {
  title:'Escolha a volta',
  subtitle:() => adminStartDatePickerInput.value
    ? 'Até ' + getReservationRules().maxConsecutiveDays + ' dias consecutivos'
    : 'Escolha a data de ida primeiro',
  getMinDate:() => adminStartDatePickerInput.value || todayISO(),
  getMaxDate:() => adminStartDatePickerInput.value
    ? addDaysISO(adminStartDatePickerInput.value, getReservationRules().maxConsecutiveDays - 1)
    : null,
  blockedLegend:'Indisponível para este carro'
});

const blockStartDateInput = document.getElementById('blockStart');
const blockEndDateInput = document.getElementById('blockEnd');
blockStartDateInput.addEventListener('change', function(){
  if(blockEndDateInput.value && blockEndDateInput.value < this.value){
    blockEndDateInput.value = '';
    blockEndDateInput.dispatchEvent(new Event('change', { bubbles:true }));
  }
  refreshDatePickers();
});

adminStartDatePickerInput.addEventListener('change', function(){
  if(adminEndDatePickerInput.value && (adminEndDatePickerInput.value < this.value || getAdminBlockedForVolta().has(adminEndDatePickerInput.value))){
    adminEndDatePickerInput.value = '';
    adminEndDatePickerInput.dispatchEvent(new Event('change', { bubbles:true }));
  }
  refreshDatePickers();
});

function refreshDatePickers(){
  datePickers.forEach(p => p.refresh());
}
