/* Painel administrativo e edição de reservas */
/* =========================================================
   Painel de Administração (aba "Admin", visível somente para isAdmin())
   ========================================================= */
const adminFiltroLocal = document.getElementById('adminFiltroLocal');
const adminFiltroCarro = document.getElementById('adminFiltroCarro');
const adminFiltroData = document.getElementById('adminFiltroData');
const adminFiltroComRegistro = document.getElementById('adminFiltroComRegistro');
const adminReservationsList = document.getElementById('adminReservationsList');
const adminNovaReservaBtn = document.getElementById('adminNovaReservaBtn');
const adminReservationViewButtons = document.querySelectorAll('[data-admin-reservation-view]');
const adminActiveReservationsCount = document.getElementById('adminActiveReservationsCount');
const adminCompletedReservationsCount = document.getElementById('adminCompletedReservationsCount');

const adminReservaModal = document.getElementById('adminReservaModal');
const adminReservaCloseBtn = document.getElementById('adminReservaCloseBtn');
const adminReservaTitle = document.getElementById('adminReservaTitle');
const adminReservaError = document.getElementById('adminReservaError');
const adminReservaForm = document.getElementById('adminReservaForm');
const aNomeInput = document.getElementById('aNome');
const aNomeFieldParent = aNomeInput.parentNode;
const aNomeFieldNextSibling = aNomeInput.nextSibling;
const aNomeAutocomplete = attachPersonAutocomplete(aNomeInput);
aNomeFieldParent.insertBefore(aNomeAutocomplete.element, aNomeFieldNextSibling);
const aPartidaSelect = document.getElementById('aPartida');
const aDestinoSelect = document.getElementById('aDestino');
const aDestinoOutroInput = document.getElementById('aDestinoOutro');
const aCarroSelect = document.getElementById('aCarro');
const aDataIdaInput = document.getElementById('aDataIda');
const aDataVoltaInput = document.getElementById('aDataVolta');
const aHorarioRetiradaSelect = document.getElementById('aHorarioRetirada');
const aHorarioDevolucaoSelect = document.getElementById('aHorarioDevolucao');
const aMotivoInput = document.getElementById('aMotivo');
const aRodizioWarning = document.getElementById('aRodizioWarning');
const aPassageirosWidget = createPassengerListWidget('aPassageirosListContainer');
const adminOcupantesPanel = document.getElementById('adminOcupantesPanel');
const aLegadoAvisoBox = document.getElementById('aLegadoAvisoBox');
const aLegadoAvisoTexto = document.getElementById('aLegadoAvisoTexto');
const aConverterLegadoBtn = document.getElementById('aConverterLegadoBtn');
const adminReservationBackBtn = document.getElementById('adminReservationBackBtn');
const adminReservationNextBtn = document.getElementById('adminReservationNextBtn');
const adminReservationStepLabel = document.getElementById('adminReservationStepLabel');
let aLegadoPendente = 0; // qtd de passageirosConfirmados (legado) ainda não convertidos nesta edição

let adminEditingId = null; // null = modo criação ("Nova reserva como admin")
let reservationEditMode = 'admin';
let adminMobileReservationStep = 1;
let adminReservationsView = 'active';

function refreshAdminRodizioWarning(){
  updateRodizioWarning(aRodizioWarning, {
    partida:aPartidaSelect.value,
    destino:getAdminDestinoValue(),
    carro:aCarroSelect.value,
    dataIda:aDataIdaInput.value,
    dataVolta:aDataVoltaInput.value,
    horarioRetirada:aHorarioRetiradaSelect.value,
    horarioDevolucao:aHorarioDevolucaoSelect.value
  });
}

