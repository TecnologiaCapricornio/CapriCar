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

/* =========================================================
   Ocupação — duas peças, montadas separadamente pelas telas

   renderOccupancyBadgesHTML: as duas etiquetas (ocupantes e vagas), lado
   a lado. Vão na linha de chips logo abaixo do quadro de datas/horários,
   junto do selo de Motorista/Passageiro.

   renderOccupancyHTML: o mapa de lugares com as etiquetas de quem está
   no veículo logo abaixo, num quadro só. Fica no detalhamento da reserva.

   Estavam juntas até aqui, mas a posição natural das etiquetas é ao lado
   do selo de papel, e não dentro do quadro do mapa.
   ========================================================= */
function renderOccupancyBadgesHTML(reserva){
  const ocupantes = getOcupantes(reserva);
  const capacidade = getVehicleCapacity(reserva);
  const vagas = getVagasRestantes(reserva);

  return (
    '<span class="occupancy-tag">' + PEOPLE_ICON_SVG +
      '<span>' + ocupantes + '/' + capacidade + ' ocupantes</span></span>' +
    '<span class="occupancy-tag ' + (vagas > 0 ? 'occupancy-tag-free' : 'occupancy-tag-full') + '">' +
      PEOPLE_ICON_SVG + '<span>' +
      (vagas > 0
        ? vagas + (vagas === 1 ? ' vaga disponível' : ' vagas disponíveis')
        : 'Sem vagas') +
      '</span></span>'
  );
}

function renderOccupancyHTML(reserva, options){
  const allowRemove = !!(options && options.allowRemove);
  const passageiros = getPassageiros(reserva);
  const confirmados = getPassageirosConfirmados(reserva);

  let chipsHtml = '';
  passageiros.forEach(p => {
    const isDriver = p.nome === reserva.nome;
    chipsHtml +=
      '<div class="occupant-chip' + (isDriver ? ' is-driver' : '') + '">' +
        '<span class="occupant-avatar">' + escapeHtml(initialFrom(p.nome)) + '</span>' +
        '<span>' + escapeHtml(p.nome) + '</span>' +
        (isDriver ? '<span class="occupant-role">Motorista</span>' : '') +
        (allowRemove && !isDriver
          ? '<button type="button" class="occupant-remove-btn" data-reservation-id="' + escapeHtml(reserva.id) +
            '" data-user-id="' + escapeHtml(p.usuarioId || '') + '" title="Remover passageiro" aria-label="Remover ' +
            escapeHtml(p.nome) + '">&times;</button>'
          : '') +
      '</div>';
  });

  const naoIdentificados = confirmados > 0
    ? '<div class="occupants-unidentified">+ ' + confirmados +
      (confirmados === 1 ? ' passageiro não identificado' : ' passageiros não identificados') + '</div>'
    : '';

  return (
    '<div class="occupancy">' +
      (typeof renderSeatMapHTML === 'function' ? renderSeatMapHTML(reserva) : '') +
      '<div class="occupancy-people">' +
        '<div class="occupants-chips">' + chipsHtml + '</div>' +
        naoIdentificados +
      '</div>' +
    '</div>'
  );
}

