/* Agenda semanal de reservas por veículo */
/* =========================================================
   Exibe uma semana por vez e permite selecionar um horário
   clicando ou arrastando na grade, como em agendas modernas.
   ========================================================= */

const WEEK_START_MINUTE = 0;
const WEEK_END_MINUTE = 24 * 60;
const WEEK_SLOT_MINUTES = 30;
const WEEK_SLOT_HEIGHT = 30;
const MOBILE_DAY_SLOT_HEIGHT = 42;
const WEEK_DAYS = 7;
const WEEK_DAY_NAMES = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

let TODOS_CARROS = [];
let calSelectedCarKey = null;
let calSelectedBranch = null;
let calSelectedISO = null;
let calWeekStartISO = startOfCalendarWeek(todayISO());
let calendarDragState = null;
let mobileAutoScrollFrame = null;
let mobilePendingSelection = null;
let mobileCalendarMode = 'month';
let mobileSelectedISO = todayISO();
let mobileViewYear = Number(todayISO().slice(0, 4));
let mobileViewMonth = Number(todayISO().slice(5, 7)) - 1;

const carSelector = document.getElementById('carSelector');
const calendarBranchSelect = document.getElementById('calendarBranchSelect');
const calendarVehicleFilter = document.getElementById('calendarVehicleFilter');
const calendarVehicleSelect = document.getElementById('calendarVehicleSelect');
// Mesma etiqueta "Recomendado" da tela de Nova Reserva (ver js/reservations.js) -
// aqui a chave da <option> é "local|codigo" (carKey), não só o código, por
// isso comparamos contra a chave já montada, não contra o valor bruto.
let calendarVehicleRecommendedKey = null;
const calendarVehicleStyledSelect = createStyledSelect(calendarVehicleSelect, {
  optionExtra: function(optionEl){
    if(!optionEl.value || optionEl.value !== calendarVehicleRecommendedKey) return '';
    return '<span class="recommended-badge">Recomendado</span>';
  }
});
const calendarVehicleLegend = document.getElementById('calendarVehicleLegend');
const calendarGrid = document.getElementById('calendarGrid');
const calMonthLabel = document.getElementById('calMonthLabel');
const calendarDragHint = document.querySelector('.calendar-drag-hint');
const calendarDayDetails = document.getElementById('calendarDayDetails');
const calPrevBtn = document.getElementById('calPrevBtn');
const calNextBtn = document.getElementById('calNextBtn');
const calTodayBtn = document.getElementById('calTodayBtn');
const calConfirmation = document.getElementById('calConfirmation');
const calConfirmationText = document.getElementById('calConfirmation-text');

function startOfCalendarWeek(iso){
  const parts = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return addDaysISO(iso, -date.getUTCDay());
}

function isMobileCalendar(){
  return window.matchMedia('(max-width:720px)').matches;
}

function getCalendarSlotHeight(){
  return isMobileCalendar() && mobileCalendarMode === 'day'
    ? MOBILE_DAY_SLOT_HEIGHT
    : WEEK_SLOT_HEIGHT;
}

function minutesToTime(minutes){
  const safeMinutes = Math.max(0, Math.min(MAX_DIA, Number(minutes) || 0));
  if(safeMinutes === MAX_DIA) return '23:59';
  return pad2(Math.floor(safeMinutes / 60)) + ':' + pad2(safeMinutes % 60);
}

function formatWeekLabel(startISO){
  const endISO = addDaysISO(startISO, 6);
  const start = startISO.split('-').map(Number);
  const end = endISO.split('-').map(Number);
  const startMonth = MESES[start[1] - 1].slice(0, 3);
  const endMonth = MESES[end[1] - 1].slice(0, 3);
  if(start[0] === end[0] && start[1] === end[1]){
    return start[2] + ' – ' + end[2] + ' de ' + MESES[start[1] - 1] + ' de ' + start[0];
  }
  if(start[0] === end[0]){
    return start[2] + ' de ' + startMonth + ' – ' + end[2] + ' de ' + endMonth + ' de ' + start[0];
  }
  return start[2] + ' de ' + startMonth + ' de ' + start[0] + ' – ' +
    end[2] + ' de ' + endMonth + ' de ' + end[0];
}

function syncCalendarCars(){
  TODOS_CARROS = [];
  CIDADES.forEach(cidade => {
    (CARROS_POR_LOCAL[cidade] || []).forEach(carro => {
      TODOS_CARROS.push({ local:cidade, carro:carro, key:carKey(cidade, carro) });
    });
  });
  const branches = TODOS_CARROS.map(c => c.local);
  if(!calSelectedBranch || !branches.includes(calSelectedBranch)){
    calSelectedBranch = branches.length ? branches[0] : (CIDADES[0] || null);
  }
  // Sem veículo específico escolhido = "todos os veículos do local" (ver
  // getCarReservationsForDate). Só limpa a seleção se ela ficou inválida
  // (veículo removido, ou o local mudou).
  if(calSelectedCarKey && !TODOS_CARROS.some(c => c.key === calSelectedCarKey && c.local === calSelectedBranch)){
    calSelectedCarKey = null;
  }
}

syncCalendarCars();

function getSelectedCarInfo(){
  return TODOS_CARROS.find(c => c.key === calSelectedCarKey) || null;
}

function getCarsForSelectedBranch(){
  return TODOS_CARROS.filter(c => c.local === calSelectedBranch);
}

