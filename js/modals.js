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

  joinConfirmRoute.textContent = reserva.partida + ' → ' + reserva.destino + ' · Polo final ' + reserva.carro + ' · ' + formatDate(reserva.dataIda) + ' a ' + formatDate(reserva.dataVolta);
  joinConfirmOccupants.innerHTML = renderOcupantesHTML(reserva);

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

  if(origin === 'available'){
    await joinRideFromAvailable(id);
  } else if(origin === 'calendar'){
    await joinRideFromCalendar(id);
  } else {
    await joinRide(id);
  }
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
const qResponsavelInput = document.getElementById('qResponsavel');
const qPassageirosWidget = createPassengerListWidget('qPassageirosListContainer');

let quickReserveContext = null; // { filial, carro, dataIda }

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
    quickReserveContext.filial,
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
    quickReserveContext.filial,
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
  ['destino','dataVolta','horarioRetirada','horarioDevolucao','passageirosConfirmados','motivo','responsavel'].forEach(id => setQError(id, ''));
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

function populateQDestinoOptions(filial){
  let html = '<option value="">Selecione...</option>';
  CIDADES.forEach(cidade => {
    if(cidade === filial) return;
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

  const info = getSelectedCarInfo();
  if(!info) return;

  quickReserveContext = { filial: info.filial, carro: info.carro, dataIda: dataIda };

  quickReserveSummary.textContent = 'Polo final ' + info.carro + ' — Filial: ' + info.filial + ' — Data de ida: ' + formatDate(dataIda);

  populateQDestinoOptions(info.filial);
  qDataVoltaInput.value = dataIda;
  qHorarioRetiradaSelect.value = '';
  qHorarioDevolucaoSelect.value = '';
  qMotivoInput.value = '';
  qResponsavelInput.value = currentUser.nome;
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

  quickReserveModal.classList.remove('hidden');
}

function closeQuickReserveModal(){
  quickReserveModal.classList.add('hidden');
  quickReserveContext = null;
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
  if(!quickReserveContext) return;

  let valid = true;
  const destino = getQDestinoValue();
  const dataVolta = qDataVoltaInput.value;
  const horarioRetirada = qHorarioRetiradaSelect.value;
  const horarioDevolucao = qHorarioDevolucaoSelect.value;
  const motivo = qMotivoInput.value.trim();
  const responsavel = qResponsavelInput.value.trim();
  const vehicle = getVehicle(quickReserveContext.filial, quickReserveContext.carro);
  const validacaoPassageiros = validarListaPassageiros(currentUser.nome, qPassageirosWidget.getNomes(), Math.max(0, Number(vehicle && vehicle.capacidade ? vehicle.capacidade : CAPACIDADE_MAXIMA) - 1));
  const dataIda = quickReserveContext.dataIda;

  if(!qDestinoSelect.value){
    setQError('destino', 'Selecione o destino.');
    valid = false;
  } else if(qDestinoSelect.value === 'Outro' && !destino){
    setQError('destino', 'Digite o destino.');
    valid = false;
  }

  if(destino && destino === quickReserveContext.filial){
    setQError('destino', 'Destino deve ser diferente da partida.');
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

  if(!motivo){ setQError('motivo', 'Informe o motivo da viagem.'); valid = false; }
  if(!responsavel){ setQError('responsavel', 'Informe o responsável.'); valid = false; }

  if(valid && horarioRetirada && horarioDevolucao){
    const conflitos = findConflictingReservations(quickReserveContext.filial, quickReserveContext.carro, dataIda, dataVolta, horarioRetirada, horarioDevolucao, null);
    if(conflitos.length > 0){
      setQError('horarioRetirada', 'Este carro já está reservado neste horário. ' + buildConflictMessage(conflitos));
      setQError('horarioDevolucao', 'Verifique o calendário: horários ocupados para este carro.');
      valid = false;
    }
    const bloqueios = findVehicleBlocks(quickReserveContext.filial, quickReserveContext.carro, dataIda, dataVolta, null);
    if(bloqueios.length > 0){
      setQError('dataVolta', 'Veículo indisponível no período: ' + bloqueios.map(b => b.tipo).join(', ') + '.');
      valid = false;
    }
  }

  if(!valid) return;

  const reserva = {
    id: Date.now(),
    criadorUsuarioId: currentUser.id,
    nome: currentUser.nome,
    email: '',
    partida: quickReserveContext.filial,
    destino: destino,
    carro: quickReserveContext.carro,
    dataIda: dataIda,
    dataVolta: dataVolta,
    horarioRetirada: horarioRetirada,
    horarioDevolucao: horarioDevolucao,
    motivo: motivo,
    responsavel: responsavel,
    status: 'confirmada',
    criadoEm: new Date().toISOString(),
    passageiros: [{ nome: currentUser.nome }].concat(validacaoPassageiros.passageiros),
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
  logAudit('criou', 'reserva', reserva.id, reserva.partida + ' → ' + reserva.destino + ' · reserva rápida');

  closeQuickReserveModal();

  const vagasRestantes = getVagasRestantes(reserva);
  const successMessage = 'Reserva confirmada! ' + reserva.partida + ' → ' + reserva.destino + ' (Polo final ' + reserva.carro + ') de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '.';

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

function createReservationRangePicker(startInput, endInput, triggerEl, calendarEl, getUnavailableSetFn){
  let viewYear;
  let viewMonth;
  const startLabel = document.getElementById('rangeStartLabel');
  const endLabel = document.getElementById('rangeEndLabel');
  const hint = document.getElementById('rangePickerHint');

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
    if(!startInput.value){
      hint.textContent = 'Selecione a data de ida e depois a data de volta.';
    } else if(!endInput.value){
      hint.textContent = 'Agora selecione a volta — período máximo de ' + rules.maxConsecutiveDays + ' dias.';
    } else {
      const total = daysBetweenInclusive(startInput.value, endInput.value);
      hint.textContent = total + (total === 1 ? ' dia selecionado.' : ' dias selecionados.');
    }
  }

  function render(){
    updateSummary();
    const unavailable = getUnavailableSetFn();
    const rules = getReservationRules();
    const today = todayISO();
    const advanceLimit = addDaysISO(today, rules.maxAdvanceDays);
    const selectingEnd = !!startInput.value && !endInput.value;
    const maxEnd = selectingEnd ? addDaysISO(startInput.value, rules.maxConsecutiveDays - 1) : null;

    let html =
      '<div class="range-calendar-topline">' +
        '<div><strong>' + (selectingEnd ? 'Escolha a volta' : 'Escolha a ida') + '</strong>' +
        '<span>' + (selectingEnd ? 'Até ' + rules.maxConsecutiveDays + ' dias consecutivos' : 'Até ' + rules.maxAdvanceDays + ' dias de antecedência') + '</span></div>' +
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
      const isPast = !otherMonth && iso < today;
      const isUnavailable = !otherMonth && unavailable.has(iso);
      const isBeyondAdvance = !otherMonth && (!selectingEnd || iso < startInput.value) && iso > advanceLimit;
      const isAfterMaxEnd = !otherMonth && selectingEnd && iso >= startInput.value && iso > maxEnd;
      const crossesUnavailable = !otherMonth && selectingEnd && iso >= startInput.value &&
        rangeContainsUnavailable(startInput.value, iso, unavailable);
      const disabled = otherMonth || isPast || isUnavailable || isBeyondAdvance || isAfterMaxEnd || crossesUnavailable;
      const isStart = iso === startInput.value;
      const isEnd = iso === endInput.value;
      const inRange = startInput.value && endInput.value && iso > startInput.value && iso < endInput.value;

      let classes = 'range-calendar-day';
      if(otherMonth) classes += ' other-month';
      if(isPast || isBeyondAdvance || isAfterMaxEnd || crossesUnavailable) classes += ' disabled';
      if(isUnavailable) classes += ' unavailable';
      if(iso === today) classes += ' today';
      if(inRange) classes += ' in-range';
      if(isStart) classes += ' range-start';
      if(isEnd) classes += ' range-end';

      html += '<button type="button" class="' + classes + '" data-range-iso="' + iso + '"' +
        (disabled ? ' disabled' : '') + ' aria-label="' + day + ' de ' + MESES[monthIndex] + ' de ' + year + '">' +
        '<span>' + day + '</span></button>';
    }

    html += '</div>' +
      '<div class="range-calendar-legend">' +
        '<span><i class="range-legend-dot selected"></i>Período</span>' +
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
    if(!calendarEl.classList.contains('hidden') && !document.getElementById('field-dataIda').contains(e.target)){
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

function createDatePicker(inputEl, wrapperEl, getBlockedSetFn){
  let viewYear, viewMonth;
  const popup = document.createElement('div');
  popup.className = 'date-popup';
  wrapperEl.appendChild(popup);

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
    const blocked = getBlockedSetFn();
    const today = todayISO();
    const selected = inputEl.value;

    let html = '<div class="date-popup-header">' +
                 '<button type="button" class="date-popup-nav-btn" data-nav="prev">&#8249;</button>' +
                 '<span>' + MESES[viewMonth] + ' ' + viewYear + '</span>' +
                 '<button type="button" class="date-popup-nav-btn" data-nav="next">&#8250;</button>' +
               '</div>' +
               '<div class="date-popup-grid">';

    DIAS_SEMANA.forEach(d => {
      html += '<div class="date-popup-weekday">' + d.charAt(0) + '</div>';
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
      const isPast = !otherMonth && iso < today;

      let classes = 'date-popup-day';
      if(otherMonth) classes += ' other-month';
      else if(isBlocked) classes += ' blocked';
      else if(isPast) classes += ' past';
      if(!otherMonth && iso === selected) classes += ' selected';

      html += '<div class="' + classes + '" data-iso="' + iso + '" data-other="' + (otherMonth ? '1' : '0') + '" data-blocked="' + (isBlocked ? '1' : '0') + '" data-past="' + (isPast ? '1' : '0') + '">' + day + '</div>';
    }

    html += '</div>' +
            '<div class="date-popup-legend">' +
              '<span><span class="date-popup-blocked-dot"></span>Ocupado para este carro</span>' +
            '</div>';

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

createReservationRangePicker(
  dataIdaInput,
  dataVoltaInput,
  document.getElementById('rangePickerTrigger'),
  document.getElementById('reservationRangeCalendar'),
  () => {
    const unavailable = getCarReservedDates(partidaSelect.value, carroSelect.value);
    if(!partidaSelect.value || !carroSelect.value) return unavailable;
    const rules = getReservationRules();
    const endLimit = addDaysISO(todayISO(), rules.maxAdvanceDays + rules.maxConsecutiveDays);
    findVehicleBlocks(partidaSelect.value, carroSelect.value, todayISO(), endLimit, null).forEach(block => {
      eachDateISOInRange(block.dataInicio, block.dataFim, iso => unavailable.add(iso));
    });
    return unavailable;
  }
);
createDatePicker(qDataVoltaInput, document.getElementById('wrap-qDataVolta'), () => {
  if(!quickReserveContext) return new Set();
  return getCarReservedDates(quickReserveContext.filial, quickReserveContext.carro);
});

function refreshDatePickers(){
  datePickers.forEach(p => p.refresh());
}