// Liga um <input> de texto à busca de usuários corporativos (getPassengerDirectory),
// com sugestões enquanto digita e vínculo automático em correspondência exata ao sair
// do campo — mesmo comportamento usado nas linhas de passageiro, reaproveitado aqui
// para qualquer campo de nome (responsável da reserva, passageiro, etc.). O input é
// envolvido num wrapper (necessário para posicionar a lista de sugestões) que a
// função devolve para o chamador inserir no DOM. Enquanto o campo estiver vinculado
// a um usuário corporativo (input.dataset.userId preenchido), a classe
// "person-input-matched" fica marcada no wrapper para destacar visualmente o campo.
function attachPersonAutocomplete(input, options){
  const opts = options || {};
  const inputWrap = document.createElement('div');
  inputWrap.className = 'passenger-input-wrap';
  const suggestions = document.createElement('div');
  suggestions.className = 'passenger-suggestions hidden';

  function closeSuggestions(){
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
  }

  function updateMatchedState(){
    inputWrap.classList.toggle('person-input-matched', !!input.dataset.userId);
  }

  function selectUser(user){
    input.value = user.nome;
    input.dataset.userId = String(user.id);
    updateMatchedState();
    closeSuggestions();
    if(opts.onChange) opts.onChange(user);
  }

  function renderSuggestions(){
    input.dataset.userId = '';
    updateMatchedState();
    const query = input.value.trim().toLocaleLowerCase('pt-BR');
    if(!query){ closeSuggestions(); return; }
    const matches = getPassengerDirectory().filter(user =>
      String(user.nome).toLocaleLowerCase('pt-BR').includes(query)
    ).slice(0, 6);
    if(!matches.length){ closeSuggestions(); return; }
    suggestions.innerHTML = '';
    matches.forEach(user => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'passenger-suggestion';
      option.textContent = user.nome;
      option.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        selectUser(user);
      });
      suggestions.appendChild(option);
    });
    suggestions.classList.remove('hidden');
  }

  input.addEventListener('input', renderSuggestions);
  input.addEventListener('focus', renderSuggestions);
  input.addEventListener('blur', function(){
    const exact = findPassengerDirectoryUser(input.value);
    if(exact){
      selectUser(exact);
    } else if(input.dataset.userId){
      input.dataset.userId = '';
      updateMatchedState();
      if(opts.onChange) opts.onChange(null);
    }
    setTimeout(closeSuggestions, 100);
  });

  inputWrap.appendChild(input);
  inputWrap.appendChild(suggestions);
  updateMatchedState();
  return { element:inputWrap, refresh:updateMatchedState };
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
    const initial = value && typeof value === 'object'
      ? { nome:String(value.nome || ''), usuarioId:String(value.usuarioId || '') }
      : { nome:String(value || ''), usuarioId:'' };
    const row = document.createElement('div');
    row.className = 'passenger-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Busque um usuário ou digite o nome do visitante';
    input.autocomplete = 'off';
    input.value = initial.nome;
    input.dataset.userId = initial.usuarioId;
    const inputWrap = attachPersonAutocomplete(input).element;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'passenger-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function(){
      row.remove();
      updateAddBtnState();
    });
    row.appendChild(inputWrap);
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

  function getPassengers(){
    return Array.from(listEl.querySelectorAll('input[type="text"]')).map(input => ({
      nome:input.value,
      usuarioId:input.dataset.userId || ''
    }));
  }

  function setNomes(nomes){
    listEl.innerHTML = '';
    (nomes || []).forEach(nome => addRow(nome));
    updateAddBtnState();
  }

  function setPassengers(passengers){
    listEl.innerHTML = '';
    (passengers || []).forEach(passenger => addRow(passenger));
    updateAddBtnState();
  }

  function clear(){
    listEl.innerHTML = '';
    updateAddBtnState();
  }

  updateAddBtnState();

  return {
    getNomes:getNomes,
    getPassengers:getPassengers,
    setNomes:setNomes,
    setPassengers:setPassengers,
    clear:clear,
    addRow:addRow
  };
}