// Paleta fixa por posição do veículo na lista do local (mesma ordem do
// <select>) - assim cada veículo sempre cai na mesma cor entre renders,
// sem precisar guardar um mapa à parte. Só é usada quando nenhum veículo
// específico está selecionado e o local tem mais de um.
const CALENDAR_VEHICLE_COLORS = [
  { accent:'#7bc4f1', bg1:'rgba(58,106,149,.97)', bg2:'rgba(39,80,115,.97)' },   // azul (padrão)
  { accent:'#6fe3a8', bg1:'rgba(47,140,99,.97)', bg2:'rgba(28,94,66,.97)' },     // verde
  { accent:'#f0b95c', bg1:'rgba(158,110,34,.97)', bg2:'rgba(117,80,22,.97)' },   // âmbar
  { accent:'#b89af0', bg1:'rgba(103,74,150,.97)', bg2:'rgba(72,50,109,.97)' },   // roxo
  { accent:'#f095b0', bg1:'rgba(150,60,90,.97)', bg2:'rgba(109,40,65,.97)' },    // rosa
  { accent:'#6fd8dd', bg1:'rgba(30,120,125,.97)', bg2:'rgba(18,85,90,.97)' }     // ciano
];

// Índice do veículo da reserva na lista do local selecionado, ou -1 se não
// houver mais de um veículo (aí não faz sentido colorir por veículo).
function calendarVehicleColorIndex(reservation){
  const cars = getCarsForSelectedBranch();
  if(cars.length < 2) return -1;
  return cars.findIndex(c => c.carro === reservation.carro);
}

function getCarReservationsForDate(iso){
  const info = getSelectedCarInfo();
  if(info){
    return getReservations().filter(r =>
      !isReservationCompleted(r) &&
      r.partida === info.local &&
      r.carro === info.carro &&
      iso >= r.dataIda &&
      iso <= r.dataVolta
    );
  }
  // Nenhum veículo específico: mostra todos os veículos do local selecionado.
  if(!calSelectedBranch) return [];
  return getReservations().filter(r =>
    !isReservationCompleted(r) &&
    r.partida === calSelectedBranch &&
    iso >= r.dataIda &&
    iso <= r.dataVolta
  );
}

function renderCarSelector(){
  syncCalendarCars();
  calendarBranchSelect.innerHTML = CIDADES.map(branch => {
    const hasCars = TODOS_CARROS.some(car => car.local === branch);
    return '<option value="' + escapeHTML(branch) + '"' +
      (calSelectedBranch === branch ? ' selected' : '') +
      (hasCars ? '' : ' disabled') + '>' + escapeHTML(branch) + '</option>';
  }).join('');
  carSelector.innerHTML = CIDADES.map(branch => {
    const branchCars = TODOS_CARROS.filter(car => car.local === branch);
    const active = calSelectedBranch === branch ? ' active' : '';
    return '<button type="button" class="car-tab-btn' + active + '" data-calendar-branch="' +
      escapeHTML(branch) + '"' + (branchCars.length ? '' : ' disabled') + '>' +
      '<span class="car-tab-city">' + escapeHTML(branch) + '</span>' +
      '</button>';
  }).join('');

  const branchCars = getCarsForSelectedBranch();
  calendarVehicleFilter.classList.remove('hidden');
  calendarVehicleRecommendedKey = null;
  if(branchCars.length){
    calendarVehicleSelect.innerHTML = '<option value="">Selecione...</option>' + branchCars.map(car =>
      '<option value="' + escapeHTML(car.key) + '"' +
      (car.key === calSelectedCarKey ? ' selected' : '') + '>' +
      escapeHTML(getVehicleDisplayName({ partida:car.local, carro:car.carro })) + '</option>'
    ).join('');
    calendarVehicleSelect.disabled = false;

    if(typeof getRecommendedVehicleCodigoForBranch === 'function'){
      const branch = calSelectedBranch;
      const applyRecommendation = () => {
        if(calSelectedBranch !== branch) return;
        const recommendedCodigo = getRecommendedVehicleCodigoForBranch(branch);
        calendarVehicleRecommendedKey = recommendedCodigo ? carKey(branch, recommendedCodigo) : null;
        calendarVehicleStyledSelect.sync();
      };
      if(typeof window.requestIdleCallback === 'function'){
        window.requestIdleCallback(applyRecommendation, { timeout:300 });
      } else {
        setTimeout(applyRecommendation, 0);
      }
    }
  } else {
    calendarVehicleSelect.innerHTML = '<option value="">Nenhum veículo cadastrado</option>';
    calendarVehicleSelect.disabled = true;
  }
  renderCalendarVehicleLegend();
}

// Legenda das cores por veículo - só aparece quando estamos vendo "todos
// os veículos" (nenhum específico selecionado) de um local com mais de um.
function renderCalendarVehicleLegend(){
  const cars = getCarsForSelectedBranch();
  if(calSelectedCarKey || cars.length < 2){
    calendarVehicleLegend.classList.add('hidden');
    calendarVehicleLegend.innerHTML = '';
    return;
  }
  calendarVehicleLegend.innerHTML = cars.map((car, index) => {
    const color = CALENDAR_VEHICLE_COLORS[index % CALENDAR_VEHICLE_COLORS.length];
    return '<span class="calendar-vehicle-legend-item">' +
      '<span class="calendar-vehicle-legend-dot" style="background:' + color.accent + '"></span>' +
      escapeHTML(getVehicleDisplayName({ partida:car.local, carro:car.carro })) +
      '</span>';
  }).join('');
  calendarVehicleLegend.classList.remove('hidden');
}

function selectCalendarBranch(branch){
  if(!TODOS_CARROS.some(car => car.local === branch)) return;
  calSelectedBranch = branch;
  calSelectedCarKey = null;
  clearCalendarSelection();
  renderCarSelector();
  renderMainCalendar();
}

