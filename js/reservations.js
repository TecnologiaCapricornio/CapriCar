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
const passageirosWidget = createPassengerListWidget('passageirosListContainer');
const confirmation = document.getElementById('confirmation');
const confirmationText = document.getElementById('confirmation-text');
const myReservationsList = document.getElementById('myReservationsList');
const minhasConfirmation = document.getElementById('minhasConfirmation');
const minhasConfirmationText = document.getElementById('minhasConfirmation-text');

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

  const reservas = getReservations().filter(r => r.partida === partida && r.carro === carro);
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
  const carros = CARROS_POR_FILIAL[partida] || [];
  carroSelect.innerHTML = '<option value="">Selecione...</option>' +
    carros.map(c => '<option value="' + c + '">Polo final ' + c + '</option>').join('');
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
  const isCreator = currentUser && res.nome === currentUser.nome;
  const canDelete = isCreator || isAdmin();
  const canLeave = !isCreator;
  const ocupantes = getOcupantes(res);
  const confirmados = getPassageirosConfirmados(res);
  const ocupacaoTexto = ocupantes + '/' + CAPACIDADE_MAXIMA + ' ocupantes' + (confirmados > 0 ? ' (' + confirmados + ' já confirmados)' : '');
  const item = document.createElement('div');
  item.className = 'reservation-item';
  item.innerHTML =
    '<div class="reservation-info">' +
      '<div class="reservation-route">' + res.partida + ' &rarr; ' + res.destino + '</div>' +
      '<span class="reservation-car">Polo final ' + res.carro + '</span>' +
      '<span class="role-badge ' + (isCreator ? 'creator' : 'passenger') + '">' + (isCreator ? 'Criador da reserva' : 'Passageiro') + '</span>' +
      '<div class="reservation-details">' + formatDate(res.dataIda) + (res.horarioRetirada ? ' às ' + res.horarioRetirada : '') + ' até ' + formatDate(res.dataVolta) + (res.horarioDevolucao ? ' às ' + res.horarioDevolucao : '') + '</div>' +
      '<div class="reservation-name">Solicitante: ' + res.nome + '</div>' +
      '<div class="reservation-occupants">' + PEOPLE_ICON_SVG + '<span>' + ocupacaoTexto + '</span></div>' +
    '</div>' +
    '<div class="reservation-actions">' +
      (canDelete ? '<button class="delete-btn" data-id="' + res.id + '">Excluir</button>' : '') +
      (canLeave ? '<button class="leave-btn" data-id="' + res.id + '">Sair da carona</button>' : '') +
    '</div>';
  return item;
}

function renderMyReservations(){
  const currentUser = getCurrentUser();
  if(!currentUser){
    myReservationsList.innerHTML = '<div class="empty-state">Faça login para ver suas reservas.</div>';
    return;
  }
  const list = getReservations().filter(r => isPassageiro(r, currentUser.nome));
  if(list.length === 0){
    myReservationsList.innerHTML = '<div class="empty-state">Você ainda não fez nenhuma reserva.</div>';
    return;
  }
  myReservationsList.innerHTML = '';
  list.slice().reverse().forEach(res => {
    myReservationsList.appendChild(renderReservationItem(res));
  });
  bindDeleteButtons(myReservationsList);
  bindLeaveButtons(myReservationsList);
}

function bindDeleteButtons(container){
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!confirm('Tem certeza que deseja excluir esta reserva?')) return;
      const id = this.getAttribute('data-id');
      const updated = getReservations().filter(r => String(r.id) !== String(id));
      saveReservations(updated);
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
    btn.addEventListener('click', function(){
      const currentUser = getCurrentUser();
      if(!currentUser){
        showLogin();
        return;
      }

      const id = this.getAttribute('data-id');
      const result = removePassengerFromReservation(id, currentUser);
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
  const validacaoPassageiros = validarListaPassageiros(currentUser ? currentUser.nome : '', passageirosWidget.getNomes());

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

  if(dataIda && dataVolta && dataVolta < dataIda){
    setError('dataVolta', 'A data de volta deve ser igual ou posterior à data de ida.');
    valid = false;
  }

  if(dataIda && dataVolta && dataIda === dataVolta && horarioRetirada && horarioDevolucao && horarioDevolucao <= horarioRetirada){
    setError('horarioDevolucao', 'O horário de devolução deve ser após o horário de retirada.');
    valid = false;
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

form.addEventListener('submit', function(e){
  e.preventDefault();
  confirmation.classList.remove('show');

  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  if(!validateForm()){
    return;
  }

  const reserva = {
    id: Date.now(),
    nome: currentUser.nome,
    email: '',
    partida: partidaSelect.value,
    destino: getDestinoValue(),
    carro: carroSelect.value,
    dataIda: dataIdaInput.value,
    dataVolta: dataVoltaInput.value,
    horarioRetirada: horarioRetiradaSelect.value,
    horarioDevolucao: horarioDevolucaoSelect.value,
    passageiros: [{ nome: currentUser.nome }].concat(validarListaPassageiros(currentUser.nome, passageirosWidget.getNomes()).passageiros),
    passageirosConfirmados: 0
  };

  const list = getReservations();
  list.push(reserva);
  saveReservations(list);
  renderMyReservations();
  renderMainCalendar();
  renderAvailableRides();

  const vagasRestantes = getVagasRestantes(reserva);
  const qtdConfirmados = getPassageirosConfirmados(reserva);
  confirmationText.textContent = 'Reserva confirmada! ' + reserva.partida + ' → ' + reserva.destino + ' (Polo final ' + reserva.carro + ') de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Você + ' + qtdConfirmados + (qtdConfirmados === 1 ? ' passageiro confirmado' : ' passageiros confirmados') + '. Vagas restantes: ' + vagasRestantes + '.';
  confirmation.classList.add('show');

  form.reset();
  fieldCarro.classList.add('hidden');
  carroSelect.innerHTML = '<option value="">Selecione...</option>';
  passageirosWidget.clear();
  populateDestinoOptions();
  toggleDestinoOutro();
  clearAllErrors();
  refreshDatePickers();
  checkAndShowCompatibleRides();

  setTimeout(() => {
    confirmation.classList.remove('show');
  }, 6000);
});

partidaSelect.addEventListener('change', () => {
  setError('partida', '');
  populateCarroOptions();
  populateDestinoOptions();
  refreshDatePickers();
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
});

[dataIdaInput, dataVoltaInput].forEach(el => {
  el.addEventListener('input', () => {
    setError(el.id, '');
    checkAndShowCompatibleRides();
  });
});

[horarioRetiradaSelect, horarioDevolucaoSelect].forEach(el => {
  el.addEventListener('change', () => {
    setError(el.id, '');
    checkAndShowCompatibleRides();
  });
});
