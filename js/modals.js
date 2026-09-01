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
const qPassageirosWidget = createPassengerListWidget('qPassageirosListContainer');

let quickReserveContext = null; // { local, carro, dataIda }

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
  syncAllTimePickerControls();
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

  syncAllTimePickerControls();
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
  try{
    await saveReservations(list);
  }catch(error){
    await hydrateDatabaseState();
    setQError('horarioRetirada', error.message);
    return;
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

function createReservationRangePicker(startInput, endInput, triggerEl, calendarEl, getUnavailableSetFn, options){
  const settings = options || {};
  let viewYear;
  let viewMonth;
  const startLabel = triggerEl.querySelector('[data-range-start-label]') || document.getElementById('rangeStartLabel');
  const endLabel = triggerEl.querySelector('[data-range-end-label]') || document.getElementById('rangeEndLabel');
  const pickerContainer = settings.containerEl || triggerEl.closest('.range-picker-field') || triggerEl.parentElement;
  const hint = pickerContainer.querySelector('[data-range-hint]') || document.getElementById('rangePickerHint');

  function syncView(){
    const source = startInput.value || todayISO();
    const [year, month] = source.split('-').map(Number);
    viewYear = year;
    viewMonth = month - 1;
  }

  function shortDate(iso){
    if(!iso) return 'Selecionar data';
    const [year, month, day] = iso.split('-').map(Number);
    return day + ' ' + MESES[month - 1].slice(0, 3).toLowerCase() + ' ' + year;
  }

  function dispatchDateChange(input){
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function rangeContainsUnavailable(start, end, unavailable){
    let found = false;
    eachDateISOInRange(start, end, iso => {
      if(unavailable.has(iso)) found = true;
    });
    return found;
  }

  function updateSummary(){
    startLabel.textContent = shortDate(startInput.value);
    endLabel.textContent = shortDate(endInput.value);
    triggerEl.classList.toggle('has-selection', !!startInput.value);

    const rules = getReservationRules();
    const maxRangeDays = settings.maxRangeDays === null
      ? null
      : (typeof settings.maxRangeDays === 'function' ? settings.maxRangeDays() : (settings.maxRangeDays || rules.maxConsecutiveDays));
    if(!startInput.value){
      hint.textContent = settings.emptyHint || 'Selecione a data de ida e depois a data de volta.';
    } else if(!endInput.value){
      hint.textContent = settings.selectEndHint || (maxRangeDays
        ? 'Agora selecione o fim — período máximo de ' + maxRangeDays + ' dias.'
        : 'Agora selecione a data final do período.');
    } else {
      const total = daysBetweenInclusive(startInput.value, endInput.value);
      hint.textContent = total + (total === 1 ? ' dia selecionado.' : ' dias selecionados.');
    }
  }

  function render(){
    updateSummary();
    const availability = getUnavailableSetFn();
    const unavailable = availability instanceof Set ? availability : (availability.unavailable || new Set());
    const occupied = availability instanceof Set ? new Set() : (availability.occupied || new Set());
    const rules = getReservationRules();
    const today = todayISO();
    const maxAdvanceDays = settings.maxAdvanceDays === null
      ? null
      : (typeof settings.maxAdvanceDays === 'function' ? settings.maxAdvanceDays() : (settings.maxAdvanceDays || rules.maxAdvanceDays));
    const maxRangeDays = settings.maxRangeDays === null
      ? null
      : (typeof settings.maxRangeDays === 'function' ? settings.maxRangeDays() : (settings.maxRangeDays || rules.maxConsecutiveDays));
    const advanceLimit = maxAdvanceDays == null ? null : addDaysISO(today, maxAdvanceDays);
    const selectingEnd = !!startInput.value && !endInput.value;
    const maxEnd = selectingEnd && maxRangeDays ? addDaysISO(startInput.value, maxRangeDays - 1) : null;
    const startTitle = settings.startTitle || 'Escolha a ida';
    const endTitle = settings.endTitle || 'Escolha a volta';
    const startSubtitle = typeof settings.startSubtitle === 'function'
      ? settings.startSubtitle()
      : (settings.startSubtitle || (maxAdvanceDays == null ? 'Selecione a data inicial' : 'Até ' + maxAdvanceDays + ' dias de antecedência'));
    const endSubtitle = typeof settings.endSubtitle === 'function'
      ? settings.endSubtitle()
      : (settings.endSubtitle || (maxRangeDays == null ? 'Selecione a data final' : 'Até ' + maxRangeDays + ' dias consecutivos'));

    let html =
      '<div class="range-calendar-topline">' +
        '<div><strong>' + escapeHTML(selectingEnd ? endTitle : startTitle) + '</strong>' +
        '<span>' + escapeHTML(selectingEnd ? endSubtitle : startSubtitle) + '</span></div>' +
      '</div>' +
      '<div class="range-calendar-header">' +
        '<button type="button" class="range-calendar-nav" data-range-nav="prev" aria-label="Mês anterior">‹</button>' +
        '<strong>' + MESES[viewMonth] + ' de ' + viewYear + '</strong>' +
        '<button type="button" class="range-calendar-nav" data-range-nav="next" aria-label="Próximo mês">›</button>' +
      '</div>' +
      '<div class="range-calendar-grid">';

    DIAS_SEMANA.forEach(day => {
      html += '<span class="range-calendar-weekday">' + day.charAt(0) + '</span>';
    });

    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    const totalDays = daysInMonth(viewYear, viewMonth);
    const previousDays = daysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);

    for(let index = 0; index < 42; index++){
      const offset = index - firstWeekday + 1;
      let day;
      let year;
      let monthIndex;
      let otherMonth = false;

      if(offset < 1){
        day = previousDays + offset;
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
      }

      const iso = isoFromParts(year, monthIndex, day);
      const isPast = !otherMonth && settings.allowPast !== true && iso < today;
      const isUnavailable = !otherMonth && unavailable.has(iso);
      const hasOccupiedTimes = !otherMonth && !isUnavailable && occupied.has(iso);
      const isBeyondAdvance = !otherMonth && advanceLimit && (!selectingEnd || iso < startInput.value) && iso > advanceLimit;
      const isAfterMaxEnd = !otherMonth && maxEnd && selectingEnd && iso >= startInput.value && iso > maxEnd;
      const crossesUnavailable = !otherMonth && selectingEnd && iso >= startInput.value &&
        rangeContainsUnavailable(startInput.value, iso, unavailable);
      const disabled = otherMonth || isPast || isUnavailable || isBeyondAdvance || isAfterMaxEnd || crossesUnavailable;
      const isStart = iso === startInput.value;
      const isEnd = iso === endInput.value;
      const hasFullRange = startInput.value && endInput.value && startInput.value !== endInput.value;
      const inRange = hasFullRange && iso >= startInput.value && iso <= endInput.value;

      let classes = 'range-calendar-day';
      if(otherMonth) classes += ' other-month';
      if(isPast || isBeyondAdvance || isAfterMaxEnd || crossesUnavailable) classes += ' disabled';
      if(isUnavailable) classes += ' unavailable';
      if(hasOccupiedTimes) classes += ' partially-unavailable';
      if(iso === today) classes += ' today';
      if(inRange) classes += ' in-range';
      if(isStart) classes += ' range-start';
      if(isEnd) classes += ' range-end';

      const availabilityLabel = isUnavailable
        ? ' — indisponível'
        : (hasOccupiedTimes ? ' — possui horários ocupados' : '');

      html += '<button type="button" class="' + classes + '" data-range-iso="' + iso + '"' +
        (disabled ? ' disabled' : '') + ' aria-label="' + day + ' de ' + MESES[monthIndex] + ' de ' + year +
        availabilityLabel + '">' +
        '<span>' + day + '</span></button>';
    }

    html += '</div>' +
      '<div class="range-calendar-legend">' +
        '<span><i class="range-legend-dot selected"></i>Período</span>' +
        '<span><i class="range-legend-dot partially-unavailable"></i>Horários ocupados</span>' +
        '<span><i class="range-legend-dot unavailable"></i>Indisponível</span>' +
      '</div>' +
      '<div class="range-calendar-actions">' +
        '<button type="button" class="range-clear-btn" data-range-action="clear">Limpar</button>' +
        '<button type="button" class="range-apply-btn" data-range-action="close"' + (!endInput.value ? ' disabled' : '') + '>Aplicar período</button>' +
      '</div>';

    calendarEl.innerHTML = html;
  }

  function open(){
    syncView();
    render();
    calendarEl.classList.remove('hidden');
    triggerEl.setAttribute('aria-expanded', 'true');
  }

  function close(){
    calendarEl.classList.add('hidden');
    triggerEl.setAttribute('aria-expanded', 'false');
  }

  triggerEl.addEventListener('click', function(){
    if(calendarEl.classList.contains('hidden')) open();
    else close();
  });

  calendarEl.addEventListener('click', function(e){
    // O calendário é renderizado novamente após cada ação. Sem interromper a
    // propagação, o alvo removido deixa de pertencer ao campo e o listener
    // global interpreta o clique como externo, fechando o seletor.
    e.stopPropagation();

    const nav = e.target.closest('[data-range-nav]');
    if(nav){
      if(nav.getAttribute('data-range-nav') === 'prev'){
        viewMonth--;
        if(viewMonth < 0){ viewMonth = 11; viewYear--; }
      } else {
        viewMonth++;
        if(viewMonth > 11){ viewMonth = 0; viewYear++; }
      }
      render();
      return;
    }

    const action = e.target.closest('[data-range-action]');
    if(action){
      if(action.getAttribute('data-range-action') === 'clear'){
        startInput.value = '';
        endInput.value = '';
        dispatchDateChange(startInput);
        dispatchDateChange(endInput);
        syncView();
        render();
      } else if(endInput.value){
        close();
      }
      return;
    }

    const dayButton = e.target.closest('[data-range-iso]');
    if(!dayButton || dayButton.disabled) return;
    const iso = dayButton.getAttribute('data-range-iso');

    if(!startInput.value || endInput.value){
      startInput.value = iso;
      endInput.value = '';
    } else if(iso < startInput.value){
      startInput.value = iso;
      endInput.value = '';
    } else {
      endInput.value = iso;
    }
    dispatchDateChange(startInput);
    dispatchDateChange(endInput);
    render();
  });

  document.addEventListener('click', function(e){
    if(!calendarEl.classList.contains('hidden') && !pickerContainer.contains(e.target)){
      close();
    }
  });

  const controller = {
    refresh:function(){
      updateSummary();
      if(!calendarEl.classList.contains('hidden')) render();
    },
    close:close
  };
  datePickers.push(controller);
  updateSummary();
  return controller;
}

function createDatePicker(inputEl, wrapperEl, getBlockedSetFn, options){
  if(!inputEl || !wrapperEl) return null;
  const settings = options || {};
  const blockedDates = typeof getBlockedSetFn === 'function' ? getBlockedSetFn : () => new Set();
  let viewYear, viewMonth;
  const popup = document.createElement('div');
  popup.className = 'date-popup range-style-date-popup';
  wrapperEl.appendChild(popup);

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
    const totalCells = 42;

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
  }

  function close(){
    popup.classList.remove('show');
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
    close: close
  };

  datePickers.push(controller);
  return controller;
}

