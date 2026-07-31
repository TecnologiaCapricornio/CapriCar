/* Passageiros, ocupação e compartilhamento de caronas */
const ridesSection = document.getElementById('ridesSection');
const ridesList = document.getElementById('ridesList');

/* =========================================================
   Compartilhamento de vagas (caronas)
   ========================================================= */

// Compatibilidade: reservas antigas não têm "passageiros" -> tratamos como 1 passageiro (o criador).
function getPassageiros(reserva){
  if(Array.isArray(reserva.passageiros) && reserva.passageiros.length > 0){
    return reserva.passageiros;
  }
  return [{ nome: reserva.nome }];
}

// Compatibilidade: reservas antigas sem o campo "passageirosConfirmados" são tratadas como 0.
function getPassageirosConfirmados(reserva){
  const n = Number(reserva.passageirosConfirmados);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initialFrom(nome){
  const trimmed = String(nome || '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

// Gera o HTML do bloco "Quem já está no carro" para uma reserva. Reutilizado nos
// cards de carona (aba principal e "Caronas Disponíveis"), no Calendário e no
// modal de confirmação de entrada. Nunca expõe email/senha — apenas nomes.
function renderOcupantesHTML(reserva){
  const passageiros = getPassageiros(reserva);
  const confirmados = getPassageirosConfirmados(reserva);
  const vagas = getVagasRestantes(reserva);

  let chipsHtml = '';
  passageiros.forEach(p => {
    const isDriver = p.nome === reserva.nome;
    chipsHtml +=
      '<div class="occupant-chip' + (isDriver ? ' is-driver' : '') + '">' +
        '<span class="occupant-avatar">' + escapeHtml(initialFrom(p.nome)) + '</span>' +
        '<span>' + escapeHtml(p.nome) + '</span>' +
        (isDriver ? '<span class="occupant-role">Motorista</span>' : '') +
      '</div>';
  });

  let extraHtml = '';
  if(confirmados > 0){
    extraHtml = '<div class="occupants-unidentified">+ ' + confirmados + (confirmados === 1 ? ' passageiro não identificado' : ' passageiros não identificados') + '</div>';
  }

  let emptyHtml = '';
  if(passageiros.length <= 1 && confirmados === 0){
    emptyHtml = '<div class="occupants-empty">Nenhum passageiro ainda — você será o primeiro</div>';
  }

  return (
    '<div class="occupants-block">' +
      '<div class="occupants-title">Quem já está no carro</div>' +
      '<div class="occupants-chips">' + chipsHtml + '</div>' +
      extraHtml +
      emptyHtml +
      '<div class="occupants-vagas">' + vagas + (vagas === 1 ? ' vaga restante' : ' vagas restantes') + '</div>' +
    '</div>'
  );
}

// Widget reutilizável de "lista de passageiros nomeados" — usado nos 3 formulários
// (Nova Reserva, Reserva Rápida do Calendário e Modal do Admin). Mantém zero duplicação
// de lógica de adicionar/remover linhas entre os formulários.
// options.maxPassageiros: quantidade máxima de linhas de passageiro (padrão CAPACIDADE_MAXIMA - 1).
function createPassengerListWidget(containerId, options){
  const opts = options || {};
  const maxPassageiros = opts.maxPassageiros || (CAPACIDADE_MAXIMA - 1);
  const container = document.getElementById(containerId);

  const listEl = document.createElement('div');
  listEl.className = 'passenger-list';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'passenger-add-btn';
  addBtn.textContent = '+ Adicionar passageiro';
  const hintEl = document.createElement('div');
  hintEl.className = 'passenger-list-hint hidden';
  hintEl.textContent = 'Capacidade máxima atingida (' + CAPACIDADE_MAXIMA + ' pessoas)';

  container.innerHTML = '';
  container.appendChild(listEl);
  container.appendChild(addBtn);
  container.appendChild(hintEl);

  function updateAddBtnState(){
    const atMax = listEl.children.length >= maxPassageiros;
    addBtn.classList.toggle('hidden', atMax);
    hintEl.classList.toggle('hidden', !atMax);
  }

  function addRow(value){
    if(listEl.children.length >= maxPassageiros) return;
    const row = document.createElement('div');
    row.className = 'passenger-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Nome do passageiro';
    input.autocomplete = 'off';
    input.value = value || '';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'passenger-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function(){
      row.remove();
      updateAddBtnState();
    });
    row.appendChild(input);
    row.appendChild(removeBtn);
    listEl.appendChild(row);
    updateAddBtnState();
    return input;
  }

  addBtn.addEventListener('click', function(){
    const input = addRow('');
    if(input) input.focus();
  });

  function getNomes(){
    return Array.from(listEl.querySelectorAll('input[type="text"]')).map(i => i.value);
  }

  function setNomes(nomes){
    listEl.innerHTML = '';
    (nomes || []).forEach(nome => addRow(nome));
    updateAddBtnState();
  }

  function clear(){
    listEl.innerHTML = '';
    updateAddBtnState();
  }

  updateAddBtnState();

  return { getNomes: getNomes, setNomes: setNomes, clear: clear, addRow: addRow };
}

// Valida a lista de nomes de passageiros de um formulário.
// Retorna { ok:true, passageiros:[...] } ou { ok:false, message: '...' }.
function validarListaPassageiros(nomeCriador, nomes, maxPassageiros){
  const limite = maxPassageiros == null ? (CAPACIDADE_MAXIMA - 1) : maxPassageiros;
  const vistos = [nomeCriador.trim().toLowerCase()];
  const passageiros = [];

  for(let i = 0; i < nomes.length; i++){
    const nome = String(nomes[i] || '').trim();
    if(!nome){
      return { ok:false, message:'Informe o nome do passageiro ou remova a linha.' };
    }
    const chave = nome.toLowerCase();
    if(chave === nomeCriador.trim().toLowerCase()){
      return { ok:false, message:'Você já está na lista como motorista.' };
    }
    if(vistos.indexOf(chave) !== -1){
      return { ok:false, message:'Passageiro repetido: ' + nome + '.' };
    }
    vistos.push(chave);
    passageiros.push({ nome: nome });
  }

  if(passageiros.length > limite){
    return { ok:false, message:'Capacidade máxima atingida (' + (limite + 1) + ' pessoas).' };
  }

  return { ok:true, passageiros:passageiros };
}

// Total de ocupantes = passageiros com nome (criador + quem entrou via "Entrar nessa carona")
// + passageiros já confirmados informados pelo criador (sem nome, apenas ocupam vaga).
function getOcupantes(reserva){
  return getPassageiros(reserva).length + getPassageirosConfirmados(reserva);
}

function getVagasRestantes(reserva){
  return Math.max(0, getVehicleCapacity(reserva) - getOcupantes(reserva));
}

function isReservaLotada(reserva){
  return getOcupantes(reserva) >= getVehicleCapacity(reserva);
}

function isPassageiro(reserva, nome){
  if(!nome) return false;
  return getPassageiros(reserva).some(p => p.nome === nome);
}

// Verifica se dois horários (HH:MM) são "compatíveis" o suficiente para compartilhar o mesmo trajeto.
// Consideramos compatível quando a diferença entre os horários de retirada é de até 60 minutos.
function horariosCompativeis(h1, h2){
  if(!h1 || !h2) return true;
  const toMin = h => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm;
  };
  return Math.abs(toMin(h1) - toMin(h2)) <= 60;
}