carSelector.addEventListener('click', function(event){
  const button = event.target.closest('.car-tab-btn');
  if(!button || button.disabled) return;
  selectCalendarBranch(button.getAttribute('data-calendar-branch'));
});

calendarBranchSelect.addEventListener('change', function(){
  selectCalendarBranch(this.value);
});

calendarVehicleSelect.addEventListener('change', function(){
  if(this.value && !TODOS_CARROS.some(car => car.key === this.value)) return;
  calSelectedCarKey = this.value || null;
  clearCalendarSelection();
  renderCarSelector();
  renderMainCalendar();
});

function clearCalendarSelection(){
  calSelectedISO = null;
  mobilePendingSelection = null;
  calendarDayDetails.classList.add('hidden');
  calendarDayDetails.innerHTML = '';
}

function shiftCalendarWeek(days){
  if(isMobileCalendar()){
    const direction = days < 0 ? -1 : 1;
    if(mobileCalendarMode === 'day'){
      mobileSelectedISO = addDaysISO(mobileSelectedISO, direction);
      const parts = mobileSelectedISO.split('-').map(Number);
      mobileViewYear = parts[0];
      mobileViewMonth = parts[1] - 1;
    } else {
      mobileViewMonth += direction;
      if(mobileViewMonth < 0){
        mobileViewMonth = 11;
        mobileViewYear--;
      } else if(mobileViewMonth > 11){
        mobileViewMonth = 0;
        mobileViewYear++;
      }
    }
    clearCalendarSelection();
    renderMainCalendar();
    return;
  }
  calWeekStartISO = addDaysISO(calWeekStartISO, days);
  clearCalendarSelection();
  renderMainCalendar();
}

function goToCurrentCalendarWeek(){
  if(isMobileCalendar()){
    const today = todayISO();
    const parts = today.split('-').map(Number);
    mobileSelectedISO = today;
    mobileViewYear = parts[0];
    mobileViewMonth = parts[1] - 1;
    clearCalendarSelection();
    renderMainCalendar();
    return;
  }
  calWeekStartISO = startOfCalendarWeek(todayISO());
  clearCalendarSelection();
  renderMainCalendar();
}

function buildWeekHeader(){
  let html = '<div class="week-header-corner"><span>GMT-03</span></div>';
  const today = todayISO();
  for(let index = 0; index < WEEK_DAYS; index++){
    const iso = addDaysISO(calWeekStartISO, index);
    const day = Number(iso.slice(8, 10));
    const classes = 'week-day-header' + (iso === today ? ' today' : '');
    html += '<button type="button" class="' + classes + '" data-iso="' + iso + '">' +
      '<span>' + WEEK_DAY_NAMES[index] + '</span><strong>' + day + '</strong></button>';
  }
  return html;
}

function buildTimeAxis(){
  let html = '<div class="week-time-axis" aria-hidden="true">';
  for(let minute = WEEK_START_MINUTE; minute < WEEK_END_MINUTE; minute += WEEK_SLOT_MINUTES){
    const isHour = minute % 60 === 0;
    html += '<div class="week-time-label' + (isHour ? ' full-hour' : '') + '">' +
      (isHour ? minutesToTime(minute) : '') + '</div>';
  }
  return html + '</div>';
}

function getWeekEventLayout(reservation, iso){
  const occupied = getOccupiedMinutesRangeForDate(reservation, iso);
  if(!occupied || occupied.fim <= WEEK_START_MINUTE || occupied.inicio >= WEEK_END_MINUTE){
    return null;
  }
  const start = Math.max(WEEK_START_MINUTE, occupied.inicio);
  const end = Math.min(WEEK_END_MINUTE, occupied.fim);
  const slotHeight = getCalendarSlotHeight();
  return {
    top: ((start - WEEK_START_MINUTE) / WEEK_SLOT_MINUTES) * slotHeight,
    height: Math.max(slotHeight, ((end - start) / WEEK_SLOT_MINUTES) * slotHeight),
    clippedStart: occupied.inicio < WEEK_START_MINUTE,
    clippedEnd: occupied.fim > WEEK_END_MINUTE,
    label:formatFaixaHorariaNoDia(reservation, iso)
  };
}

function isCalendarDateSelectable(iso){
  const rules = getReservationRules();
  const today = todayISO();
  return iso >= today && iso <= addDaysISO(today, rules.maxAdvanceDays);
}