[
  aPartidaSelect, aDestinoSelect, aDestinoOutroInput, aCarroSelect,
  aDataIdaInput, aDataVoltaInput, aHorarioRetiradaSelect, aHorarioDevolucaoSelect
].forEach(element => {
  element.addEventListener('input', refreshAdminRodizioWarning);
  element.addEventListener('change', refreshAdminRodizioWarning);
});

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
  const carros = getVehicles().filter(v => v.ativo !== false && v.local === partida);
  const currentCarro = aCarroSelect.value;
  aCarroSelect.innerHTML = '<option value="">Selecione...</option>' +
    carros.map(v => '<option value="' + escapeHTML(v.codigo) + '">' + escapeHTML(getVehicleFullModel(v)) + (v.placa ? ' · ' + escapeHTML(v.placa) : '') + '</option>').join('');
  if(carros.some(v => String(v.codigo) === String(currentCarro))){
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
  const field = document.getElementById('afield-' + fieldId) ||
    (fieldId === 'dataVolta' ? document.getElementById('afield-dataIda') : null);
  const errorEl = document.getElementById('error-a' + fieldId.charAt(0).toUpperCase() + fieldId.slice(1));
  if(field) field.classList.toggle('invalid', !!message);
  if(errorEl) errorEl.textContent = message || '';
}

function clearAdminFieldErrors(){
  ['Nome','Partida','Destino','Carro','DataIda','DataVolta','HorarioRetirada','HorarioDevolucao','PassageirosConfirmados','Motivo','Responsavel'].forEach(suffix => {
    const errorEl = document.getElementById('error-a' + suffix);
    if(errorEl) errorEl.textContent = '';
  });
  document.querySelectorAll('#adminReservaForm .field').forEach(f => f.classList.remove('invalid'));
  setAdminError('');
}

function showAdminMobileReservationStep(step, shouldScroll){
  adminMobileReservationStep = Math.max(1, Math.min(3, Number(step) || 1));
  adminReservaForm.setAttribute('data-mobile-step', String(adminMobileReservationStep));
  document.querySelectorAll('#adminReservationProgress [data-admin-progress-step]').forEach(item => {
    item.classList.toggle(
      'active',
      Number(item.getAttribute('data-admin-progress-step')) === adminMobileReservationStep
    );
  });
  adminReservationBackBtn.disabled = adminMobileReservationStep === 1;
  adminReservationStepLabel.textContent = 'Etapa ' + adminMobileReservationStep + ' de 3';
  if(shouldScroll && isMobileReservationWizard()){
    adminReservaModal.querySelector('.modal-card').scrollTo({ top:0, behavior:'smooth' });
  }
}