// Busca reservas existentes com o mesmo trajeto (partida, destino, data de ida, data de volta)
// que tenham vagas disponíveis e horário de retirada compatível.
function findReservasCompativeis(partida, destino, dataIda, dataVolta, horarioRetirada, currentUserNome){
  return getReservations().filter(r => {
    if(isReservationCompleted(r)) return false;
    if(r.partida !== partida) return false;
    if(r.destino !== destino) return false;
    if(r.dataIda !== dataIda) return false;
    if(r.dataVolta !== dataVolta) return false;
    if(isReservaLotada(r)) return false;
    if(currentUserNome && isPassageiro(r, currentUserNome)) return false;
    if(!horariosCompativeis(r.horarioRetirada, horarioRetirada)) return false;
    return true;
  });
}

function renderRideCard(reserva){
  const vagas = getVagasRestantes(reserva);
  const ocupantes = getOcupantes(reserva);
  const capacidade = getVehicleCapacity(reserva);
  const card = document.createElement('div');
  card.className = 'ride-card';
  card.innerHTML =
    '<div class="ride-info">' +
      '<div class="ride-route">' + escapeHTML(reserva.partida) + ' &rarr; ' + escapeHTML(reserva.destino) + '</div>' +
      '<span class="reservation-car">Polo final ' + escapeHTML(reserva.carro) + '</span>' +
      '<div class="ride-driver">Reservado por: ' + escapeHTML(reserva.nome) + '</div>' +
      '<div class="ride-meta">' + formatDate(reserva.dataIda) + (reserva.horarioRetirada ? ' às ' + reserva.horarioRetirada : '') + ' até ' + formatDate(reserva.dataVolta) + (reserva.horarioDevolucao ? ' às ' + reserva.horarioDevolucao : '') + '</div>' +
      '<div class="ride-seats">' + PEOPLE_ICON_SVG + '<span>' + vagas + (vagas === 1 ? ' vaga disponível' : ' vagas disponíveis') + ' (' + ocupantes + '/' + capacidade + ')</span></div>' +
      renderOcupantesHTML(reserva) +
    '</div>' +
    '<div class="ride-actions">' +
      '<button type="button" class="join-ride-btn" data-id="' + escapeHTML(reserva.id) + '">Entrar nessa carona</button>' +
    '</div>';
  return card;
}