function buildReservationEvent(reservation, iso){
  const layout = getWeekEventLayout(reservation, iso);
  if(!layout) return '';
  const clippedClass = (layout.clippedStart ? ' clipped-start' : '') +
    (layout.clippedEnd ? ' clipped-end' : '');
  // Limiares calibrados para o piso legivel de 12px (ver css/variables.css
  // --fs-2xs): id + horario cabem confortavelmente ate ~90px; as 5 linhas
  // (id, horario, rota, veiculo, solicitante) truncadas em uma linha cada
  // exigem por volta de 90px; abaixo disso o texto sobrepoe.
  const densityClass = layout.height < 90 ? ' is-short' : (layout.height < 150 ? ' is-medium' : ' is-detailed');
  const vehicleName = getVehicleDisplayName(reservation);
  const vehicleHTML = getVehicleDisplayHTML(reservation, true);
  const occupancy = getOcupantes(reservation) + '/' + getVehicleCapacity(reservation) + ' ocupantes';
  const reason = reservation.motivo || 'Motivo não informado';
  const accessibleSummary = (getReservationNumberLabel(reservation) ? getReservationNumberLabel(reservation) + '. ' : '') +
    reservation.partida + ' para ' + reservation.destino + '. ' +
    layout.label + '. ' + vehicleName + '. Solicitante: ' + (reservation.nome || 'Não informado') +
    '. ' + occupancy + '. Motivo: ' + reason;
  const colorIndex = calendarVehicleColorIndex(reservation);
  const colorStyle = colorIndex >= 0
    ? (function(){
      const color = CALENDAR_VEHICLE_COLORS[colorIndex % CALENDAR_VEHICLE_COLORS.length];
      return ';--event-accent:' + color.accent + ';--event-bg-1:' + color.bg1 + ';--event-bg-2:' + color.bg2;
    })()
    : '';
  return '<button type="button" class="week-reservation-event' + clippedClass + densityClass + '"' +
    ' data-id="' + escapeHTML(reservation.id) + '" data-iso="' + iso + '"' +
    ' aria-label="' + escapeHTML(accessibleSummary) + '" title="' + escapeHTML(accessibleSummary) + '"' +
    ' style="top:' + layout.top + 'px;height:' + layout.height + 'px' + colorStyle + '">' +
      (getReservationNumberLabel(reservation) ? '<span class="calendar-event-id">' + escapeHTML(getReservationNumberLabel(reservation)) + '</span>' : '') +
      '<span class="calendar-event-time">' + RESERVATION_CLOCK_ICON + '<strong>' + escapeHTML(layout.label) + '</strong></span>' +
      '<span class="calendar-event-route">' + escapeHTML(reservation.partida) + ' → ' + escapeHTML(reservation.destino || 'Reserva') + '</span>' +
      '<small class="calendar-event-vehicle">' + vehicleHTML + '</small>' +
      '<small class="calendar-event-requester">Reservado por: ' + escapeHTML(reservation.nome || 'Não informado') + '</small>' +
    '</button>';
}

function buildDayColumn(iso){
  const reservations = getCarReservationsForDate(iso).slice().sort((a, b) => {
    const rangeA = getOccupiedMinutesRangeForDate(a, iso);
    const rangeB = getOccupiedMinutesRangeForDate(b, iso);
    return (rangeA ? rangeA.inicio : 0) - (rangeB ? rangeB.inicio : 0);
  });
  let html = '<div class="week-day-column" data-iso="' + iso + '">';
  const noSpecificVehicle = !getSelectedCarInfo();
  for(let minute = WEEK_START_MINUTE; minute < WEEK_END_MINUTE; minute += WEEK_SLOT_MINUTES){
    const unavailableDate = !isCalendarDateSelectable(iso);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const pastTime = iso === todayISO() && minute + WEEK_SLOT_MINUTES <= currentMinutes;
    const disabled = unavailableDate || pastTime || noSpecificVehicle;
    html += '<div class="week-time-slot' + (disabled ? ' disabled' : '') +
      '" data-iso="' + iso + '" data-minute="' + minute + '" data-disabled="' +
      (disabled ? '1' : '0') + '" ' +
      'aria-label="' + formatDate(iso) + ' às ' + minutesToTime(minute) + '"></div>';
  }
  reservations.forEach(reservation => {
    html += buildReservationEvent(reservation, iso);
  });
  return html + '</div>';
}

function buildMobileMonthCalendar(){
  calMonthLabel.textContent = MESES[mobileViewMonth] + ' de ' + mobileViewYear;
  const firstWeekday = new Date(Date.UTC(mobileViewYear, mobileViewMonth, 1)).getUTCDay();
  const totalDays = daysInMonth(mobileViewYear, mobileViewMonth);
  const previousMonth = mobileViewMonth === 0 ? 11 : mobileViewMonth - 1;
  const previousYear = mobileViewMonth === 0 ? mobileViewYear - 1 : mobileViewYear;
  const previousDays = daysInMonth(previousYear, previousMonth);
  const today = todayISO();
  let html = '<div class="mobile-month-calendar">' +
    '<div class="mobile-month-weekdays">' +
      WEEK_DAY_NAMES.map(day => '<span>' + day.charAt(0) + '</span>').join('') +
    '</div><div class="mobile-month-grid">';

  for(let index = 0; index < 42; index++){
    const offset = index - firstWeekday + 1;
    let day;
    let month = mobileViewMonth;
    let year = mobileViewYear;
    let otherMonth = false;
    if(offset < 1){
      day = previousDays + offset;
      month = previousMonth;
      year = previousYear;
      otherMonth = true;
    } else if(offset > totalDays){
      day = offset - totalDays;
      month = mobileViewMonth === 11 ? 0 : mobileViewMonth + 1;
      year = mobileViewMonth === 11 ? mobileViewYear + 1 : mobileViewYear;
      otherMonth = true;
    } else {
      day = offset;
    }
    const iso = isoFromParts(year, month, day);
    const reservations = getCarReservationsForDate(iso).slice(0, 2);
    const classes = 'mobile-month-day' +
      (otherMonth ? ' other-month' : '') +
      (iso === today ? ' today' : '') +
      (reservations.length ? ' has-events' : '');
    html += '<button type="button" class="' + classes + '" data-mobile-date="' + iso + '">' +
      '<strong>' + day + '</strong>' +
      '<span class="mobile-month-events">' +
        reservations.map(reservation =>
          '<span class="mobile-month-event">' +
            escapeHTML((reservation.horarioRetirada || '') + ' ' + (reservation.destino || 'Reserva')) +
          '</span>'
        ).join('') +
        (getCarReservationsForDate(iso).length > 2
          ? '<span class="mobile-month-more">+' + (getCarReservationsForDate(iso).length - 2) + '</span>'
          : '') +
      '</span>' +
    '</button>';
  }

  html += '</div></div>' +
    '<button type="button" class="mobile-calendar-add" id="mobileCalendarAddBtn" aria-label="Nova reserva"' +
    (getSelectedCarInfo() ? '' : ' disabled title="Selecione um veículo específico no filtro acima para criar uma reserva."') +
    '>+</button>';
  return html;
}