// Widget de ocupação editável direto no mapa de lugares - substitui, no modal
// admin, a dupla "lista de campos de nome" + "mapa somente leitura" que existia
// antes (redundante: as duas peças mostravam a mesma informação ao mesmo tempo).
// Aqui o mapa É o formulário: lugar livre clicado = adicionar passageiro; nome
// clicado = editar; botão × na etiqueta = remover. getContext() é chamado a
// cada render para ler nome do responsável/partida/carro atuais do formulário
// externo, então o chamador só precisa acionar refresh() quando esses campos
// mudarem (a própria lista de passageiros já se redesenha sozinha).
function createInteractiveOccupancyWidget(containerId, options){
  const opts = options || {};
  const maxPassageiros = opts.maxPassageiros || (CAPACIDADE_MAXIMA - 1);
  const getContext = opts.getContext || function(){ return { nome:'', partida:'', carro:'' }; };
  const container = document.getElementById(containerId);

  let passengers = []; // [{ nome, usuarioId, _editing }]
  let focusNextInput = false;

  function buildSyntheticReserva(){
    const ctx = getContext() || {};
    return {
      nome: ctx.nome || '',
      partida: ctx.partida || '',
      carro: ctx.carro || '',
      passageiros: [{ nome: ctx.nome || '' }].concat(
        passengers.map(p => ({ nome:p.nome, usuarioId:p.usuarioId }))
      ),
      passageirosConfirmados: 0
    };
  }

  function commitEdit(entry, index, input){
    const nome = input.value.trim();
    if(!nome){
      passengers.splice(index, 1);
    } else {
      entry.nome = nome;
      entry.usuarioId = input.dataset.userId || '';
      delete entry._editing;
    }
    render();
  }

  function buildDriverChip(nome){
    const chip = document.createElement('div');
    chip.className = 'occupant-chip is-driver';
    chip.innerHTML =
      '<span class="occupant-avatar">' + escapeHtml(initialFrom(nome)) + '</span>' +
      '<span>' + escapeHtml(nome || '—') + '</span>' +
      '<span class="occupant-role">Motorista</span>';
    return chip;
  }

  function buildViewChip(entry, index){
    const chip = document.createElement('div');
    chip.className = 'occupant-chip';
    const avatar = document.createElement('span');
    avatar.className = 'occupant-avatar';
    avatar.textContent = initialFrom(entry.nome);
    const nameBtn = document.createElement('button');
    nameBtn.type = 'button';
    nameBtn.className = 'occupant-name-btn';
    nameBtn.textContent = entry.nome;
    nameBtn.title = 'Editar passageiro';
    nameBtn.addEventListener('click', function(){
      entry._editing = true;
      focusNextInput = true;
      render();
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'occupant-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remover passageiro';
    removeBtn.setAttribute('aria-label', 'Remover ' + entry.nome);
    removeBtn.addEventListener('click', function(){
      passengers.splice(index, 1);
      render();
    });
    chip.appendChild(avatar);
    chip.appendChild(nameBtn);
    chip.appendChild(removeBtn);
    return chip;
  }

  function buildEditChip(entry, index){
    const chip = document.createElement('div');
    chip.className = 'occupant-chip occupant-chip-editing';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Busque um usuário ou digite o nome do visitante';
    input.autocomplete = 'off';
    input.value = entry.nome || '';
    input.dataset.userId = entry.usuarioId || '';
    const inputWrap = attachPersonAutocomplete(input, {
      onChange:function(user){
        entry.usuarioId = user ? String(user.id) : '';
      }
    }).element;
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){
        e.preventDefault();
        input.blur();
      } else if(e.key === 'Escape'){
        e.preventDefault();
        if(!entry.nome){
          passengers.splice(index, 1);
        } else {
          delete entry._editing;
        }
        render();
      }
    });
    // Atraso maior que o do autocomplete (100ms) para o clique numa sugestão
    // preencher o campo antes deste blur decidir se confirma ou remove a linha.
    input.addEventListener('blur', function(){
      setTimeout(function(){ commitEdit(entry, index, input); }, 120);
    });
    chip.appendChild(inputWrap);
    if(focusNextInput){
      focusNextInput = false;
      setTimeout(function(){ input.focus(); }, 0);
    }
    return chip;
  }

  function buildAddChip(){
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'occupant-chip occupant-chip-add';
    chip.textContent = '+ Adicionar passageiro';
    chip.addEventListener('click', addPassenger);
    return chip;
  }

  function addPassenger(){
    if(passengers.length >= maxPassageiros) return;
    passengers.push({ nome:'', usuarioId:'', _editing:true });
    focusNextInput = true;
    render();
  }

  function render(){
    const reserva = buildSyntheticReserva();
    const vagas = getVagasRestantes(reserva);

    const wrap = document.createElement('div');
    wrap.className = 'occupancy occupancy-interactive';

    const tagsRow = document.createElement('div');
    tagsRow.className = 'reservation-card-chips';
    tagsRow.innerHTML = renderOccupancyBadgesHTML(reserva);
    wrap.appendChild(tagsRow);

    const seatMapWrap = document.createElement('div');
    seatMapWrap.innerHTML = typeof renderSeatMapHTML === 'function' ? renderSeatMapHTML(reserva) : '';
    seatMapWrap.querySelectorAll('.seat-livre').forEach(function(seatEl){
      seatEl.classList.add('seat-clickable');
      seatEl.textContent = '+';
      seatEl.title = 'Adicionar passageiro';
      seatEl.setAttribute('role', 'button');
      seatEl.setAttribute('aria-label', 'Adicionar passageiro');
      seatEl.tabIndex = 0;
      seatEl.addEventListener('click', addPassenger);
      seatEl.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          addPassenger();
        }
      });
    });
    wrap.appendChild(seatMapWrap.firstElementChild || seatMapWrap);

    const peopleWrap = document.createElement('div');
    peopleWrap.className = 'occupancy-people';
    const chipsRow = document.createElement('div');
    chipsRow.className = 'occupants-chips';
    chipsRow.appendChild(buildDriverChip(reserva.nome));
    passengers.forEach(function(entry, index){
      chipsRow.appendChild(entry._editing ? buildEditChip(entry, index) : buildViewChip(entry, index));
    });
    if(vagas > 0 && passengers.length < maxPassageiros){
      chipsRow.appendChild(buildAddChip());
    }
    peopleWrap.appendChild(chipsRow);
    wrap.appendChild(peopleWrap);

    container.innerHTML = '';
    container.appendChild(wrap);
  }

  function getPassengers(){
    return passengers
      .filter(function(p){ return String(p.nome || '').trim(); })
      .map(function(p){ return { nome:p.nome, usuarioId:p.usuarioId || '' }; });
  }

  function setPassengers(list){
    passengers = (list || []).map(function(p){
      return p && typeof p === 'object'
        ? { nome:String(p.nome || ''), usuarioId:String(p.usuarioId || '') }
        : { nome:String(p || ''), usuarioId:'' };
    });
    render();
  }

  function addEmptyEntries(n){
    for(let i = 0; i < n && passengers.length < maxPassageiros; i++){
      passengers.push({ nome:'', usuarioId:'', _editing:true });
    }
    render();
  }

  function clear(){
    passengers = [];
    render();
  }

  render();

  return {
    getPassengers:getPassengers,
    setPassengers:setPassengers,
    addEmptyEntries:addEmptyEntries,
    clear:clear,
    refresh:render
  };
}