// Adiciona o usuário como passageiro em uma reserva existente (usado tanto pela
// sugestão automática de caronas compatíveis quanto pela aba "Caronas Disponíveis").
// Retorna { reserva } em caso de sucesso, ou null se a reserva não existir, já
// estiver lotada ou o usuário já for passageiro/criador dela.
async function addPassengerToReservation(id, user){
  const list = getReservations();
  const idx = list.findIndex(r => String(r.id) === String(id));
  if(idx === -1) return null;

  const reserva = list[idx];
  reserva.passageiros = getPassageiros(reserva);

  if(isReservaLotada(reserva) || isPassageiro(reserva, user.nome)){
    return null;
  }

  reserva.passageiros.push({ nome: user.nome });
  list[idx] = reserva;
  try{
    await saveReservations(list);
  }catch(error){
    await hydrateDatabaseState();
    alert(error.message);
    return null;
  }
  logAudit('entrou', 'reserva', reserva.id, user.nome + ' entrou na carona de ' + reserva.partida + ' para ' + reserva.destino);

  return { reserva: reserva };
}

// Remove o usuário do array de passageiros de uma reserva (usado pelo botão "Sair da carona").
// O criador da reserva não pode sair por essa via — apenas excluir a reserva inteira.
// Retorna { reserva } em caso de sucesso, ou null se a reserva não existir, o usuário for
// o criador, ou o usuário não for passageiro dela.
async function removePassengerFromReservation(id, user){
  const list = getReservations();
  const idx = list.findIndex(r => String(r.id) === String(id));
  if(idx === -1) return null;

  const reserva = list[idx];
  if(reserva.nome === user.nome) return null; // criador não pode "sair", só excluir

  reserva.passageiros = getPassageiros(reserva);
  if(!isPassageiro(reserva, user.nome)) return null;

  reserva.passageiros = reserva.passageiros.filter(p => p.nome !== user.nome);
  list[idx] = reserva;
  try{
    await saveReservations(list);
  }catch(error){
    await hydrateDatabaseState();
    alert(error.message);
    return null;
  }
  logAudit('saiu', 'reserva', reserva.id, user.nome + ' saiu da carona');

  return { reserva: reserva };
}