function formatMobileDayTitle(iso){
  const parts = iso.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const weekday = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][date.getUTCDay()];
  return weekday + ', ' + parts[2] + ' de ' + MESES[parts[1] - 1];
}

function buildMobileDayCalendar(){
  const parts = mobileSelectedISO.split('-').map(Number);
  calMonthLabel.textContent = MESES[parts[1] - 1] + ' de ' + parts[0];
  const info = getSelectedCarInfo();
  const branchLabel = info ? info.local : calSelectedBranch;
  return '<div class="mobile-day-calendar">' +
    '<div class="mobile-day-top">' +
      '<button type="button" class="mobile-day-back" aria-label="Voltar para o mês">&#8249;</button>' +
      '<div><span>Agenda do dia</span><strong>' + escapeHTML(formatMobileDayTitle(mobileSelectedISO)) + '</strong>' +
      (branchLabel ? '<small>' + escapeHTML(branchLabel) + '</small>' : '') +
      '</div>' +
    '</div>' +
    '<div class="mobile-day-scroll">' +
      '<div class="mobile-day-body">' + buildTimeAxis() +
        '<div class="week-days mobile-one-day">' + buildDayColumn(mobileSelectedISO) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="mobile-selection-sheet hidden" id="mobileSelectionSheet">' +
      '<div><span>Horário selecionado</span><strong id="mobileSelectionTime"></strong></div>' +
      '<div class="mobile-selection-actions">' +
        '<button type="button" class="mobile-selection-cancel">Cancelar</button>' +
        '<button type="button" class="mobile-selection-confirm">Continuar</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderMobilePendingSelection(){
  if(!isMobileCalendar() || mobileCalendarMode !== 'day') return;
  const column = calendarGrid.querySelector('.week-day-column[data-iso="' + mobileSelectedISO + '"]');
  const sheet = document.getElementById('mobileSelectionSheet');
  calendarGrid.querySelectorAll('.mobile-pending-selection').forEach(node => node.remove());
  if(!column || !sheet || !mobilePendingSelection ||
    mobilePendingSelection.iso !== mobileSelectedISO){
    if(sheet) sheet.classList.add('hidden');
    return;
  }

  const selection = mobilePendingSelection;
  const preview = document.createElement('div');
  preview.className = 'week-selection-preview mobile-pending-selection';
  preview.style.top = (((selection.start - WEEK_START_MINUTE) / WEEK_SLOT_MINUTES) *
    getCalendarSlotHeight()) + 'px';
  preview.style.height = (((selection.end - selection.start) / WEEK_SLOT_MINUTES) *
    getCalendarSlotHeight()) + 'px';
  preview.innerHTML =
    '<button type="button" class="mobile-selection-handle start" data-edge="start" ' +
      'aria-label="Ajustar horário inicial"></button>' +
    '<strong>' + minutesToTime(selection.start) + ' – ' + minutesToTime(selection.end) + '</strong>' +
    '<span>Nova reserva</span>' +
    '<button type="button" class="mobile-selection-handle end" data-edge="end" ' +
      'aria-label="Ajustar horário final"></button>';
  column.appendChild(preview);

  const time = document.getElementById('mobileSelectionTime');
  if(time){
    time.textContent = minutesToTime(selection.start) + ' – ' + minutesToTime(selection.end);
  }
  sheet.classList.remove('hidden');
}

function renderMobileCalendar(){
  const isDay = mobileCalendarMode === 'day';
  calPrevBtn.setAttribute('aria-label', isDay ? 'Dia anterior' : 'Mês anterior');
  calNextBtn.setAttribute('aria-label', isDay ? 'Próximo dia' : 'Próximo mês');
  calendarDragHint.classList.toggle('hidden', !isDay);
  if(isDay){
    calendarDragHint.textContent = getSelectedCarInfo()
      ? 'Toque em um horário ou arraste para selecionar o período.'
      : 'Selecione um veículo específico para criar uma reserva por aqui.';
  }
  calendarGrid.classList.toggle('mobile-month-mode', mobileCalendarMode === 'month');
  calendarGrid.classList.toggle('mobile-day-mode', isDay);
  calendarGrid.innerHTML = isDay
    ? buildMobileDayCalendar()
    : buildMobileMonthCalendar();
  calendarGrid.style.setProperty('--week-slot-height', getCalendarSlotHeight() + 'px');
  if(isDay){
    updateWeekNowIndicator();
    renderMobilePendingSelection();
    window.setTimeout(() => {
      const scroll = calendarGrid.querySelector('.mobile-day-scroll');
      if(!scroll) return;
      const now = new Date();
      const targetMinute = mobileSelectedISO === todayISO()
        ? Math.max(WEEK_START_MINUTE, now.getHours() * 60 + now.getMinutes() - 90)
        : 8 * 60;
      scroll.scrollTop = Math.max(
        0,
        ((targetMinute - WEEK_START_MINUTE) / WEEK_SLOT_MINUTES) * getCalendarSlotHeight()
      );
    }, 0);
  }
}