// Valida a lista de nomes de passageiros de um formulário.
// Retorna { ok:true, passageiros:[...] } ou { ok:false, message: '...' }.
function validarListaPassageiros(nomeCriador, nomes, maxPassageiros){
  const limite = maxPassageiros == null ? (CAPACIDADE_MAXIMA - 1) : maxPassageiros;
  const vistos = [nomeCriador.trim().toLowerCase()];
  const passageiros = [];

  for(let i = 0; i < nomes.length; i++){
    const entry = nomes[i] && typeof nomes[i] === 'object' ? nomes[i] : { nome:nomes[i] };
    const nome = String(entry.nome || '').trim();
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
    const linkedUser = entry.usuarioId
      ? getPassengerDirectory().find(user => String(user.id) === String(entry.usuarioId))
      : findPassengerDirectoryUser(nome);
    if(entry.usuarioId && (!linkedUser || String(linkedUser.nome).trim().toLocaleLowerCase('pt-BR') !== chave)){
      return { ok:false, message:'O usuário selecionado não é mais válido. Pesquise novamente ou informe como visitante.' };
    }
    vistos.push(chave);
    passageiros.push(linkedUser
      ? { nome:linkedUser.nome, usuarioId:String(linkedUser.id) }
      : { nome:nome, externo:true }
    );
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
  const user = nome && typeof nome === 'object' ? nome : { nome:nome };
  return getPassageiros(reserva).some(p =>
    (user.id && p.usuarioId && String(p.usuarioId) === String(user.id)) ||
    (p.externo !== true && String(p.nome || '').trim().toLocaleLowerCase('pt-BR') ===
      String(user.nome || '').trim().toLocaleLowerCase('pt-BR')
    )
  );
}

// Busca reservas com a mesma origem, o mesmo destino e o mesmo dia de ida.
// Os horários e a data de volta podem ser diferentes: eles são exibidos no cartão
// para que a pessoa decida se a carona atende à necessidade dela.
function findReservasCompativeis(partida, destino, dataIda, currentUserNome){
  return getReservations().filter(r => {
    if(!reservationCanAcceptPassengers(r)) return false;
    if(r.partida !== partida) return false;
    if(r.destino !== destino) return false;
    if(r.dataIda !== dataIda) return false;
    if(isReservaLotada(r)) return false;
    if(currentUserNome && isPassageiro(r, currentUserNome)) return false;
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
      '<div class="ride-route">' + renderReservationNumber(reserva) + escapeHTML(reserva.partida) + ' &rarr; ' + escapeHTML(reserva.destino) + '</div>' +
      '<div class="reservation-vehicle">' + getVehicleDisplayHTML(reserva) + '</div>' +
      '<div class="ride-driver">Reservado por: ' + escapeHTML(reserva.nome) + '</div>' +
      '<div class="ride-meta reservation-period">' + renderReservationPeriod(reserva) + '</div>' +
      '<div class="reservation-card-chips">' + renderOccupancyBadgesHTML(reserva) + '</div>' +
      renderOccupancyHTML(reserva) +
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

  if(!reservationCanAcceptPassengers(reserva) || isReservaLotada(reserva) || isPassageiro(reserva, user)){
    return null;
  }

  reserva.passageiros.push({ nome: user.nome, usuarioId:user.id });
  list[idx] = reserva;
  try{
    await saveReservations(list);
  }catch(error){
    await hydrateDatabaseState();
    await showSiteAlert(error.message, {
      title:'Não foi possível entrar na carona',
      type:'danger'
    });
    return null;
  }
  return { reserva: reserva };
}

// Remove o usuário do array de passageiros de uma reserva (usado pelo botão "Sair da carona").
// O criador da reserva não pode sair por essa via — apenas excluir a reserva inteira.
// Retorna { reserva } em caso de sucesso, ou null se a reserva não existir, o usuário for
// o criador, ou o usuário não for passageiro dela.
async function removePassengerFromReservation(id, user, motivo){
  const list = getReservations();
  const idx = list.findIndex(r => String(r.id) === String(id));
  if(idx === -1) return null;

  const reserva = list[idx];
  if(reserva.nome === user.nome) return null; // criador não pode "sair", só excluir

  reserva.passageiros = getPassageiros(reserva);
  if(!isPassageiro(reserva, user)) return null;

  reserva.passageiros = reserva.passageiros.filter(p => !(
    (p.usuarioId && user.id && String(p.usuarioId) === String(user.id)) ||
    String(p.nome || '').trim().toLocaleLowerCase('pt-BR') ===
      String(user.nome || '').trim().toLocaleLowerCase('pt-BR')
  ));
  list[idx] = reserva;
  try{
    await saveReservations(list, { motivoRemocao:motivo, reservationId:reserva.id });
  }catch(error){
    await hydrateDatabaseState();
    await showSiteAlert(error.message, {
      title:'Não foi possível sair da carona',
      type:'danger'
    });
    return null;
  }
  return { reserva: reserva };
}

// Remove um passageiro específico da reserva, usada pelo motorista (dono da
// reserva) para liberar uma vaga - por exemplo, quando algo precisa ser
// transportado no lugar de um passageiro. Diferente de
// removePassengerFromReservation (o próprio passageiro saindo da carona):
// aqui quem age é o motorista, removendo outra pessoa pelo usuarioId dela.
async function removePassengerAsDriver(reservationId, passengerUserId, motivo){
  const currentUser = getCurrentUser();
  if(!currentUser) return null;
  const list = getReservations();
  const idx = list.findIndex(r => String(r.id) === String(reservationId));
  if(idx === -1) return null;

  const reserva = list[idx];
  if(!isReservationCreator(reserva, currentUser)) return null;

  reserva.passageiros = getPassageiros(reserva).filter(p =>
    String(p.usuarioId || '') !== String(passengerUserId)
  );
  list[idx] = reserva;
  try{
    await saveReservations(list, { motivoRemocao:motivo, reservationId:reserva.id });
  }catch(error){
    await hydrateDatabaseState();
    await showSiteAlert(error.message, {
      title:'Não foi possível remover o passageiro',
      type:'danger'
    });
    return null;
  }
  return { reserva: reserva };
}

function checkAndShowCompatibleRides(){
  const currentUser = getCurrentUser();
  const partida = partidaSelect.value;
  const destino = getDestinoValue();
  const dataIda = dataIdaInput.value;

  if(!partida || !destino || !dataIda || partida === destino){
    ridesSection.classList.add('hidden');
    ridesList.innerHTML = '';
    return;
  }

  const compativeis = findReservasCompativeis(
    partida,
    destino,
    dataIda,
    currentUser ? currentUser.nome : null
  );

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
  confirmationText.textContent = 'Você entrou na carona! ' + reserva.partida + ' → ' + reserva.destino + ' de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '/' + CAPACIDADE_MAXIMA + '.';
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
    if(!reservationCanAcceptPassengers(r)) return false;
    if(isReservaLotada(r)) return false;
    if(currentUser && isPassageiro(r, currentUser)) return false;
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
      '<div class="ride-route">' + renderReservationNumber(reserva) + escapeHTML(reserva.partida) + ' &rarr; ' + escapeHTML(reserva.destino) + '</div>' +
      '<div class="reservation-vehicle">' + getVehicleDisplayHTML(reserva) + '</div>' +
      '<div class="ride-driver">Criado por: ' + escapeHTML(reserva.nome) + '</div>' +
      '<div class="ride-meta reservation-period">' + renderReservationPeriod(reserva) + '</div>' +
      '<div class="reservation-card-chips">' + renderOccupancyBadgesHTML(reserva) + '</div>' +
      renderOccupancyHTML(reserva) +
    '</div>' +
    '<div class="ride-actions">' +
      '<button type="button" class="join-ride-btn" data-id="' + escapeHTML(reserva.id) + '">Entrar nessa carona</button>' +
    '</div>';
  return card;
}

function renderAvailableRides(){
  populateFiltroOptions();
  ensureRideWatchDatePickers();
  populateWatchOptions();
  renderRideWatches();

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

/* =========================================================
   Monitorar carona ("Monitorar rota") - avisa quem não pode/não vai
   dirigir quando surge uma reserva nova compatível com o que ela monitora.
   ========================================================= */
const rideWatchForm = document.getElementById('rideWatchForm');
const watchOriginSelect = document.getElementById('watchOrigin');
const watchDestinationSelect = document.getElementById('watchDestination');
const watchStartsOnInput = document.getElementById('watchStartsOn');
const watchEndsOnInput = document.getElementById('watchEndsOn');
const rideWatchError = document.getElementById('rideWatchError');
const rideWatchListEl = document.getElementById('rideWatchList');

function populateWatchOptions(){
  const cidadesHtml = CIDADES.map(c => '<option value="' + escapeHTML(c) + '">' + escapeHTML(c) + '</option>').join('');
  const origemAtual = watchOriginSelect.value;
  const destinoAtual = watchDestinationSelect.value;
  watchOriginSelect.innerHTML = '<option value="">Selecione...</option>' + cidadesHtml;
  watchDestinationSelect.innerHTML = '<option value="">Qualquer</option>' + cidadesHtml;
  watchOriginSelect.value = origemAtual;
  watchDestinationSelect.value = destinoAtual;
}

// createDatePicker vem de js/modals.js, carregado DEPOIS de js/rides.js -
// por isso a inicialização só roda sob demanda (na primeira renderização
// da aba Caronas), nunca no escopo de topo do arquivo.
let rideWatchDatePickersReady = false;
function ensureRideWatchDatePickers(){
  if(rideWatchDatePickersReady) return;
  rideWatchDatePickersReady = true;

  createDatePicker(watchStartsOnInput, document.getElementById('wrap-watchStartsOn'), null, {
    title:'De quando',
    getMinDate:() => todayISO(),
    getMaxDate:() => watchEndsOnInput.value || null
  });

  createDatePicker(watchEndsOnInput, document.getElementById('wrap-watchEndsOn'), null, {
    title:'Até quando',
    getMinDate:() => watchStartsOnInput.value || todayISO()
  });

  watchStartsOnInput.addEventListener('change', function(){
    if(watchEndsOnInput.value && watchEndsOnInput.value < watchStartsOnInput.value){
      watchEndsOnInput.value = '';
    }
    refreshDatePickers();
  });
}

function renderRideWatchItem(watch){
  const origem = watch.origin || 'Origem não informada';
  const destino = watch.destination || 'qualquer destino';
  return '<div class="ride-watch-item">' +
    '<div><strong>' + escapeHTML(origem) + ' → ' + escapeHTML(destino) + '</strong>' +
    '<small>' + escapeHTML(formatDate(watch.startsOn)) + ' a ' + escapeHTML(formatDate(watch.endsOn)) + '</small></div>' +
    '<button type="button" class="delete-btn ride-watch-cancel-btn" data-id="' + escapeHTML(watch.id) + '">Cancelar monitoramento</button>' +
    '</div>';
}

async function renderRideWatches(){
  if(!rideWatchListEl || !getCurrentUser()) return;
  try{
    const result = await apiRequest('/api/ride-watches');
    const watches = Array.isArray(result.watches) ? result.watches : [];
    rideWatchListEl.innerHTML = watches.length
      ? watches.map(renderRideWatchItem).join('')
      : '<div class="empty-state">Nenhuma rota monitorada no momento.</div>';
  }catch(error){
    rideWatchListEl.innerHTML = '';
  }
}

rideWatchListEl.addEventListener('click', async function(e){
  const btn = e.target.closest('.ride-watch-cancel-btn');
  if(!btn) return;
  try{
    await apiRequest('/api/ride-watches/' + encodeURIComponent(btn.getAttribute('data-id')), { method:'DELETE' });
  }catch(error){
    // segue para atualizar a lista de qualquer forma
  }
  renderRideWatches();
});

rideWatchForm.addEventListener('submit', async function(e){
  e.preventDefault();
  rideWatchError.textContent = '';
  if(!watchOriginSelect.value){
    rideWatchError.textContent = 'Selecione a origem que deseja monitorar.';
    return;
  }
  if(!watchStartsOnInput.value || !watchEndsOnInput.value){
    rideWatchError.textContent = 'Informe o período que deseja monitorar.';
    return;
  }
  if(watchEndsOnInput.value < watchStartsOnInput.value){
    rideWatchError.textContent = 'A data final não pode ser anterior à data inicial.';
    return;
  }
  try{
    await apiRequest('/api/ride-watches', {
      method:'POST',
      body:{
        origin:watchOriginSelect.value,
        destination:watchDestinationSelect.value,
        startsOn:watchStartsOnInput.value,
        endsOn:watchEndsOnInput.value
      }
    });
  }catch(error){
    rideWatchError.textContent = error.message;
    return;
  }
  rideWatchForm.reset();
  watchOriginSelect.value = '';
  watchDestinationSelect.value = '';
  renderRideWatches();
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
  caronasConfirmationText.textContent = 'Você entrou na carona! ' + reserva.partida + ' → ' + reserva.destino + ' de ' + formatDate(reserva.dataIda) + ' ' + reserva.horarioRetirada + ' a ' + formatDate(reserva.dataVolta) + ' ' + reserva.horarioDevolucao + '. Vagas restantes: ' + vagasRestantes + '/' + CAPACIDADE_MAXIMA + '.';
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
