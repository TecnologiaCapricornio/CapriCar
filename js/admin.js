/* Painel administrativo e edição de reservas */
/* =========================================================
   Painel de Administração (aba "Admin", visível somente para isAdmin())
   ========================================================= */
const adminFiltroFilial = document.getElementById('adminFiltroFilial');
const adminFiltroCarro = document.getElementById('adminFiltroCarro');
const adminFiltroData = document.getElementById('adminFiltroData');
const adminSummary = document.getElementById('adminSummary');
const adminReservationsList = document.getElementById('adminReservationsList');
const adminNovaReservaBtn = document.getElementById('adminNovaReservaBtn');

const adminReservaModal = document.getElementById('adminReservaModal');
const adminReservaCloseBtn = document.getElementById('adminReservaCloseBtn');
const adminReservaTitle = document.getElementById('adminReservaTitle');
const adminReservaError = document.getElementById('adminReservaError');
const adminReservaForm = document.getElementById('adminReservaForm');
const aNomeInput = document.getElementById('aNome');
const aPartidaSelect = document.getElementById('aPartida');
const aDestinoSelect = document.getElementById('aDestino');
const aDestinoOutroInput = document.getElementById('aDestinoOutro');
const aCarroSelect = document.getElementById('aCarro');
const aDataIdaInput = document.getElementById('aDataIda');
const aDataVoltaInput = document.getElementById('aDataVolta');
const aHorarioRetiradaSelect = document.getElementById('aHorarioRetirada');
const aHorarioDevolucaoSelect = document.getElementById('aHorarioDevolucao');
const aPassageirosWidget = createPassengerListWidget('aPassageirosListContainer');
const adminOcupantesPanel = document.getElementById('adminOcupantesPanel');
const aLegadoAvisoBox = document.getElementById('aLegadoAvisoBox');
const aLegadoAvisoTexto = document.getElementById('aLegadoAvisoTexto');
const aConverterLegadoBtn = document.getElementById('aConverterLegadoBtn');
let aLegadoPendente = 0; // qtd de passageirosConfirmados (legado) ainda não convertidos nesta edição

let adminEditingId = null; // null = modo criação ("Nova reserva como admin")

populateHorarioOptions(aHorarioRetiradaSelect);
populateHorarioOptions(aHorarioDevolucaoSelect);

// Preenche o select de destino do modal admin, removendo a cidade igual à partida.
function populateAdminDestinoOptions(){
  const partida = aPartidaSelect.value;
  const currentDestino = aDestinoSelect.value;
  let html = '<option value="">Selecione...</option>';
  CIDADES.forEach(cidade => {
    if(cidade === partida) return;
    html += '<option value="' + cidade + '">' + cidade + '</option>';
  });
  html += '<option value="Outro">Outro</option>';
  aDestinoSelect.innerHTML = html;
  if(currentDestino && currentDestino !== partida){
    aDestinoSelect.value = currentDestino;
  }
  toggleAdminDestinoOutro();
}

function toggleAdminDestinoOutro(){
  if(aDestinoSelect.value === 'Outro'){
    aDestinoOutroInput.classList.remove('hidden');
  } else {
    aDestinoOutroInput.classList.add('hidden');
    aDestinoOutroInput.value = '';
  }
}

function getAdminDestinoValue(){
  if(aDestinoSelect.value === 'Outro'){
    return aDestinoOutroInput.value.trim();
  }
  return aDestinoSelect.value;
}

function populateAdminCarroOptions(){
  const partida = aPartidaSelect.value;
  const carros = CARROS_POR_FILIAL[partida] || [];
  const currentCarro = aCarroSelect.value;
  aCarroSelect.innerHTML = '<option value="">Selecione...</option>' +
    carros.map(c => '<option value="' + c + '">Polo final ' + c + '</option>').join('');
  if(carros.includes(currentCarro)){
    aCarroSelect.value = currentCarro;
  }
}

aPartidaSelect.addEventListener('change', function(){
  populateAdminCarroOptions();
  populateAdminDestinoOptions();
});
aDestinoSelect.addEventListener('change', toggleAdminDestinoOutro);

function setAdminError(msg){
  adminReservaError.textContent = msg || '';
}

function setAdminFieldError(fieldId, message){
  const field = document.getElementById('afield-' + fieldId);
  const errorEl = document.getElementById('error-a' + fieldId.charAt(0).toUpperCase() + fieldId.slice(1));
  if(field) field.classList.toggle('invalid', !!message);
  if(errorEl) errorEl.textContent = message || '';
}