function validateAdminMobileReservationStep(step){
  if(step === 1){
    ['nome','partida','destino','carro'].forEach(id => setAdminFieldError(id, ''));
    let valid = true;
    const nome = aNomeInput.value.trim();
    const partida = aPartidaSelect.value;
    const destino = getAdminDestinoValue();
    if(!nome){ setAdminFieldError('nome', 'Informe o nome do responsável.'); valid = false; }
    if(!partida){ setAdminFieldError('partida', 'Selecione o local de partida.'); valid = false; }
    if(!destino){ setAdminFieldError('destino', 'Selecione ou informe o destino.'); valid = false; }
    if(destino && partida && destino === partida){
      setAdminFieldError('destino', 'O destino deve ser diferente da partida.');
      valid = false;
    }
    if(!aCarroSelect.value){ setAdminFieldError('carro', 'Selecione o veículo.'); valid = false; }
    return valid;
  }

  if(step === 2){
    ['dataIda','dataVolta','horarioRetirada','horarioDevolucao'].forEach(id => setAdminFieldError(id, ''));
    setAdminError('');
    let valid = true;
    const dataIda = aDataIdaInput.value;
    const dataVolta = aDataVoltaInput.value;
    const retirada = aHorarioRetiradaSelect.value;
    const devolucao = aHorarioDevolucaoSelect.value;
    if(!dataIda){ setAdminFieldError('dataIda', 'Informe a data de ida.'); valid = false; }
    if(!dataVolta){ setAdminFieldError('dataVolta', 'Informe a data de volta.'); valid = false; }
    if(!retirada){ setAdminFieldError('horarioRetirada', 'Selecione o horário de retirada.'); valid = false; }
    if(!devolucao){ setAdminFieldError('horarioDevolucao', 'Selecione o horário de devolução.'); valid = false; }
    if(dataIda && dataVolta && dataVolta < dataIda){
      setAdminFieldError('dataVolta', 'A data de volta deve ser igual ou posterior à data de ida.');
      valid = false;
    }
    if(dataIda && dataVolta && dataIda === dataVolta && retirada && devolucao && devolucao <= retirada){
      setAdminFieldError('horarioDevolucao', 'O horário de devolução deve ser após o horário de retirada.');
      valid = false;
    }
    if(dataIda && dataVolta){
      const ruleValidation = validateReservationRules(
        aNomeInput.value.trim(),
        dataIda,
        dataVolta,
        adminEditingId
      );
      if(!ruleValidation.ok){
        setAdminFieldError(ruleValidation.field, ruleValidation.message);
        valid = false;
      }
    }
    if(valid){
      const conflicts = findConflictingReservations(
        aPartidaSelect.value,
        aCarroSelect.value,
        dataIda,
        dataVolta,
        retirada,
        devolucao,
        adminEditingId
      );
      if(conflicts.length){
        setAdminError(reservationConflictPrefix() + buildConflictMessage(conflicts));
        valid = false;
      }
      const blocks = findVehicleBlocks(
        aPartidaSelect.value,
        aCarroSelect.value,
        dataIda,
        dataVolta,
        null
      );
      if(blocks.length){
        setAdminError('Veículo indisponível no período selecionado.');
        valid = false;
      }
    }
    return valid;
  }
  return true;
}

adminReservationBackBtn.addEventListener('click', function(){
  if(!isMobileReservationWizard()) return;
  showAdminMobileReservationStep(adminMobileReservationStep - 1, true);
});

adminReservationNextBtn.addEventListener('click', function(){
  if(!isMobileReservationWizard()) return;
  if(!validateAdminMobileReservationStep(adminMobileReservationStep)) return;
  showAdminMobileReservationStep(adminMobileReservationStep + 1, true);
});

showAdminMobileReservationStep(1, false);

// Renderiza o painel de ocupantes dentro do modal admin: somente leitura.
// A edição de passageiros (adicionar/remover/renomear) é feita exclusivamente
// pelo widget aPassageirosWidget e aplicada ao Salvar — única fonte de verdade,
// evitando divergência entre uma edição "imediata" e o estado em memória do form.
function renderAdminOcupantesPanel(reserva){
  if(!reserva){
    adminOcupantesPanel.innerHTML = '';
    return;
  }
  adminOcupantesPanel.innerHTML = renderOccupancyHTML(reserva);
}