function renderMainCalendar(){
  if(isMobileCalendar()){
    renderMobileCalendar();
    return;
  }
  calendarGrid.classList.remove('mobile-month-mode', 'mobile-day-mode');
  calPrevBtn.setAttribute('aria-label', 'Semana anterior');
  calNextBtn.setAttribute('aria-label', 'Próxima semana');
  calendarDragHint.classList.remove('hidden');
  calendarDragHint.textContent = getSelectedCarInfo()
    ? 'Clique em um horário ou arraste na mesma coluna para selecionar o período da reserva.'
    : 'Selecione um veículo específico no filtro acima para criar uma reserva por aqui.';
  calMonthLabel.textContent = formatWeekLabel(calWeekStartISO);
  let html = '<div class="week-calendar-header">' + buildWeekHeader() + '</div>' +
    '<div class="week-calendar-body">' + buildTimeAxis() + '<div class="week-days">';
  for(let index = 0; index < WEEK_DAYS; index++){
    html += buildDayColumn(addDaysISO(calWeekStartISO, index));
  }
  html += '</div></div>';
  calendarGrid.innerHTML = html;
  calendarGrid.style.setProperty('--week-slot-height', getCalendarSlotHeight() + 'px');
  updateWeekNowIndicator();
}

function updateWeekNowIndicator(){
  const todayColumn = calendarGrid.querySelector('.week-day-column[data-iso="' + todayISO() + '"]');
  if(!todayColumn) return;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if(minutes < WEEK_START_MINUTE || minutes > WEEK_END_MINUTE) return;
  const line = document.createElement('div');
  line.className = 'week-now-line';
  line.style.top = (((minutes - WEEK_START_MINUTE) / WEEK_SLOT_MINUTES) * getCalendarSlotHeight()) + 'px';
  todayColumn.appendChild(line);
}

function getDragRange(startMinute, currentMinute, hasMoved){
  if(!hasMoved){
    return {
      start:startMinute,
      end:Math.min(WEEK_END_MINUTE, startMinute + 60)
    };
  }
  return {
    start:Math.min(startMinute, currentMinute),
    end:Math.min(WEEK_END_MINUTE, Math.max(startMinute, currentMinute) + WEEK_SLOT_MINUTES)
  };
}

function renderSelectionPreview(){
  if(!calendarDragState) return;
  const column = calendarGrid.querySelector('.week-day-column[data-iso="' + calendarDragState.iso + '"]');
  if(!column) return;
  column.querySelectorAll('.week-selection-preview').forEach(node => node.remove());
  const range = getDragRange(
    calendarDragState.startMinute,
    calendarDragState.currentMinute,
    calendarDragState.moved
  );
  const preview = document.createElement('div');
  preview.className = 'week-selection-preview';
  preview.style.top = (((range.start - WEEK_START_MINUTE) / WEEK_SLOT_MINUTES) * getCalendarSlotHeight()) + 'px';
  preview.style.height = (((range.end - range.start) / WEEK_SLOT_MINUTES) * getCalendarSlotHeight()) + 'px';
  preview.innerHTML = '<strong>' + minutesToTime(range.start) + ' – ' + minutesToTime(range.end) + '</strong>' +
    '<span>Nova reserva</span>';
  column.appendChild(preview);
}

function stopMobileCalendarAutoScroll(){
  if(mobileAutoScrollFrame != null){
    window.cancelAnimationFrame(mobileAutoScrollFrame);
    mobileAutoScrollFrame = null;
  }
}

function updateMobileResizeFromPointer(clientY){
  if(!calendarDragState || calendarDragState.mode !== 'mobile-resize' ||
    !mobilePendingSelection) return;
  const column = calendarGrid.querySelector(
    '.week-day-column[data-iso="' + calendarDragState.iso + '"]'
  );
  if(!column) return;
  const rect = column.getBoundingClientRect();
  const totalSlots = (WEEK_END_MINUTE - WEEK_START_MINUTE) / WEEK_SLOT_MINUTES;
  const slotIndex = Math.max(
    0,
    Math.min(
      totalSlots - 1,
      Math.floor((clientY - rect.top) / getCalendarSlotHeight())
    )
  );
  const minute = WEEK_START_MINUTE + slotIndex * WEEK_SLOT_MINUTES;
  if(calendarDragState.edge === 'start'){
    mobilePendingSelection.start = Math.min(
      minute,
      mobilePendingSelection.end - WEEK_SLOT_MINUTES
    );
  } else {
    mobilePendingSelection.end = Math.max(
      mobilePendingSelection.start + WEEK_SLOT_MINUTES,
      Math.min(WEEK_END_MINUTE, minute + WEEK_SLOT_MINUTES)
    );
  }
  renderMobilePendingSelection();
}

function runMobileCalendarAutoScroll(){
  mobileAutoScrollFrame = null;
  if(!calendarDragState || calendarDragState.mode !== 'mobile-resize') return;
  const scroll = calendarGrid.querySelector('.mobile-day-scroll');
  if(!scroll) return;
  const rect = scroll.getBoundingClientRect();
  const threshold = Math.min(76, Math.max(48, rect.height * .18));
  const clientY = calendarDragState.latestClientY;
  let speed = 0;
  if(clientY < rect.top + threshold){
    const intensity = Math.min(1, (rect.top + threshold - clientY) / threshold);
    speed = -(4 + intensity * 16);
  } else if(clientY > rect.bottom - threshold){
    const intensity = Math.min(1, (clientY - (rect.bottom - threshold)) / threshold);
    speed = 4 + intensity * 16;
  }
  if(!speed) return;

  const previousScroll = scroll.scrollTop;
  scroll.scrollTop += speed;
  if(scroll.scrollTop !== previousScroll){
    updateMobileResizeFromPointer(clientY);
    mobileAutoScrollFrame = window.requestAnimationFrame(runMobileCalendarAutoScroll);
  }
}

function startMobileCalendarAutoScroll(){
  if(mobileAutoScrollFrame == null){
    mobileAutoScrollFrame = window.requestAnimationFrame(runMobileCalendarAutoScroll);
  }
}