function clearAdminFieldErrors(){
  ['Nome','Partida','Destino','Carro','DataIda','DataVolta','HorarioRetirada','HorarioDevolucao','PassageirosConfirmados'].forEach(suffix => {
    const errorEl = document.getElementById('error-a' + suffix);
    if(errorEl) errorEl.textContent = '';
  });
  document.querySelectorAll('#adminReservaForm .field').forEach(f => f.classList.remove('invalid'));
  setAdminError('');
}

// Renderiza o painel de ocupantes dentro do modal admin: somente leitura.
// A edição de passageiros (adicionar/remover/renomear) é feita exclusivamente
// pelo widget aPassageirosWidget e aplicada ao Salvar — única fonte de verdade,
// evitando divergência entre uma edição "imediata" e o estado em memória do form.
function renderAdminOcupantesPanel(reserva){
  if(!reserva){
    adminOcupantesPanel.innerHTML = '';
    return;
  }
  adminOcupantesPanel.innerHTML = renderOcupantesHTML(reserva);
}

// Abre o modal admin. Se reservaId for null, abre em modo criação (nome livre).
function openAdminReservaModal(reservaId){
  adminEditingId = reservaId;
  clearAdminFieldErrors();

  if(reservaId == null){
    adminReservaTitle.textContent = 'Nova reserva (como admin)';
    aNomeInput.value = '';
    aNomeInput.disabled = false;
    aPartidaSelect.value = '';
    populateAdminCarroOptions();
    aCarroSelect.value = '';
    populateAdminDestinoOptions();
    aDestinoSelect.value = '';
    aDataIdaInput.value = '';
    aDataVoltaInput.value = '';
    aHorarioRetiradaSelect.value = '';
    aHorarioDevolucaoSelect.value = '';
    aPassageirosWidget.clear();
    aLegadoPendente = 0;
    aLegadoAvisoBox.classList.add('hidden');
    renderAdminOcupantesPanel(null);
  } else {
    const reserva = getReservations().find(r => String(r.id) === String(reservaId));
    if(!reserva) return;
    adminReservaTitle.textContent = 'Editar reserva';
    aNomeInput.value = reserva.nome;
    aNomeInput.disabled = false;
    aPartidaSelect.value = reserva.partida;
    populateAdminCarroOptions();
    aCarroSelect.value = reserva.carro;
    populateAdminDestinoOptions();
    if(CIDADES.includes(reserva.destino)){
      aDestinoSelect.value = reserva.destino;
      toggleAdminDestinoOutro();
    } else {
      aDestinoSelect.value = 'Outro';
      toggleAdminDestinoOutro();
      aDestinoOutroInput.value = reserva.destino;
    }
    aDataIdaInput.value = reserva.dataIda;
    aDataVoltaInput.value = reserva.dataVolta;
    aHorarioRetiradaSelect.value = reserva.horarioRetirada || '';
    aHorarioDevolucaoSelect.value = reserva.horarioDevolucao || '';
    // Pré-preenche o widget com os passageiros nomeados atuais, exceto o criador
    // (que continua sem botão de remover — não faz parte da lista editável).
    const nomeadosSemCriador = getPassageiros(reserva).filter(p => p.nome !== reserva.nome).map(p => p.nome);
    aPassageirosWidget.setNomes(nomeadosSemCriador);
    aLegadoPendente = getPassageirosConfirmados(reserva);
    if(aLegadoPendente > 0){
      aLegadoAvisoTexto.textContent = 'Esta reserva tem ' + aLegadoPendente + (aLegadoPendente === 1 ? ' passageiro não identificado' : ' passageiros não identificados') + ' de um cadastro antigo';
      aLegadoAvisoBox.classList.remove('hidden');
    } else {
      aLegadoAvisoBox.classList.add('hidden');
    }
    renderAdminOcupantesPanel(reserva);
  }

  adminReservaModal.classList.remove('hidden');
}

function closeAdminReservaModal(){
  adminReservaModal.classList.add('hidden');
  adminEditingId = null;
}

adminReservaCloseBtn.addEventListener('click', closeAdminReservaModal);
adminReservaModal.addEventListener('click', function(e){
  if(e.target === adminReservaModal) closeAdminReservaModal();
});

adminNovaReservaBtn.addEventListener('click', function(){
  openAdminReservaModal(null);
});