// Abre o modal admin. Se reservaId for null, abre em modo criação (nome livre).
function openAdminReservaModal(reservaId, mode){
  adminEditingId = reservaId;
  reservationEditMode = mode || 'admin';
  if(reservationEditMode !== 'self' && !canManageReservations()) return;
  clearAdminFieldErrors();

  if(reservaId == null){
    adminReservaTitle.textContent = isAdmin() ? 'Nova reserva (como admin)' :
      (isFacilities() ? 'Nova reserva (Facilities)' : 'Nova reserva (gestão)');
    aNomeInput.value = '';
    aNomeInput.dataset.userId = '';
    aNomeAutocomplete.refresh();
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
    aMotivoInput.value = '';
    aPassageirosWidget.clear();
    aLegadoPendente = 0;
    aLegadoAvisoBox.classList.add('hidden');
    renderAdminOcupantesPanel(null);
  } else {
    const reserva = getReservations().find(r => String(r.id) === String(reservaId));
    if(!reserva) return;
    const currentUser = getCurrentUser();
    if(reservationEditMode === 'self' && (!currentUser || reserva.nome !== currentUser.nome || (reserva.operacao && reserva.operacao.retirada))) return;
    adminReservaTitle.textContent = reservationEditMode === 'self' ? 'Editar minha reserva' : 'Editar reserva';
    aNomeInput.value = reserva.nome;
    aNomeInput.dataset.userId = reserva.criadorUsuarioId || '';
    aNomeAutocomplete.refresh();
    aNomeInput.disabled = reservationEditMode === 'self';
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
    aMotivoInput.value = reserva.motivo || '';
    // Pré-preenche o widget com os passageiros nomeados atuais, exceto o criador
    // (que continua sem botão de remover — não faz parte da lista editável).
    const nomeadosSemCriador = getPassageiros(reserva).filter(p => p.nome !== reserva.nome);
    aPassageirosWidget.setPassengers(nomeadosSemCriador);
    aLegadoPendente = getPassageirosConfirmados(reserva);
    if(aLegadoPendente > 0){
      aLegadoAvisoTexto.textContent = 'Esta reserva tem ' + aLegadoPendente + (aLegadoPendente === 1 ? ' passageiro não identificado' : ' passageiros não identificados') + ' de um cadastro antigo';
      aLegadoAvisoBox.classList.remove('hidden');
    } else {
      aLegadoAvisoBox.classList.add('hidden');
    }
    renderAdminOcupantesPanel(reserva);
  }

  showAdminMobileReservationStep(1, false);
  syncAllTimePickerControls();
  refreshDatePickers();
  refreshAdminRodizioWarning();
  adminReservaModal.classList.remove('hidden');
}

function openSelfEditReservation(reservaId){
  openAdminReservaModal(reservaId, 'self');
}

function closeAdminReservaModal(){
  adminReservaModal.classList.add('hidden');
  adminEditingId = null;
  reservationEditMode = 'admin';
  showAdminMobileReservationStep(1, false);
}

adminReservaCloseBtn.addEventListener('click', closeAdminReservaModal);
adminReservaModal.addEventListener('click', function(e){
  if(e.target === adminReservaModal) closeAdminReservaModal();
});

