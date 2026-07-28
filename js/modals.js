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

joinConfirmOkBtn.addEventListener('click', function(){
  if(!joinConfirmContext) return;
  const { id, origin } = joinConfirmContext;
  closeJoinConfirmModal();

  if(origin === 'available'){
    joinRideFromAvailable(id);
  } else if(origin === 'calendar'){
    joinRideFromCalendar(id);
  } else {
    joinRide(id);
  }
});

calPrevBtn.addEventListener('click', function(){
  calViewMonth--;
  if(calViewMonth < 0){ calViewMonth = 11; calViewYear--; }
  calendarDayDetails.classList.add('hidden');
  calendarDayDetails.innerHTML = '';
  calSelectedISO = null;
  renderMainCalendar();
});

calNextBtn.addEventListener('click', function(){
  calViewMonth++;
  if(calViewMonth > 11){ calViewMonth = 0; calViewYear++; }
  calendarDayDetails.classList.add('hidden');
  calendarDayDetails.innerHTML = '';
  calSelectedISO = null;
  renderMainCalendar();
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
const qPassageirosWidget = createPassengerListWidget('qPassageirosListContainer');

let quickReserveContext = null; // { filial, carro, dataIda }

populateHorarioOptions(qHorarioRetiradaSelect);
populateHorarioOptions(qHorarioDevolucaoSelect);

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
  ['destino','dataVolta','horarioRetirada','horarioDevolucao','passageirosConfirmados'].forEach(id => setQError(id, ''));
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

function openQuickReserveModal(dataIda){
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
  qPassageirosWidget.clear();
  clearQErrors();
  refreshDatePickers();

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

quickReserveForm.addEventListener('submit', function(e){
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
  const validacaoPassageiros = validarListaPassageiros(currentUser.nome, qPassageirosWidget.getNomes());
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

  if(!validacaoPassageiros.ok){
    setQError('passageirosConfirmados', validacaoPassageiros.message);
    valid = false;
  }

  if(valid && horarioRetirada && horarioDevolucao){
    const conflitos = findConflictingReservations(quickReserveContext.filial, quickReserveContext.carro, dataIda, dataVolta, horarioRetirada, horarioDevolucao, null);
    if(conflitos.length > 0){
      setQError('horarioRetirada', 'Este carro já está reservado neste horário. ' + buildConflictMessage(conflitos));
      setQError('horarioDevolucao', 'Verifique o calendário: horários ocupados para este carro.');
      valid = false;
    }
  }

  if(!valid) return;

  const reserva = {
    id: Date.now(),
    nome: currentUser.nome,
    email: '',
    partida: quickReserveContext.filial,
    destino: destino,
    carro: quickReserveContext.carro,
    dataIda: dataIda,
    dataVolta: dataVolta,
    horarioRetirada: horarioRetirada,
    horarioDevolucao: horarioDevolucao,
    passageiros: [{ nome: currentUser.nome }].concat(validacaoPassageiros.passageiros),
    passageirosConfirmados: 0
  };

  const list = getReservations();
  list.push(reserva);
  saveReservations(list);

  closeQuickReserveModal();

  const vagasRestantes = getVagasRestantes(reserva);
  calConfirmationText.textContent = 'Reserva confirmada! ' + reserva.partida + ' → ' + reserva.destino + ' (Polo final ' + reserva.carro + ') de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '.';
  calConfirmation.classList.add('show');

  renderMainCalendar();
  showDayDetails(dataIda);
  renderMyReservations();
  renderAvailableRides();
  refreshDatePickers();

  setTimeout(() => {
    calConfirmation.classList.remove('show');
  }, 6000);
});

/* =========================================================
   Date picker customizado com bloqueio de datas já reservadas
   (bloqueio agora é por carro específico, não por rota)
   ========================================================= */
const datePickers = [];

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

createDatePicker(dataIdaInput, document.getElementById('wrap-dataIda'), () => getCarReservedDates(partidaSelect.value, carroSelect.value));
createDatePicker(dataVoltaInput, document.getElementById('wrap-dataVolta'), () => getCarReservedDates(partidaSelect.value, carroSelect.value));
createDatePicker(qDataVoltaInput, document.getElementById('wrap-qDataVolta'), () => {
  if(!quickReserveContext) return new Set();
  return getCarReservedDates(quickReserveContext.filial, quickReserveContext.carro);
});

function refreshDatePickers(){
  datePickers.forEach(p => p.refresh());
}