function checkAndShowCompatibleRides(){
  const currentUser = getCurrentUser();
  const partida = partidaSelect.value;
  const destino = getDestinoValue();
  const dataIda = dataIdaInput.value;
  const dataVolta = dataVoltaInput.value;
  const horarioRetirada = horarioRetiradaSelect.value;

  if(!partida || !destino || !dataIda || !dataVolta || partida === destino){
    ridesSection.classList.add('hidden');
    ridesList.innerHTML = '';
    return;
  }

  const compativeis = findReservasCompativeis(partida, destino, dataIda, dataVolta, horarioRetirada, currentUser ? currentUser.nome : null);

  if(compativeis.length === 0){
    ridesSection.classList.add('hidden');
    ridesList.innerHTML = '';
    return;
  }

  ridesList.innerHTML = '';
  compativeis.forEach(reserva => {
    ridesList.appendChild(renderRideCard(reserva));
  });
  ridesSection.classList.remove('hidden');
}

async function joinRide(id){
  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  const result = await addPassengerToReservation(id, currentUser);
  if(!result){
    checkAndShowCompatibleRides();
    return;
  }

  const reserva = result.reserva;
  const vagasRestantes = getVagasRestantes(reserva);
  confirmationText.textContent = 'Você entrou na carona! ' + reserva.partida + ' → ' + reserva.destino + ' (Polo final ' + reserva.carro + ') de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '/' + CAPACIDADE_MAXIMA + '.';
  confirmation.classList.add('show');

  form.reset();
  fieldCarro.classList.add('hidden');
  carroSelect.innerHTML = '<option value="">Selecione...</option>';
  populateDestinoOptions();
  toggleDestinoOutro();
  clearAllErrors();
  refreshDatePickers();
  checkAndShowCompatibleRides();

  renderMyReservations();
  renderMainCalendar();
  renderAvailableRides();

  setTimeout(() => {
    confirmation.classList.remove('show');
  }, 6000);
}

ridesList.addEventListener('click', function(e){
  const btn = e.target.closest('.join-ride-btn');
  if(!btn) return;
  openJoinConfirmModal(btn.getAttribute('data-id'), 'main');
});

/* =========================================================
   Aba "Caronas Disponíveis"
   ========================================================= */
const filtroPartidaSelect = document.getElementById('filtroPartida');
const filtroDestinoSelect = document.getElementById('filtroDestino');
const filtroDataInput = document.getElementById('filtroData');
const availableRidesList = document.getElementById('availableRidesList');
const caronasConfirmation = document.getElementById('caronasConfirmation');
const caronasConfirmationText = document.getElementById('caronasConfirmation-text');

// Preenche os selects de filtro com "Todos" + todas as cidades cadastradas.
function populateFiltroOptions(){
  const optionsHtml = '<option value="">Todos</option>' +
    CIDADES.map(c => '<option value="' + escapeHTML(c) + '">' + escapeHTML(c) + '</option>').join('');

  const partidaAtual = filtroPartidaSelect.value;
  const destinoAtual = filtroDestinoSelect.value;

  filtroPartidaSelect.innerHTML = optionsHtml;
  filtroDestinoSelect.innerHTML = optionsHtml;

  filtroPartidaSelect.value = partidaAtual;
  filtroDestinoSelect.value = destinoAtual;
}

// Retorna as reservas com vagas disponíveis, excluindo aquelas em que o usuário
// logado já é passageiro ou criador, aplicando os filtros ativos.
function getAvailableRidesForCurrentUser(){
  const currentUser = getCurrentUser();
  const filtroPartida = filtroPartidaSelect.value;
  const filtroDestino = filtroDestinoSelect.value;
  const filtroData = filtroDataInput.value;

  return getReservations().filter(r => {
    if(isReservationCompleted(r)) return false;
    if(isReservaLotada(r)) return false;
    if(currentUser && isPassageiro(r, currentUser.nome)) return false;
    if(filtroPartida && r.partida !== filtroPartida) return false;
    if(filtroDestino && r.destino !== filtroDestino) return false;
    if(filtroData && !(filtroData >= r.dataIda && filtroData <= r.dataVolta)) return false;
    return true;
  });
}