// "Converter em nomes": adiciona N linhas vazias ao widget (uma para cada
// passageiro legado não identificado) e zera o contador — a zeragem só é
// persistida quando o formulário for salvo.
aConverterLegadoBtn.addEventListener('click', function(){
  for(let i = 0; i < aLegadoPendente; i++){
    aPassageirosWidget.addRow('');
  }
  aLegadoPendente = 0;
  aLegadoAvisoBox.classList.add('hidden');
});

adminReservaForm.addEventListener('submit', function(e){
  e.preventDefault();
  if(!isAdmin()) return;

  clearAdminFieldErrors();

  const nome = aNomeInput.value.trim();
  const partida = aPartidaSelect.value;
  const destino = getAdminDestinoValue();
  const carro = aCarroSelect.value;
  const dataIda = aDataIdaInput.value;
  const dataVolta = aDataVoltaInput.value;
  const horarioRetirada = aHorarioRetiradaSelect.value;
  const horarioDevolucao = aHorarioDevolucaoSelect.value;
  const validacaoPassageiros = validarListaPassageiros(nome, aPassageirosWidget.getNomes());

  let valid = true;
  if(!nome){ setAdminFieldError('nome', 'Informe o nome do responsável.'); valid = false; }
  if(!partida){ setAdminFieldError('partida', 'Selecione a filial de partida.'); valid = false; }
  if(!destino){ setAdminFieldError('destino', 'Selecione ou informe o destino.'); valid = false; }
  if(destino && partida && destino === partida){ setAdminFieldError('destino', 'O destino deve ser diferente da partida.'); valid = false; }
  if(!carro){ setAdminFieldError('carro', 'Selecione o carro.'); valid = false; }
  if(!dataIda){ setAdminFieldError('dataIda', 'Informe a data de ida.'); valid = false; }
  if(!dataVolta){ setAdminFieldError('dataVolta', 'Informe a data de volta.'); valid = false; }
  if(dataIda && dataVolta && dataVolta < dataIda){ setAdminFieldError('dataVolta', 'A data de volta deve ser igual ou posterior à data de ida.'); valid = false; }
  if(!horarioRetirada){ setAdminFieldError('horarioRetirada', 'Selecione o horário de retirada.'); valid = false; }
  if(!horarioDevolucao){ setAdminFieldError('horarioDevolucao', 'Selecione o horário de devolução.'); valid = false; }
  if(dataIda && dataVolta && dataIda === dataVolta && horarioRetirada && horarioDevolucao && horarioDevolucao <= horarioRetirada){
    setAdminFieldError('horarioDevolucao', 'O horário de devolução deve ser após o horário de retirada.');
    valid = false;
  }
  if(nome && !validacaoPassageiros.ok){
    setAdminFieldError('passageirosConfirmados', validacaoPassageiros.message);
    valid = false;
  }

  if(!valid) return;

  // Revalida conflito de horário com outras reservas do mesmo carro (exclui a própria reserva em edição).
  const conflitos = findConflictingReservations(partida, carro, dataIda, dataVolta, horarioRetirada, horarioDevolucao, adminEditingId);
  if(conflitos.length > 0){
    const msg = 'Este carro já está reservado neste horário. ' + buildConflictMessage(conflitos);
    setAdminError(msg);
    return;
  }

  const list = getReservations();

  if(adminEditingId == null){
    const reserva = {
      id: Date.now(),
      nome: nome,
      email: '',
      partida: partida,
      destino: destino,
      carro: carro,
      dataIda: dataIda,
      dataVolta: dataVolta,
      horarioRetirada: horarioRetirada,
      horarioDevolucao: horarioDevolucao,
      passageiros: [{ nome: nome }].concat(validacaoPassageiros.passageiros),
      passageirosConfirmados: 0
    };
    list.push(reserva);
    saveReservations(list);
  } else {
    const idx = list.findIndex(r => String(r.id) === String(adminEditingId));
    if(idx === -1){ setAdminError('Reserva não encontrada.'); return; }
    const reserva = list[idx];
    reserva.nome = nome;
    reserva.partida = partida;
    reserva.destino = destino;
    reserva.carro = carro;
    reserva.dataIda = dataIda;
    reserva.dataVolta = dataVolta;
    reserva.horarioRetirada = horarioRetirada;
    reserva.horarioDevolucao = horarioDevolucao;
    // O widget é a única fonte de verdade dos passageiros no modal admin: o que
    // estiver nele no momento de Salvar substitui a lista anterior por completo
    // (evita ressurreição/duplicação em relação a edições feitas em outra aba).
    reserva.passageiros = [{ nome: nome }].concat(validacaoPassageiros.passageiros);
    reserva.passageirosConfirmados = aLegadoPendente;
    list[idx] = reserva;
    saveReservations(list);
  }

  closeAdminReservaModal();
  renderAdminTab();
  renderMyReservations();
  renderMainCalendar();
  renderAvailableRides();
  refreshDatePickers();
});

