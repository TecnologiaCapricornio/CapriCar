/* Funções utilitárias de datas, horários e conflitos */
/* =========================================================
   Utilitários gerais
   ========================================================= */
function pad2(n){
  return String(n).padStart(2, '0');
}

function reservationHasOperationReport(reservation){
  return ['retirada', 'devolucao'].some(phase => {
    const record = reservation && reservation.operacao && reservation.operacao[phase];
    if(!record) return false;
    return String(record.avarias || '').trim().length > 0 ||
      (Array.isArray(record.fotos) && record.fotos.length > 0);
  });
}

function escapeHTML(value){
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Badge visual da placa (formato/cores do padrão Mercosul, sem os detalhes
// de "BRASIL"/bandeira/estrelas) - reaproveitado em toda lista/cartão que
// hoje só mostra a placa como texto simples. Devolve '' se não houver placa.
function plateBadgeHTML(placa, small){
  const value = String(placa || '').trim().toUpperCase();
  if(!value) return '';
  return '<span class="plate-badge' + (small ? ' plate-badge-sm' : '') +
      '" role="img" aria-label="Placa ' + escapeHTML(value) + '">' +
    '<span class="plate-badge-top"></span>' +
    '<span class="plate-badge-text">' + escapeHTML(value) + '</span>' +
  '</span>';
}

function isoFromParts(year, monthIndex, day){
  return year + '-' + pad2(monthIndex + 1) + '-' + pad2(day);
}

function todayISO(){
  const t = new Date();
  return isoFromParts(t.getFullYear(), t.getMonth(), t.getDate());
}

function addDaysISO(iso, days){
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysBetweenInclusive(startISO, endISO){
  if(!startISO || !endISO || endISO < startISO) return 0;
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  return Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
}

function daysInMonth(year, monthIndex){
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function formatDate(dateStr){
  if(!dateStr) return '';
  const [y,m,d] = dateStr.split('-');
  return d + '/' + m + '/' + y;
}

const RESERVATION_CALENDAR_ICON = '<svg class="reservation-moment-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="3" y="5" width="18" height="16" rx="2"></rect>' +
  '<path d="M8 3v4M16 3v4M3 10h18"></path></svg>';
const RESERVATION_CLOCK_ICON = '<svg class="reservation-moment-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>';

function renderReservationMoment(date, time, label){
  return '<span class="reservation-moment">' +
    (label ? '<span class="reservation-moment-label">' + escapeHTML(label) + '</span>' : '') +
    '<span class="reservation-moment-part">' + RESERVATION_CALENDAR_ICON +
      '<strong>' + escapeHTML(formatDate(date)) + '</strong></span>' +
    (time ? '<span class="reservation-moment-part">' + RESERVATION_CLOCK_ICON +
      '<strong>' + escapeHTML(time) + '</strong></span>' : '') +
  '</span>';
}

function renderReservationPeriod(reservation){
  return renderReservationMoment(reservation.dataIda, reservation.horarioRetirada, 'Ida') +
    renderReservationMoment(reservation.dataVolta, reservation.horarioDevolucao, 'Volta');
}

function eachDateISOInRange(startISO, endISO, callback){
  if(!startISO || !endISO) return;
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const oneDay = 86400000;
  let guard = 0;
  while(cur <= end && guard < 3660){
    const d = new Date(cur);
    callback(isoFromParts(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    cur += oneDay;
    guard++;
  }
}

// Converte "HH:MM" em minutos desde 00:00. Retorna 0 para valores vazios/; usado
// para compatibilidade com reservas antigas que podem não ter horário definido.
function horaParaMinutos(hhmm){
  if(!hhmm) return 0;
  const [hh, mm] = hhmm.split(':').map(Number);
  if(!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

const MIN_DIA = 0;
const MAX_DIA = 24 * 60; // 1440 — meia-noite do dia seguinte

// Retorna o intervalo [inicioMin, fimMin) em minutos (0-1440) que uma reserva ocupa
// do carro em um dia (iso) específico dentro do seu período [dataIda, dataVolta].
// - No primeiro dia: do horário de retirada até 23:59 (1440), a menos que seja também o último dia.
// - No último dia: de 00:00 até o horário de devolução.
// - Nos dias intermediários: dia inteiro (00:00 - 24:00).
// - Se dataIda === dataVolta (mesmo dia): do horário de retirada até o horário de devolução.
// Retorna null se o iso não estiver dentro do período da reserva.
function getOccupiedMinutesRangeForDate(reserva, iso){
  if(iso < reserva.dataIda || iso > reserva.dataVolta) return null;

  const isFirstDay = iso === reserva.dataIda;
  const isLastDay = iso === reserva.dataVolta;

  let inicio, fim;

  if(isFirstDay && isLastDay){
    inicio = horaParaMinutos(reserva.horarioRetirada);
    fim = horaParaMinutos(reserva.horarioDevolucao) || MAX_DIA;
    if(fim <= inicio) fim = MAX_DIA; // reserva sem horário de devolução válido: considera até o fim do dia
  } else if(isFirstDay){
    inicio = horaParaMinutos(reserva.horarioRetirada);
    fim = MAX_DIA;
  } else if(isLastDay){
    inicio = MIN_DIA;
    fim = horaParaMinutos(reserva.horarioDevolucao) || MAX_DIA;
  } else {
    inicio = MIN_DIA;
    fim = MAX_DIA;
  }

  return { inicio: inicio, fim: fim };
}

// Verifica se duas reservas do MESMO carro conflitam: precisam ter datas que se
// sobrepõem e, nos dias em comum, faixas de horário que se sobrepõem.
function reservationAbsoluteRange(reservation){
  const parse = (date, time) => {
    const dateParts = String(date || '').split('-').map(Number);
    const timeParts = String(time || '').split(':').map(Number);
    if(dateParts.length !== 3 || timeParts.length !== 2 ||
       [...dateParts, ...timeParts].some(value => !Number.isFinite(value))) return NaN;
    return Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1]);
  };
  return {
    start:parse(reservation.dataIda, reservation.horarioRetirada),
    end:parse(reservation.dataVolta, reservation.horarioDevolucao)
  };
}

function normalizeCityName(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getRodizioWarning(reservation){
  if(!reservation ||
     (normalizeCityName(reservation.partida) !== 'sao paulo' &&
      normalizeCityName(reservation.destino) !== 'sao paulo')) return null;
  if(!reservation.carro || !reservation.dataIda) return null;

  const vehicle = typeof getVehicle === 'function'
    ? getVehicle(reservation.partida, reservation.carro)
    : null;
  const plate = String(vehicle && vehicle.placa || '').trim().toUpperCase();
  const finalDigit = (plate.match(/\d(?=\D*$)/) || [])[0];
  if(!finalDigit) return null;

  const restrictedWeekday = {
    '1':1, '2':1,
    '3':2, '4':2,
    '5':3, '6':3,
    '7':4, '8':4,
    '9':5, '0':5
  }[finalDigit];
  const weekdayNames = {
    1:'segunda-feira', 2:'terça-feira', 3:'quarta-feira',
    4:'quinta-feira', 5:'sexta-feira'
  };
  const endDate = reservation.dataVolta || reservation.dataIda;
  if(endDate < reservation.dataIda) return null;
  const range = reservationAbsoluteRange({
    dataIda:reservation.dataIda,
    horarioRetirada:reservation.horarioRetirada || '00:00',
    dataVolta:endDate,
    horarioDevolucao:reservation.horarioDevolucao || '23:59'
  });
  if(!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) return null;

  const affectedDates = [];
  for(let cursor = reservation.dataIda; cursor <= endDate; cursor = addDaysISO(cursor, 1)){
    const parts = cursor.split('-').map(Number);
    const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
    if(weekday !== restrictedWeekday) continue;
    const restrictionRanges = [
      { start:Date.UTC(parts[0], parts[1] - 1, parts[2], 7, 0), end:Date.UTC(parts[0], parts[1] - 1, parts[2], 10, 0) },
      { start:Date.UTC(parts[0], parts[1] - 1, parts[2], 17, 0), end:Date.UTC(parts[0], parts[1] - 1, parts[2], 20, 0) }
    ];
    if(restrictionRanges.some(period => range.start < period.end && range.end > period.start)){
      affectedDates.push(cursor);
    }
  }
  if(!affectedDates.length) return null;

  const dates = affectedDates.slice(0, 3).map(formatDate).join(', ') +
    (affectedDates.length > 3 ? ' e mais ' + (affectedDates.length - 3) : '');
  return {
    finalDigit:finalDigit,
    plate:plate,
    weekday:weekdayNames[restrictedWeekday],
    affectedDates:affectedDates,
    message:'O veículo ' + (vehicle ? getVehicleFullModel(vehicle) + ' · ' : '') + plate +
      ' (placa final ' + finalDigit + ') tem rodízio às ' + weekdayNames[restrictedWeekday] +
      ', das 7h às 10h e das 17h às 20h. O período selecionado coincide em ' + dates +
      '. Verifique se o trajeto passa pelo Centro Expandido de São Paulo.'
  };
}

function updateRodizioWarning(element, reservation){
  if(!element) return;
  const warning = getRodizioWarning(reservation);
  element.textContent = warning ? warning.message : '';
  element.classList.toggle('hidden', !warning);
}

function reservasConflitam(r1, r2){
  const range1 = reservationAbsoluteRange(r1);
  const range2 = reservationAbsoluteRange(r2);
  if(!Number.isFinite(range1.start) || !Number.isFinite(range1.end) ||
     !Number.isFinite(range2.start) || !Number.isFinite(range2.end)) return false;
  const rules = typeof getReservationRules === 'function' ? getReservationRules() : {};
  const bufferMs = Math.max(0, Number(rules.reservationBufferMinutes) || 0) * 60 * 1000;
  return range1.start < range2.end + bufferMs &&
    range1.end > range2.start - bufferMs;
}

function reservationConflictPrefix(){
  const rules = typeof getReservationRules === 'function' ? getReservationRules() : {};
  const minutes = Math.max(0, Number(rules.reservationBufferMinutes) || 0);
  return minutes > 0
    ? 'Este carro está indisponível no período. É necessário deixar ' + minutes + ' minutos livres entre as reservas. '
    : 'Este carro já está reservado neste horário. ';
}

function normalizeReservationStatus(status){
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isReservationCompleted(reservation){
  if(!reservation) return false;
  if(reservation.operacao && reservation.operacao.devolucao) return true;
  return ['concluida', 'cancelada', 'devolvido', 'devolvida', 'encerrada_administrativamente'].includes(
    normalizeReservationStatus(reservation.status)
  );
}

// Verifica se uma reserva "candidata" (ainda não salva) conflitaria com as reservas
// já existentes do mesmo carro (mesma partida + mesmo número de carro). Permite
// excluir uma reserva pelo id (usado ao editar) — não utilizado atualmente, mas
// mantém a função genérica.
function findConflictingReservations(partida, carro, dataIda, dataVolta, horarioRetirada, horarioDevolucao, excludeId){
  const candidata = { dataIda: dataIda, dataVolta: dataVolta, horarioRetirada: horarioRetirada, horarioDevolucao: horarioDevolucao };
  return getReservations().filter(r => {
    if(isReservationCompleted(r)) return false;
    if(r.partida !== partida || r.carro !== carro) return false;
    if(excludeId != null && String(r.id) === String(excludeId)) return false;
    return reservasConflitam(candidata, r);
  });
}

// Usa o identificador da conta nas reservas novas. O nome é mantido como
// compatibilidade apenas para reservas antigas, criadas antes desse vínculo.
function isReservationCreator(reservation, user){
  if(!reservation || !user) return false;
  if(reservation.criadorUsuarioId && user.id){
    return String(reservation.criadorUsuarioId) === String(user.id);
  }
  return String(reservation.nome || '').trim().toLowerCase() ===
    String(user.nome || '').trim().toLowerCase();
}

function reservationPickupStart(reservation){
  if(!reservation || !reservation.dataIda || !reservation.horarioRetirada) return null;
  const dateParts = String(reservation.dataIda).split('-').map(Number);
  const timeParts = String(reservation.horarioRetirada).split(':').map(Number);
  if(dateParts.length !== 3 || timeParts.length !== 2 ||
     [...dateParts, ...timeParts].some(value => !Number.isFinite(value))) return null;
  return new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    timeParts[0],
    timeParts[1],
    0,
    0
  );
}

function canRegisterPickupNow(reservation, now){
  const availableFrom = reservationPickupAvailableFrom(reservation);
  if(!availableFrom) return false;
  return (now instanceof Date ? now : new Date()) >= availableFrom;
}

// A carona continua disponível mesmo após o horário previsto e deixa de aceitar
// passageiros somente quando a retirada é registrada ou a reserva é encerrada.
function reservationCanAcceptPassengers(reservation){
  if(!reservation || isReservationCompleted(reservation)) return false;
  if(reservation.operacao && reservation.operacao.retirada) return false;
  return true;
}

function reservationPickupAvailableFrom(reservation){
  const scheduled = reservationPickupStart(reservation);
  if(!scheduled) return null;
  const minutes = Math.max(0, Number(getReservationRules().pickupAdvanceMinutes) || 0);
  return new Date(scheduled.getTime() - minutes * 60 * 1000);
}

function formatPickupAvailableFrom(reservation){
  const availableFrom = reservationPickupAvailableFrom(reservation);
  if(!availableFrom) return '';
  return pad2(availableFrom.getDate()) + '/' + pad2(availableFrom.getMonth() + 1) + '/' +
    availableFrom.getFullYear() + ' às ' + pad2(availableFrom.getHours()) + ':' +
    pad2(availableFrom.getMinutes());
}

function getPendingReturnReservation(user, reservations){
  if(!user) return null;
  const list = Array.isArray(reservations) ? reservations : getReservations();
  return list.find(reservation =>
    isReservationCreator(reservation, user) &&
    !isReservationCompleted(reservation) &&
    reservation.operacao &&
    reservation.operacao.retirada &&
    !reservation.operacao.devolucao
  ) || null;
}

function pendingReturnReservationMessage(reservation){
  const number = getReservationNumberLabel(reservation);
  const trip = reservation
    ? String(reservation.partida || '') + ' → ' + String(reservation.destino || '')
    : '';
  const reference = [number, trip].filter(Boolean).join(' · ');
  return 'Registre a devolução' + (reference ? ' da reserva ' + reference : '') +
    ' antes de criar uma nova reserva.';
}

function getReservationNumberLabel(reservation){
  const number = Number(reservation && reservation.numeroReserva);
  return Number.isSafeInteger(number) && number > 0 ? '#' + number : '';
}

function renderReservationNumber(reservation){
  const label = getReservationNumberLabel(reservation);
  return label ? '<span class="reservation-id-badge">' + escapeHTML(label) + '</span>' : '';
}

function isReservationPickupInPast(date, time, now){
  const scheduled = reservationPickupStart({ dataIda:date, horarioRetirada:time });
  if(!scheduled) return false;
  return scheduled <= (now instanceof Date ? now : new Date());
}

// Formata a faixa horária ocupada por uma reserva em um dia específico, ex: "07:00 - 10:00".
// Para dias intermediários/parciais sem horário nesse dia específico, usa 00:00/23:59 como limites visuais.
function formatFaixaHorariaNoDia(reserva, iso){
  const faixa = getOccupiedMinutesRangeForDate(reserva, iso);
  if(!faixa) return '';
  const minutosParaHora = m => pad2(Math.floor(Math.min(m, 1439) / 60)) + ':' + pad2(Math.min(m, 1439) % 60);
  return minutosParaHora(faixa.inicio) + ' - ' + minutosParaHora(faixa.fim === MAX_DIA ? 1439 : faixa.fim);
}

function initials(name){
  if(!name) return '--';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if(parts.length === 0) return '--';
  if(parts.length === 1) return parts[0].substring(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Gera lista de horários de 30 em 30 minutos, 24 horas (00:00 até 23:30).
function gerarHorarios(){
  const horarios = [];
  for(let h = 0; h <= 23; h++){
    horarios.push(pad2(h) + ':00');
    horarios.push(pad2(h) + ':30');
  }
  return horarios;
}

function populateHorarioOptions(selectEl, availableTimes){
  const previousValue = selectEl.value;
  const horarios = Array.isArray(availableTimes) ? availableTimes : gerarHorarios();
  const placeholder = horarios.length ? 'Selecione...' : 'Nenhum horário disponível';
  selectEl.innerHTML = '<option value="">' + placeholder + '</option>' +
    horarios.map(h => '<option value="' + h + '">' + h + '</option>').join('');
  selectEl.disabled = horarios.length === 0;
  selectEl.value = horarios.includes(previousValue) ? previousValue : '';
  syncTimePickerControl(selectEl);
}

let activeTimePickerControl = null;

function getTimePickerOptions(selectEl){
  return Array.from(selectEl.options)
    .filter(option => option.value && !option.disabled)
    .map(option => option.value);
}

function closeTimePickerControl(control){
  if(!control) return;
  const trigger = control.querySelector('.time-picker-trigger');
  const popover = control.querySelector('.time-picker-popover');
  if(trigger) trigger.setAttribute('aria-expanded', 'false');
  if(popover) popover.classList.add('hidden');
  control.classList.remove('is-open');
  if(activeTimePickerControl === control) activeTimePickerControl = null;
}

function renderTimePickerOptions(selectEl){
  const control = selectEl.closest('.time-picker-control');
  if(!control) return;
  const optionsBox = control.querySelector('.time-picker-options');
  if(!optionsBox) return;
  const horarios = getTimePickerOptions(selectEl);

  optionsBox.innerHTML = horarios.length
    ? horarios.map(horario => {
      const activeClass = horario === selectEl.value ? ' is-selected' : '';
      const selected = horario === selectEl.value ? 'true' : 'false';
      return '<button type="button" class="time-picker-option' + activeClass + '" data-time="' +
        escapeHTML(horario) + '" role="option" aria-selected="' + selected + '">' +
        escapeHTML(horario) + '</button>';
    }).join('')
    : '<div class="time-picker-empty">Nenhum horário disponível para este período.</div>';
}

function syncTimePickerControl(selectEl){
  if(!selectEl) return;
  const control = selectEl.closest('.time-picker-control');
  if(!control) return;
  const trigger = control.querySelector('.time-picker-trigger');
  const value = selectEl.value;
  const hasOptions = getTimePickerOptions(selectEl).length > 0;
  if(trigger){
    const valueEl = trigger.querySelector('.time-picker-trigger-value');
    if(valueEl) valueEl.textContent = value || (hasOptions ? 'Selecionar horário' : 'Nenhum horário disponível');
    trigger.disabled = selectEl.disabled || !hasOptions;
    trigger.classList.toggle('has-value', Boolean(value));
  }
  if(control.classList.contains('is-open')) renderTimePickerOptions(selectEl);
}

function syncAllTimePickerControls(){
  document.querySelectorAll('.time-picker-native').forEach(syncTimePickerControl);
}

function initializeTimePickers(){
  const ids = [
    'horarioRetirada', 'horarioDevolucao',
    'qHorarioRetirada', 'qHorarioDevolucao',
    'aHorarioRetirada', 'aHorarioDevolucao'
  ];

  ids.forEach(id => {
    const selectEl = document.getElementById(id);
    if(!selectEl || selectEl.closest('.time-picker-control')) return;
    const label = document.querySelector('label[for="' + id + '"]');
    const fieldName = label ? label.textContent.replace('*', '').trim() : 'Horário';
    const control = document.createElement('div');
    control.className = 'time-picker-control';
    selectEl.parentNode.insertBefore(control, selectEl);
    control.appendChild(selectEl);
    selectEl.classList.add('time-picker-native');
    selectEl.setAttribute('aria-hidden', 'true');
    selectEl.tabIndex = -1;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'time-picker-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', fieldName);
    trigger.innerHTML =
      '<span class="time-picker-trigger-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5l3.4 2"></path></svg>' +
      '</span>' +
      '<span class="time-picker-trigger-value">Selecionar horário</span>' +
      '<span class="time-picker-trigger-chevron" aria-hidden="true">&#8964;</span>';

    const popover = document.createElement('div');
    popover.className = 'time-picker-popover hidden';
    popover.innerHTML =
      '<div class="time-picker-popover-header">' +
        '<div><strong>Escolha o horário</strong><small>' + escapeHTML(fieldName) + '</small></div>' +
        '<button type="button" class="time-picker-close" aria-label="Fechar seletor">&times;</button>' +
      '</div>' +
      '<div class="time-picker-options" role="listbox" aria-label="Horários disponíveis"></div>';

    control.appendChild(trigger);
    control.appendChild(popover);

    trigger.addEventListener('click', function(){
      const shouldOpen = !control.classList.contains('is-open');
      if(activeTimePickerControl && activeTimePickerControl !== control){
        closeTimePickerControl(activeTimePickerControl);
      }
      if(!shouldOpen){
        closeTimePickerControl(control);
        return;
      }
      renderTimePickerOptions(selectEl);
      popover.classList.remove('hidden');
      control.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      activeTimePickerControl = control;
      const selectedOption = popover.querySelector('.time-picker-option.is-selected');
      if(selectedOption) selectedOption.scrollIntoView({ block:'nearest' });
    });

    if(label){
      label.addEventListener('click', function(event){
        event.preventDefault();
        trigger.click();
      });
    }

    popover.addEventListener('click', function(event){
      const option = event.target.closest('.time-picker-option');
      if(option){
        selectEl.value = option.getAttribute('data-time');
        selectEl.dispatchEvent(new Event('change', { bubbles:true }));
        syncTimePickerControl(selectEl);
        closeTimePickerControl(control);
        trigger.focus();
        return;
      }
      if(event.target.closest('.time-picker-close')){
        closeTimePickerControl(control);
        trigger.focus();
      }
    });

    selectEl.addEventListener('change', function(){
      syncTimePickerControl(selectEl);
    });
    syncTimePickerControl(selectEl);
  });

  document.addEventListener('click', function(event){
    if(activeTimePickerControl && !activeTimePickerControl.contains(event.target)){
      closeTimePickerControl(activeTimePickerControl);
    }
  });
  document.addEventListener('keydown', function(event){
    if(event.key === 'Escape' && activeTimePickerControl){
      const trigger = activeTimePickerControl.querySelector('.time-picker-trigger');
      closeTimePickerControl(activeTimePickerControl);
      if(trigger) trigger.focus();
    }
  });
  document.addEventListener('reset', function(){
    setTimeout(syncAllTimePickerControls, 0);
  });
}

function getAvailableReservationTimeOptions(partida, carro, dataIda, dataVolta, selectedPickup, excludeId){
  const horarios = gerarHorarios();
  if(!partida || !carro || !dataIda || !dataVolta || dataVolta < dataIda){
    return { pickup:horarios, return:horarios };
  }

  const validCombinations = [];
  horarios.forEach(pickup => {
    if(selectedPickup && pickup !== selectedPickup) return;
    if(isReservationPickupInPast(dataIda, pickup)) return;
    horarios.forEach(returnTime => {
      if(dataIda === dataVolta && returnTime <= pickup) return;
      const conflicts = findConflictingReservations(
        partida,
        carro,
        dataIda,
        dataVolta,
        pickup,
        returnTime,
        excludeId
      );
      if(!conflicts.length){
        validCombinations.push({ pickup:pickup, return:returnTime });
      }
    });
  });

  return {
    pickup:[...new Set(validCombinations.map(item => item.pickup))],
    return:[...new Set(validCombinations.map(item => item.return))]
  };
}
