/* Calendário mensal e ações por veículo */
/* =========================================================
   Calendário visual mensal de reservas — por carro (seção "Calendário")
   ========================================================= */

// Lista plana de todos os carros de todas as filiais, na ordem pedida.
const TODOS_CARROS = [];
CIDADES.forEach(cidade => {
  (CARROS_POR_FILIAL[cidade] || []).forEach(carro => {
    TODOS_CARROS.push({ filial: cidade, carro: carro, key: carKey(cidade, carro) });
  });
});

let calViewYear, calViewMonth;
(function initCalView(){
  const t = new Date();
  calViewYear = t.getFullYear();
  calViewMonth = t.getMonth();
})();

let calSelectedCarKey = TODOS_CARROS.length ? TODOS_CARROS[0].key : null;
let calSelectedISO = null;

const carSelector = document.getElementById('carSelector');
const calendarGrid = document.getElementById('calendarGrid');
const calMonthLabel = document.getElementById('calMonthLabel');
const calendarDayDetails = document.getElementById('calendarDayDetails');
const calPrevBtn = document.getElementById('calPrevBtn');
const calNextBtn = document.getElementById('calNextBtn');
const calConfirmation = document.getElementById('calConfirmation');
const calConfirmationText = document.getElementById('calConfirmation-text');

function getSelectedCarInfo(){
  return TODOS_CARROS.find(c => c.key === calSelectedCarKey) || null;
}

// Retorna as reservas do carro atualmente selecionado que cobrem a data informada.
function getCarReservationsForDate(iso){
  const info = getSelectedCarInfo();
  if(!info) return [];
  return getReservations().filter(r => r.partida === info.filial && r.carro === info.carro && iso >= r.dataIda && iso <= r.dataVolta);
}

function renderCarSelector(){
  let html = '';
  TODOS_CARROS.forEach(c => {
    const active = c.key === calSelectedCarKey ? ' active' : '';
    html += '<button type="button" class="car-tab-btn' + active + '" data-carkey="' + c.key + '">' +
              '<span class="car-tab-city">' + c.filial + '</span>' +
              '<span class="car-tab-name">Final ' + c.carro + '</span>' +
            '</button>';
  });
  carSelector.innerHTML = html;
}

carSelector.addEventListener('click', function(e){
  const btn = e.target.closest('.car-tab-btn');
  if(!btn) return;
  calSelectedCarKey = btn.getAttribute('data-carkey');
  calSelectedISO = null;
  renderCarSelector();
  renderMainCalendar();
  calendarDayDetails.classList.add('hidden');
  calendarDayDetails.innerHTML = '';
});

function renderMainCalendar(){
  calMonthLabel.textContent = MESES[calViewMonth] + ' ' + calViewYear;

  const info = getSelectedCarInfo();
  const firstWeekday = new Date(Date.UTC(calViewYear, calViewMonth, 1)).getUTCDay();
  const totalDays = daysInMonth(calViewYear, calViewMonth);
  const prevMonthDays = daysInMonth(calViewYear, calViewMonth === 0 ? 11 : calViewMonth - 1);
  const today = todayISO();

  let html = '';
  DIAS_SEMANA.forEach(d => {
    html += '<div class="calendar-weekday">' + d + '</div>';
  });

  const totalCells = 42;
  for(let i = 0; i < totalCells; i++){
    const offset = i - firstWeekday + 1;
    let day, year, monthIndex, otherMonth;

    if(offset < 1){
      day = prevMonthDays + offset;
      monthIndex = calViewMonth === 0 ? 11 : calViewMonth - 1;
      year = calViewMonth === 0 ? calViewYear - 1 : calViewYear;
      otherMonth = true;
    } else if(offset > totalDays){
      day = offset - totalDays;
      monthIndex = calViewMonth === 11 ? 0 : calViewMonth + 1;
      year = calViewMonth === 11 ? calViewYear + 1 : calViewYear;
      otherMonth = true;
    } else {
      day = offset;
      monthIndex = calViewMonth;
      year = calViewYear;
      otherMonth = false;
    }

    const iso = isoFromParts(year, monthIndex, day);
    const count = (otherMonth || !info) ? 0 : getReservations().filter(r => r.partida === info.filial && r.carro === info.carro && iso >= r.dataIda && iso <= r.dataVolta).length;

    let classes = 'calendar-day';
    if(otherMonth) classes += ' other-month';
    if(iso === today) classes += ' today';
    if(count > 0) classes += ' has-reservation';
    if(!otherMonth && iso === calSelectedISO) classes += ' selected-day';

    html += '<div class="' + classes + '" data-iso="' + iso + '" data-count="' + count + '" data-other="' + (otherMonth ? '1' : '0') + '">' +
              '<span class="day-number">' + day + '</span>' +
              (count > 0 ? '<span class="day-badge">' + count + '</span>' : '') +
            '</div>';
  }

  calendarGrid.innerHTML = html;
}