adminNovaReservaBtn.addEventListener('click', function(){
  openAdminReservaModal(null, 'admin');
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

adminReservaForm.addEventListener('submit', async function(e){
  e.preventDefault();
  const currentUser = getCurrentUser();
  const editing = getReservations().find(r => String(r.id) === String(adminEditingId));
  const canSelfEdit = reservationEditMode === 'self' && editing && currentUser && editing.nome === currentUser.nome && !(editing.operacao && editing.operacao.retirada);
  if(!canManageReservations() && !canSelfEdit) return;

  clearAdminFieldErrors();

  const nome = aNomeInput.value.trim();
  const partida = aPartidaSelect.value;
  const destino = getAdminDestinoValue();
  const carro = aCarroSelect.value;
  const dataIda = aDataIdaInput.value;
  const dataVolta = aDataVoltaInput.value;
  const horarioRetirada = aHorarioRetiradaSelect.value;
  const horarioDevolucao = aHorarioDevolucaoSelect.value;
  const motivo = aMotivoInput.value.trim();
  const vehicle = getVehicle(partida, carro);
  const validacaoPassageiros = validarListaPassageiros(nome, aPassageirosWidget.getPassengers(), Math.max(0, Number(vehicle && vehicle.capacidade ? vehicle.capacidade : CAPACIDADE_MAXIMA) - 1));

  if(adminEditingId == null){
    const pendingReturn = getPendingReturnReservation({ nome:nome });
    if(pendingReturn){
      setAdminError(pendingReturnReservationMessage(pendingReturn));
      if(isMobileReservationWizard()) showAdminMobileReservationStep(1, true);
      return;
    }
  }

  let valid = true;
  if(!nome){ setAdminFieldError('nome', 'Informe o nome do responsável.'); valid = false; }
  if(!partida){ setAdminFieldError('partida', 'Selecione o local de partida.'); valid = false; }
  if(!destino){ setAdminFieldError('destino', 'Selecione ou informe o destino.'); valid = false; }
  if(destino && partida && destino === partida){ setAdminFieldError('destino', 'O destino deve ser diferente da partida.'); valid = false; }
  if(!carro){ setAdminFieldError('carro', 'Selecione o veículo.'); valid = false; }
  if(!dataIda){ setAdminFieldError('dataIda', 'Informe a data de ida.'); valid = false; }
  if(!dataVolta){ setAdminFieldError('dataVolta', 'Informe a data de volta.'); valid = false; }
  if(dataIda && dataVolta && dataVolta < dataIda){ setAdminFieldError('dataVolta', 'A data de volta deve ser igual ou posterior à data de ida.'); valid = false; }
  if(!horarioRetirada){ setAdminFieldError('horarioRetirada', 'Selecione o horário de retirada.'); valid = false; }
  if(!horarioDevolucao){ setAdminFieldError('horarioDevolucao', 'Selecione o horário de devolução.'); valid = false; }
  if(dataIda && horarioRetirada && isReservationPickupInPast(dataIda, horarioRetirada)){
    setAdminFieldError('horarioRetirada', 'Este horário já passou. Escolha um horário futuro.');
    valid = false;
  }
  if(dataIda && dataVolta && dataIda === dataVolta && horarioRetirada && horarioDevolucao && horarioDevolucao <= horarioRetirada){
    setAdminFieldError('horarioDevolucao', 'O horário de devolução deve ser após o horário de retirada.');
    valid = false;
  }
  if(nome && dataIda && dataVolta){
    const ruleValidation = validateReservationRules(nome, dataIda, dataVolta, adminEditingId);
    if(!ruleValidation.ok){
      setAdminFieldError(ruleValidation.field, ruleValidation.message);
      valid = false;
    }
  }
  if(nome && !validacaoPassageiros.ok){
    setAdminFieldError('passageirosConfirmados', validacaoPassageiros.message);
    valid = false;
  }

  if(!valid){
    if(isMobileReservationWizard()){
      const stepOneHasError = ['Nome','Partida','Destino','Carro'].some(suffix =>
        document.getElementById('error-a' + suffix).textContent
      );
      const stepTwoHasError = ['DataIda','DataVolta','HorarioRetirada','HorarioDevolucao'].some(suffix =>
        document.getElementById('error-a' + suffix).textContent
      );
      if(stepOneHasError) showAdminMobileReservationStep(1, true);
      else if(stepTwoHasError) showAdminMobileReservationStep(2, true);
    }
    return;
  }

  // Revalida conflito de horário com outras reservas do mesmo carro (exclui a própria reserva em edição).
  const conflitos = findConflictingReservations(partida, carro, dataIda, dataVolta, horarioRetirada, horarioDevolucao, adminEditingId);
  if(conflitos.length > 0){
    const msg = reservationConflictPrefix() + buildConflictMessage(conflitos);
    setAdminError(msg);
    if(isMobileReservationWizard()) showAdminMobileReservationStep(2, true);
    return;
  }
  const bloqueios = findVehicleBlocks(partida, carro, dataIda, dataVolta, null);
  if(bloqueios.length > 0){
    setAdminError('Veículo indisponível: ' + bloqueios.map(b => b.tipo + ' (' + formatDate(b.dataInicio) + ' a ' + formatDate(b.dataFim) + ')').join('; '));
    if(isMobileReservationWizard()) showAdminMobileReservationStep(2, true);
    return;
  }

  const list = getReservations();

  if(adminEditingId == null){
    const ownerAccount = findPassengerDirectoryUser(nome);
    const reserva = {
      id: Date.now(),
      criadorUsuarioId:ownerAccount ? String(ownerAccount.id) : undefined,
      nome: nome,
      email: '',
      partida: partida,
      destino: destino,
      carro: carro,
      dataIda: dataIda,
      dataVolta: dataVolta,
      horarioRetirada: horarioRetirada,
      horarioDevolucao: horarioDevolucao,
      motivo: motivo,
      status: 'confirmada',
      criadoEm: new Date().toISOString(),
      passageiros: [{ nome:nome, ...(ownerAccount ? { usuarioId:String(ownerAccount.id) } : {}) }].concat(validacaoPassageiros.passageiros),
      passageirosConfirmados: 0
    };
    list.push(reserva);
    try{
      await saveReservations(list);
    }catch(error){
      await hydrateDatabaseState();
      setAdminError(error.message);
      return;
    }
    Object.assign(reserva, getReservations().find(item => String(item.id) === String(reserva.id)) || {});
  } else {
    const idx = list.findIndex(r => String(r.id) === String(adminEditingId));
    if(idx === -1){ setAdminError('Reserva não encontrada.'); return; }
    const reserva = list[idx];
    const ownerAccount = findPassengerDirectoryUser(nome) || getPassengerDirectory().find(user =>
      String(user.id) === String(reserva.criadorUsuarioId || '')
    );
    reserva.nome = nome;
    if(ownerAccount) reserva.criadorUsuarioId = String(ownerAccount.id);
    reserva.partida = partida;
    reserva.destino = destino;
    reserva.carro = carro;
    reserva.dataIda = dataIda;
    reserva.dataVolta = dataVolta;
    reserva.horarioRetirada = horarioRetirada;
    reserva.horarioDevolucao = horarioDevolucao;
    reserva.motivo = motivo;
    delete reserva.responsavel;
    reserva.editadoEm = new Date().toISOString();
    // O widget é a única fonte de verdade dos passageiros no modal admin: o que
    // estiver nele no momento de Salvar substitui a lista anterior por completo
    // (evita ressurreição/duplicação em relação a edições feitas em outra aba).
    reserva.passageiros = [{
      nome:nome,
      ...(ownerAccount ? { usuarioId:String(ownerAccount.id) } : {})
    }].concat(validacaoPassageiros.passageiros);
    reserva.passageirosConfirmados = aLegadoPendente;
    list[idx] = reserva;
    try{
      await saveReservations(list);
    }catch(error){
      await hydrateDatabaseState();
      setAdminError(error.message);
      return;
    }
  }

  closeAdminReservaModal();
  renderAdminTab();
  renderMyReservations();
  renderMainCalendar();
  renderAvailableRides();
  refreshDatePickers();
});

function populateAdminFilters(){
  const locais = CIDADES;
  adminFiltroLocal.innerHTML = '<option value="">Todas</option>' +
    locais.map(f => '<option value="' + escapeHTML(f) + '">' + escapeHTML(f) + '</option>').join('');
  const todosCarros = [];
  locais.forEach(f => (CARROS_POR_LOCAL[f] || []).forEach(c => {
    if(!todosCarros.some(item => String(item.codigo) === String(c))){
      todosCarros.push({ local:f, codigo:c });
    }
  }));
  adminFiltroCarro.innerHTML = '<option value="">Todos</option>' +
    todosCarros.map(item => '<option value="' + escapeHTML(item.codigo) + '">' +
      escapeHTML(getVehicleDisplayName({ partida:item.local, carro:item.codigo })) + '</option>').join('');
}
populateAdminFilters();

function renderAdminReservationItem(res){
  const ocupantes = getOcupantes(res);
  const capacidade = getVehicleCapacity(res);
  const completed = isReservationCompleted(res);
  const operacao = res.operacao || {};
  const statusClass = completed
    ? 'status-completed'
    : (operacao.retirada ? 'status-in-use' : 'status-waiting');
  const administrativelyClosed = normalizeReservationStatus(res.status) === 'encerrada_administrativamente';
  const statusLabel = administrativelyClosed
    ? 'Encerrada pela gestão'
    : completed
    ? 'Concluída'
    : (operacao.retirada ? 'Em uso' : 'Confirmada');
  const item = document.createElement('div');
  item.className = 'reservation-item' + (completed ? ' reservation-history-item' : '');
  item.innerHTML =
    '<div class="reservation-info">' +
      '<div class="reservation-card-top">' +
        '<div>' +
          '<div class="reservation-route">' + renderReservationNumber(res) + escapeHTML(res.partida) + ' &rarr; ' + escapeHTML(res.destino) + '</div>' +
          '<div class="reservation-vehicle">' + getVehicleDisplayHTML(res) + '</div>' +
        '</div>' +
        '<span class="reservation-card-badges">' +
          '<span class="operation-status ' + statusClass + '">' + statusLabel + '</span>' +
          (reservationHasOperationReport(res)
            ? '<span class="operation-report-badge" title="Avarias ou fotos registradas">⚠️ Avaria/foto</span>'
            : '') +
        '</span>' +
      '</div>' +
      '<div class="reservation-details reservation-period">' + renderReservationPeriod(res) + '</div>' +
      '<div class="reservation-name">Solicitante: ' + escapeHtml(res.nome) + '</div>' +
      '<div class="reservation-business">' + escapeHTML(res.motivo || 'Motivo não informado') + '</div>' +
      renderOccupancyHTML(res) +
      renderOperationDetails(res) +
    '</div>' +
    '<div class="reservation-actions">' +
      (!completed && !operacao.retirada ? '<button type="button" class="edit-btn admin-edit-btn" data-id="' + escapeHTML(res.id) + '">Editar</button>' : '') +
      (!completed && operacao.retirada && !operacao.devolucao ? '<button type="button" class="delete-btn admin-force-close-btn" data-id="' + escapeHTML(res.id) + '">Encerrar administrativamente</button>' : '') +
      (!completed && !operacao.retirada ? '<button class="delete-btn admin-delete-btn" data-id="' + escapeHTML(res.id) + '">Cancelar</button>' : '') +
    '</div>';
  return item;
}

function renderAdminTab(){
  if(!canManageReservations()) return;

  const localFiltro = adminFiltroLocal.value;
  const carroFiltro = adminFiltroCarro.value;
  const dataFiltro = adminFiltroData.value;

  let list = getReservations();
  if(localFiltro) list = list.filter(r => r.partida === localFiltro);
  if(carroFiltro) list = list.filter(r => r.carro === carroFiltro);
  if(dataFiltro) list = list.filter(r => dataFiltro >= r.dataIda && dataFiltro <= r.dataVolta);
  if(adminFiltroComRegistro.checked) list = list.filter(reservationHasOperationReport);

  const activeList = list.filter(r => !isReservationCompleted(r));
  const completedList = list.filter(isReservationCompleted);
  adminActiveReservationsCount.textContent = String(activeList.length);
  adminCompletedReservationsCount.textContent = String(completedList.length);
  adminReservationViewButtons.forEach(button => {
    button.classList.toggle(
      'active',
      button.getAttribute('data-admin-reservation-view') === adminReservationsView
    );
  });
  list = adminReservationsView === 'completed' ? completedList : activeList;

  if(list.length === 0){
    adminReservationsList.innerHTML = '<div class="empty-state">' +
      (adminReservationsView === 'completed'
        ? 'Nenhuma reserva concluída encontrada.'
        : 'Nenhuma reserva ativa encontrada.') +
      '</div>';
    return;
  }

  adminReservationsList.innerHTML = '';
  list.slice().sort((a, b) => {
    const aDate = String(a.dataIda || '') + 'T' + String(a.horarioRetirada || '');
    const bDate = String(b.dataIda || '') + 'T' + String(b.horarioRetirada || '');
    return adminReservationsView === 'completed'
      ? bDate.localeCompare(aDate)
      : aDate.localeCompare(bDate);
  }).forEach(res => {
    adminReservationsList.appendChild(renderAdminReservationItem(res));
  });

adminReservationsList.querySelectorAll('.admin-edit-btn').forEach(btn => {
    btn.addEventListener('click', async function(){
      if(!canManageReservations()) return;
      openAdminReservaModal(this.getAttribute('data-id'));
    });
  });
  adminReservationsList.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', async function(){
      if(!canManageReservations()) return;
      if(!await showSiteConfirm('Tem certeza que deseja cancelar esta reserva?', {
        title:'Cancelar reserva',
        confirmText:'Sim, cancelar',
        type:'danger'
      })) return;
      const id = this.getAttribute('data-id');
      const updated = getReservations().filter(r => String(r.id) !== String(id));
      try{
        await saveReservations(updated);
      }catch(error){
        await hydrateDatabaseState();
        await showSiteAlert(error.message, {
          title:'Não foi possível cancelar',
          type:'danger'
        });
        renderAdminTab();
        return;
      }
      renderAdminTab();
      renderMyReservations();
      renderMainCalendar();
      renderAvailableRides();
      refreshDatePickers();
    });
  });
  adminReservationsList.querySelectorAll('.admin-force-close-btn').forEach(btn => {
    btn.addEventListener('click', async function(){
      if(!canManageReservations()) return;
      const id = this.getAttribute('data-id');
      const justification = await showSitePrompt(
        'Explique por que esta reserva em uso precisa ser encerrada sem uma devolução registrada.',
        {
          title:'Encerrar reserva em uso',
          confirmText:'Encerrar reserva',
          inputPlaceholder:'Justificativa obrigatória',
          type:'danger'
        }
      );
      if(justification === null) return;
      if(justification.trim().length < 5){
        await showSiteAlert('Informe uma justificativa com pelo menos 5 caracteres.', {
          title:'Justificativa obrigatória',
          type:'warning'
        });
        return;
      }
      const list = getReservations();
      const reservation = list.find(item => String(item.id) === String(id));
      const currentUser = getCurrentUser();
      if(!reservation || !reservation.operacao || !reservation.operacao.retirada || reservation.operacao.devolucao){
        await showSiteAlert('Esta reserva já foi atualizada. Recarregue os dados e tente novamente.', {
          title:'Reserva indisponível',
          type:'warning'
        });
        return;
      }
      reservation.status = 'encerrada_administrativamente';
      reservation.encerramentoAdministrativo = {
        justificativa:justification.trim(),
        registradoPor:currentUser ? currentUser.nome : 'Gestão',
        registradoPorUsuarioId:currentUser ? currentUser.id : '',
        registradoEm:new Date().toISOString()
      };
      try{
        await saveReservations(list);
      }catch(error){
        await hydrateDatabaseState();
        await showSiteAlert(error.message, {
          title:'Não foi possível encerrar a reserva',
          type:'danger'
        });
        renderAdminTab();
        return;
      }
      adminReservationsView = 'completed';
      renderAdminTab();
      renderMyReservations();
      renderMainCalendar();
      renderAvailableRides();
      refreshDatePickers();
    });
  });
}

adminFiltroLocal.addEventListener('change', renderAdminTab);
adminFiltroCarro.addEventListener('change', renderAdminTab);
adminFiltroData.addEventListener('change', renderAdminTab);
adminFiltroComRegistro.addEventListener('change', renderAdminTab);
adminReservationViewButtons.forEach(button => {
  button.addEventListener('click', function(){
    adminReservationsView = this.getAttribute('data-admin-reservation-view') === 'completed'
      ? 'completed'
      : 'active';
    renderAdminTab();
  });
});