function finishCalendarDrag(event){
  if(!calendarDragState) return;
  stopMobileCalendarAutoScroll();
  const state = calendarDragState;
  calendarDragState = null;
  if(state.pointerId != null && calendarGrid.hasPointerCapture(state.pointerId)){
    calendarGrid.releasePointerCapture(state.pointerId);
  }
  calendarGrid.querySelectorAll('.week-selection-preview').forEach(node => node.remove());
  if(event && event.type === 'pointercancel'){
    if(state.mode === 'mobile-resize' && state.originalSelection){
      mobilePendingSelection = state.originalSelection;
      renderMobilePendingSelection();
    } else if(state.mode === 'mobile-tap'){
      renderMobilePendingSelection();
    }
    return;
  }

  if(state.mode === 'mobile-tap'){
    if(state.gestureMoved) return;
    mobilePendingSelection = {
      iso:state.iso,
      start:state.startMinute,
      end:Math.min(WEEK_END_MINUTE, state.startMinute + 60)
    };
    calSelectedISO = state.iso;
    renderMobilePendingSelection();
    return;
  }

  if(state.mode === 'mobile-resize'){
    renderMobilePendingSelection();
    return;
  }

  const range = getDragRange(state.startMinute, state.currentMinute, state.moved);
  calSelectedISO = state.iso;
  openQuickReserveModal(state.iso, {
    horarioRetirada:minutesToTime(range.start),
    horarioDevolucao:minutesToTime(range.end)
  });
}

calendarGrid.addEventListener('pointerdown', function(event){
  const mobileHandle = event.target.closest('.mobile-selection-handle');
  if(isMobileCalendar() && mobileCalendarMode === 'day' && mobileHandle &&
    mobilePendingSelection){
    event.preventDefault();
    calendarDragState = {
      mode:'mobile-resize',
      edge:mobileHandle.getAttribute('data-edge'),
      iso:mobilePendingSelection.iso,
      pointerId:event.pointerId,
      latestClientY:event.clientY,
      originalSelection:{ ...mobilePendingSelection }
    };
    calendarGrid.setPointerCapture(event.pointerId);
    return;
  }

  const slot = event.target.closest('.week-time-slot');
  if(!slot || slot.getAttribute('data-disabled') === '1' || event.button !== 0) return;
  const mobileTap = isMobileCalendar() && mobileCalendarMode === 'day';
  if(!mobileTap) event.preventDefault();
  calendarDragState = {
    mode:mobileTap ? 'mobile-tap' : 'desktop-select',
    iso:slot.getAttribute('data-iso'),
    startMinute:Number(slot.getAttribute('data-minute')),
    currentMinute:Number(slot.getAttribute('data-minute')),
    pointerId:event.pointerId,
    moved:false,
    gestureMoved:false,
    initialClientX:event.clientX,
    initialClientY:event.clientY
  };
  if(!mobileTap) calendarGrid.setPointerCapture(event.pointerId);
  if(calendarDragState.mode === 'desktop-select'){
    renderSelectionPreview();
  }
});

calendarGrid.addEventListener('pointermove', function(event){
  if(!calendarDragState) return;
  if(calendarDragState.mode === 'mobile-tap'){
    const distanceX = Math.abs(event.clientX - calendarDragState.initialClientX);
    const distanceY = Math.abs(event.clientY - calendarDragState.initialClientY);
    if(distanceX > 10 || distanceY > 10){
      calendarDragState.gestureMoved = true;
    }
    return;
  }
  if(calendarDragState.mode === 'mobile-resize'){
    calendarDragState.latestClientY = event.clientY;
    updateMobileResizeFromPointer(event.clientY);
    startMobileCalendarAutoScroll();
    return;
  }
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const column = element && element.closest ? element.closest('.week-day-column') : null;
  if(!column || column.getAttribute('data-iso') !== calendarDragState.iso) return;
  const rect = column.getBoundingClientRect();
  const slotHeight = getCalendarSlotHeight();
  const totalSlots = (WEEK_END_MINUTE - WEEK_START_MINUTE) / WEEK_SLOT_MINUTES;
  const slotIndex = Math.max(
    0,
    Math.min(totalSlots - 1, Math.floor((event.clientY - rect.top) / slotHeight))
  );
  const minute = WEEK_START_MINUTE + slotIndex * WEEK_SLOT_MINUTES;
  if(minute !== calendarDragState.currentMinute){
    calendarDragState.currentMinute = minute;
    calendarDragState.moved = true;
    renderSelectionPreview();
  }
});

calendarGrid.addEventListener('pointerup', finishCalendarDrag);
calendarGrid.addEventListener('pointercancel', finishCalendarDrag);
document.addEventListener('pointerup', function(event){
  if(calendarDragState) finishCalendarDrag(event);
});
document.addEventListener('pointercancel', function(event){
  if(calendarDragState) finishCalendarDrag(event);
});