function showDayDetails(iso){
  calSelectedISO = iso;
  const info = getSelectedCarInfo();
  const currentUser = getCurrentUser();

  calendarGrid.querySelectorAll('.calendar-day.selected-day').forEach(el => el.classList.remove('selected-day'));
  const target = calendarGrid.querySelector('.calendar-day[data-iso="' + iso + '"]');
  if(target) target.classList.add('selected-day');

  if(!info){
    calendarDayDetails.classList.add('hidden');
    calendarDayDetails.innerHTML = '';
    return;
  }

  const list = getCarReservationsForDate(iso).slice().sort((a,b) => {
    const fa = getOccupiedMinutesRangeForDate(a, iso);
    const fb = getOccupiedMinutesRangeForDate(b, iso);
    return (fa ? fa.inicio : 0) - (fb ? fb.inicio : 0);
  });
  const carLabel = info.filial + ' &middot; Polo final ' + info.carro;
  const diaTotalmenteOcupado = getCarReservedDates(info.filial, info.carro).has(iso);

  let html = '<div class="day-details-title">' + carLabel + ' &mdash; ' + formatDate(iso) + '</div>';

  if(list.length === 0){
    html += '<div class="day-empty-msg">Nenhuma reserva deste carro nesta data. Horário livre: 00:00 - 23:59.</div>' +
            '<div class="day-actions">' +
              '<button type="button" class="reserve-day-btn" id="reserveThisDayBtn">Reservar este carro neste dia</button>' +
            '</div>';
  } else {
    list.forEach(r => {
      const ocupantes = getOcupantes(r);
      const vagas = getVagasRestantes(r);
      const isParticipante = currentUser && (r.nome === currentUser.nome || isPassageiro(r, currentUser.nome));
      const podeEntrar = currentUser && !isParticipante && vagas > 0;
      const faixaTexto = formatFaixaHorariaNoDia(r, iso);

      html += '<div class="day-detail-item">' +
                '<div class="route">' + faixaTexto + ' &mdash; ' + r.partida + ' &rarr; ' + r.destino + '</div>' +
                '<div class="meta">' + formatDate(r.dataIda) + (r.horarioRetirada ? ' ' + r.horarioRetirada : '') + ' até ' + formatDate(r.dataVolta) + (r.horarioDevolucao ? ' ' + r.horarioDevolucao : '') + ' &middot; Solicitante: ' + r.nome + ' &middot; ' + ocupantes + '/' + CAPACIDADE_MAXIMA + ' ocupantes</div>' +
                renderOcupantesHTML(r) +
                (podeEntrar ? '<div class="day-actions"><button type="button" class="join-day-btn" data-id="' + r.id + '">Entrar nessa carona</button></div>' : '') +
              '</div>';
    });

    // Mesmo havendo reservas nesse dia, o carro pode ter horários livres (faixas não
    // ocupadas). Só escondemos o botão de reservar quando o dia estiver 100% ocupado
    // (24h), calculado por getCarReservedDates.
    if(diaTotalmenteOcupado){
      html += '<div class="day-empty-msg">Este carro já está reservado o dia inteiro nesta data.</div>';
    } else {
      html += '<div class="day-actions">' +
                '<button type="button" class="reserve-day-btn" id="reserveThisDayBtn">Reservar este carro em outro horário neste dia</button>' +
              '</div>';
    }
  }

  calendarDayDetails.innerHTML = html;
  calendarDayDetails.classList.remove('hidden');
}

calendarGrid.addEventListener('click', function(e){
  const dayEl = e.target.closest('.calendar-day');
  if(!dayEl || dayEl.getAttribute('data-other') === '1') return;
  showDayDetails(dayEl.getAttribute('data-iso'));
});

calendarDayDetails.addEventListener('click', function(e){
  const reserveBtn = e.target.closest('#reserveThisDayBtn');
  if(reserveBtn){
    openQuickReserveModal(calSelectedISO);
    return;
  }

  const joinBtn = e.target.closest('.join-day-btn');
  if(joinBtn){
    openJoinConfirmModal(joinBtn.getAttribute('data-id'), 'calendar');
  }
});

function joinRideFromCalendar(id){
  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  const result = addPassengerToReservation(id, currentUser);
  if(!result){
    showDayDetails(calSelectedISO);
    return;
  }

  const reserva = result.reserva;
  const vagasRestantes = getVagasRestantes(reserva);
  calConfirmationText.textContent = 'Você entrou na carona! ' + reserva.partida + ' → ' + reserva.destino + ' (Polo final ' + reserva.carro + ') de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '/' + CAPACIDADE_MAXIMA + '.';
  calConfirmation.classList.add('show');

  renderMainCalendar();
  showDayDetails(calSelectedISO);
  renderMyReservations();
  renderAvailableRides();

  setTimeout(() => {
    calConfirmation.classList.remove('show');
  }, 6000);
}