function populateAdminFilters(){
  const filiais = CIDADES;
  adminFiltroFilial.innerHTML = '<option value="">Todas</option>' +
    filiais.map(f => '<option value="' + f + '">' + f + '</option>').join('');
  const todosCarros = [];
  filiais.forEach(f => (CARROS_POR_FILIAL[f] || []).forEach(c => todosCarros.push(c)));
  adminFiltroCarro.innerHTML = '<option value="">Todos</option>' +
    todosCarros.map(c => '<option value="' + c + '">Polo final ' + c + '</option>').join('');
}
populateAdminFilters();

function renderAdminReservationItem(res){
  const ocupantes = getOcupantes(res);
  const item = document.createElement('div');
  item.className = 'reservation-item';
  item.innerHTML =
    '<div class="reservation-info">' +
      '<div class="reservation-route">' + res.partida + ' &rarr; ' + res.destino + '</div>' +
      '<span class="reservation-car">Polo final ' + res.carro + '</span>' +
      '<div class="reservation-details">' + formatDate(res.dataIda) + (res.horarioRetirada ? ' às ' + res.horarioRetirada : '') + ' até ' + formatDate(res.dataVolta) + (res.horarioDevolucao ? ' às ' + res.horarioDevolucao : '') + '</div>' +
      '<div class="reservation-name">Responsável: ' + escapeHtml(res.nome) + '</div>' +
      '<div class="reservation-occupants">' + PEOPLE_ICON_SVG + '<span>' + ocupantes + '/' + CAPACIDADE_MAXIMA + ' ocupantes</span></div>' +
    '</div>' +
    '<div class="reservation-actions">' +
      '<button type="button" class="submit-btn admin-edit-btn" data-id="' + res.id + '">Editar</button>' +
      '<button class="delete-btn admin-delete-btn" data-id="' + res.id + '">Excluir</button>' +
    '</div>';
  return item;
}

function renderAdminTab(){
  if(!isAdmin()) return;

  const filialFiltro = adminFiltroFilial.value;
  const carroFiltro = adminFiltroCarro.value;
  const dataFiltro = adminFiltroData.value;

  let list = getReservations();
  if(filialFiltro) list = list.filter(r => r.partida === filialFiltro);
  if(carroFiltro) list = list.filter(r => r.carro === carroFiltro);
  if(dataFiltro) list = list.filter(r => dataFiltro >= r.dataIda && dataFiltro <= r.dataVolta);

  const todas = getReservations();
  const totalReservas = todas.length;
  let vagasOcupadas = 0;
  todas.forEach(r => { vagasOcupadas += getOcupantes(r); });
  const vagasLivres = Math.max(0, (totalReservas * CAPACIDADE_MAXIMA) - vagasOcupadas);
  adminSummary.textContent = 'Total de reservas: ' + totalReservas + ' · Vagas ocupadas: ' + vagasOcupadas + ' · Vagas livres: ' + vagasLivres;

  if(list.length === 0){
    adminReservationsList.innerHTML = '<div class="empty-state">Nenhuma reserva encontrada.</div>';
    return;
  }

  adminReservationsList.innerHTML = '';
  list.slice().reverse().forEach(res => {
    adminReservationsList.appendChild(renderAdminReservationItem(res));
  });

  adminReservationsList.querySelectorAll('.admin-edit-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openAdminReservaModal(this.getAttribute('data-id'));
    });
  });
  adminReservationsList.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!confirm('Tem certeza que deseja excluir esta reserva?')) return;
      const id = this.getAttribute('data-id');
      const updated = getReservations().filter(r => String(r.id) !== String(id));
      saveReservations(updated);
      renderAdminTab();
      renderMyReservations();
      renderMainCalendar();
      renderAvailableRides();
      refreshDatePickers();
    });
  });
}

adminFiltroFilial.addEventListener('change', renderAdminTab);
adminFiltroCarro.addEventListener('change', renderAdminTab);
adminFiltroData.addEventListener('change', renderAdminTab);