calendarGrid.addEventListener('click', function(event){
  const mobileConfirm = event.target.closest('.mobile-selection-confirm');
  if(mobileConfirm && mobilePendingSelection){
    const selection = { ...mobilePendingSelection };
    openQuickReserveModal(selection.iso, {
      horarioRetirada:minutesToTime(selection.start),
      horarioDevolucao:minutesToTime(selection.end)
    });
    return;
  }
  const mobileCancel = event.target.closest('.mobile-selection-cancel');
  if(mobileCancel){
    mobilePendingSelection = null;
    renderMobilePendingSelection();
    return;
  }
  const mobileDate = event.target.closest('.mobile-month-day');
  if(mobileDate){
    mobileSelectedISO = mobileDate.getAttribute('data-mobile-date');
    const parts = mobileSelectedISO.split('-').map(Number);
    mobileViewYear = parts[0];
    mobileViewMonth = parts[1] - 1;
    mobileCalendarMode = 'day';
    clearCalendarSelection();
    renderMainCalendar();
    return;
  }
  const mobileBack = event.target.closest('.mobile-day-back');
  if(mobileBack){
    mobileCalendarMode = 'month';
    clearCalendarSelection();
    renderMainCalendar();
    return;
  }
  const mobileAdd = event.target.closest('#mobileCalendarAddBtn');
  if(mobileAdd){
    const selectedParts = mobileSelectedISO.split('-').map(Number);
    const sameVisibleMonth = selectedParts[0] === mobileViewYear &&
      selectedParts[1] - 1 === mobileViewMonth;
    const targetDate = sameVisibleMonth
      ? mobileSelectedISO
      : isoFromParts(mobileViewYear, mobileViewMonth, 1);
    openQuickReserveModal(targetDate);
    return;
  }
  const eventButton = event.target.closest('.week-reservation-event');
  if(eventButton){
    showDayDetails(eventButton.getAttribute('data-iso'), eventButton.getAttribute('data-id'));
    return;
  }
  const dayHeader = event.target.closest('.week-day-header');
  if(dayHeader){
    showDayDetails(dayHeader.getAttribute('data-iso'));
  }
});

function showDayDetails(iso, focusReservationId){
  calSelectedISO = iso;
  const info = getSelectedCarInfo();
  const currentUser = getCurrentUser();

  calendarGrid.querySelectorAll('.week-day-header.selected').forEach(el => el.classList.remove('selected'));
  const header = calendarGrid.querySelector('.week-day-header[data-iso="' + iso + '"]');
  if(header) header.classList.add('selected');

  if(!calSelectedBranch){
    clearCalendarSelection();
    return;
  }

  const list = getCarReservationsForDate(iso).slice().sort((a, b) => {
    const first = getOccupiedMinutesRangeForDate(a, iso);
    const second = getOccupiedMinutesRangeForDate(b, iso);
    return (first ? first.inicio : 0) - (second ? second.inicio : 0);
  });
  let html = '<div class="day-details-title">' + escapeHTML(info ? info.local : calSelectedBranch) +
    ' &mdash; <span class="reservation-moment-part">' + RESERVATION_CALENDAR_ICON + '<strong>' + formatDate(iso) + '</strong></span></div>';

  if(!list.length){
    html += '<div class="day-empty-msg">' +
      (info ? 'Nenhuma reserva deste veículo nesta data.' : 'Nenhuma reserva deste local nesta data.') +
      '</div>';
  } else {
    list.forEach(reservation => {
      const isCreator = currentUser && isReservationCreator(reservation, currentUser);
      const isPassenger = currentUser && isPassageiro(reservation, currentUser);
      const participant = isCreator || isPassenger;
      const vagas = getVagasRestantes(reservation);
      const canJoin = currentUser && !participant && vagas > 0 && reservationCanAcceptPassengers(reservation);
      const focusedClass = String(reservation.id) === String(focusReservationId) ? ' focused' : '';
      const actionsHTML = canJoin
        ? '<button type="button" class="join-ride-btn" data-id="' + escapeHTML(reservation.id) + '">Entrar nessa carona</button>'
        : '';
      html += '<div class="reservation-item' + focusedClass + '">' +
        renderReservationCardHTML(reservation, { actionsHTML: actionsHTML }) +
        '</div>';
    });
  }

  html += '<div class="day-actions"><button type="button" class="reserve-day-btn" id="reserveThisDayBtn"' +
    (info ? '' : ' disabled title="Selecione um veículo específico no filtro acima para criar uma reserva."') +
    '>Criar reserva neste dia</button></div>';
  calendarDayDetails.innerHTML = html;
  calendarDayDetails.classList.remove('hidden');
  if(focusReservationId){
    calendarDayDetails.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }
}

calendarDayDetails.addEventListener('click', function(event){
  const reserveButton = event.target.closest('#reserveThisDayBtn');
  if(reserveButton){
    openQuickReserveModal(calSelectedISO);
    return;
  }
  const joinButton = event.target.closest('.join-ride-btn');
  if(joinButton){
    openJoinConfirmModal(joinButton.getAttribute('data-id'), 'calendar');
  }
});

if(calTodayBtn){
  calTodayBtn.addEventListener('click', goToCurrentCalendarWeek);
}

const mobileCalendarMedia = window.matchMedia('(max-width:720px)');
if(typeof mobileCalendarMedia.addEventListener === 'function'){
  mobileCalendarMedia.addEventListener('change', function(){
    calendarDragState = null;
    clearCalendarSelection();
    renderMainCalendar();
  });
}

async function joinRideFromCalendar(id){
  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  const result = await addPassengerToReservation(id, currentUser);
  if(!result){
    showDayDetails(calSelectedISO);
    return;
  }

  const reserva = result.reserva;
  const vagasRestantes = getVagasRestantes(reserva);
  calConfirmationText.textContent = 'Você entrou na carona! ' + reserva.partida + ' → ' +
    reserva.destino + ' de ' + formatDate(reserva.dataIda) +
    ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' +
    reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '/' +
    getVehicleCapacity(reserva) + '.';
  calConfirmation.classList.add('show');

  renderMainCalendar();
  showDayDetails(calSelectedISO);
  renderMyReservations();
  renderAvailableRides();

  setTimeout(() => calConfirmation.classList.remove('show'), 6000);
}