function renderAvailableRideCard(reserva){
  const vagas = getVagasRestantes(reserva);
  const ocupantes = getOcupantes(reserva);
  const capacidade = getVehicleCapacity(reserva);
  const card = document.createElement('div');
  card.className = 'ride-card available-ride-card';
  card.innerHTML =
    '<div class="ride-info">' +
      '<div class="ride-route">' + escapeHTML(reserva.partida) + ' &rarr; ' + escapeHTML(reserva.destino) + '</div>' +
      '<span class="reservation-car">Polo final ' + escapeHTML(reserva.carro) + '</span>' +
      '<div class="ride-driver">Criado por: ' + escapeHTML(reserva.nome) + '</div>' +
      '<div class="ride-meta">Ida: ' + formatDate(reserva.dataIda) + (reserva.horarioRetirada ? ' às ' + reserva.horarioRetirada : '') + '</div>' +
      '<div class="ride-meta">Volta: ' + formatDate(reserva.dataVolta) + (reserva.horarioDevolucao ? ' às ' + reserva.horarioDevolucao : '') + '</div>' +
      '<div class="ride-occupants-badge">' + PEOPLE_ICON_SVG + '<span>' + ocupantes + '/' + capacidade + ' ocupantes</span></div>' +
      '<div class="ride-seats">' + PEOPLE_ICON_SVG + '<span>' + vagas + (vagas === 1 ? ' vaga disponível' : ' vagas disponíveis') + '</span></div>' +
      renderOcupantesHTML(reserva) +
    '</div>' +
    '<div class="ride-actions">' +
      '<button type="button" class="join-ride-btn" data-id="' + escapeHTML(reserva.id) + '">Entrar nessa carona</button>' +
    '</div>';
  return card;
}

function renderAvailableRides(){
  populateFiltroOptions();

  const currentUser = getCurrentUser();
  if(!currentUser){
    availableRidesList.innerHTML = '<div class="empty-state">Faça login para ver as caronas disponíveis.</div>';
    return;
  }

  const disponiveis = getAvailableRidesForCurrentUser();

  if(disponiveis.length === 0){
    availableRidesList.innerHTML = '<div class="empty-state">Nenhuma carona disponível no momento.</div>';
    return;
  }

  availableRidesList.innerHTML = '';
  disponiveis
    .slice()
    .sort((a,b) => a.dataIda < b.dataIda ? -1 : (a.dataIda > b.dataIda ? 1 : 0))
    .forEach(reserva => {
      availableRidesList.appendChild(renderAvailableRideCard(reserva));
    });
}

availableRidesList.addEventListener('click', function(e){
  const btn = e.target.closest('.join-ride-btn');
  if(!btn) return;

  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  openJoinConfirmModal(btn.getAttribute('data-id'), 'available');
});

async function joinRideFromAvailable(id){
  const currentUser = getCurrentUser();
  if(!currentUser){
    showLogin();
    return;
  }

  const result = await addPassengerToReservation(id, currentUser);
  if(!result){
    renderAvailableRides();
    return;
  }

  const reserva = result.reserva;
  const vagasRestantes = getVagasRestantes(reserva);
  caronasConfirmationText.textContent = 'Você entrou na carona! ' + reserva.partida + ' → ' + reserva.destino + ' (Polo final ' + reserva.carro + ') de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '/' + CAPACIDADE_MAXIMA + '.';
  caronasConfirmation.classList.add('show');

  renderAvailableRides();
  renderMyReservations();
  renderMainCalendar();
  checkAndShowCompatibleRides();

  setTimeout(() => {
    caronasConfirmation.classList.remove('show');
  }, 6000);
}

[filtroPartidaSelect, filtroDestinoSelect].forEach(el => {
  el.addEventListener('change', renderAvailableRides);
});

filtroDataInput.addEventListener('input', renderAvailableRides);
filtroDataInput.addEventListener('change', renderAvailableRides);