document.addEventListener('click', function(e){
  document.querySelectorAll('.date-input-wrapper').forEach(wrap => {
    if(!wrap.contains(e.target)){
      const popup = wrap.querySelector('.date-popup');
      if(popup) popup.classList.remove('show');
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

const blockStartDateInput = document.getElementById('blockStart');
const blockEndDateInput = document.getElementById('blockEnd');
createReservationRangePicker(
  blockStartDateInput,
  blockEndDateInput,
  document.getElementById('blockRangePickerTrigger'),
  document.getElementById('blockRangeCalendar'),
  () => new Set(),
  {
    maxAdvanceDays:null,
    maxRangeDays:null,
    startTitle:'Escolha o início',
    endTitle:'Escolha o fim',
    startSubtitle:'Data inicial do bloqueio',
    endSubtitle:'Data final do bloqueio',
    emptyHint:'Selecione o início e depois o fim do bloqueio.'
  }
);

const reportStartDateInput = document.getElementById('reportStart');
const reportEndDateInput = document.getElementById('reportEnd');
createReservationRangePicker(
  reportStartDateInput,
  reportEndDateInput,
  document.getElementById('reportRangePickerTrigger'),
  document.getElementById('reportRangeCalendar'),
  () => new Set(),
  {
    allowPast:true,
    maxAdvanceDays:null,
    maxRangeDays:null,
    startTitle:'Escolha a data inicial',
    endTitle:'Escolha a data final',
    startSubtitle:'Início do período do relatório',
    endSubtitle:'Fim do período do relatório',
    emptyHint:'Selecione a data inicial e depois a data final.'
  }
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
