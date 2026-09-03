/* Gestão — locais e veículos */

/* =========================================================
   Locais e veículos
   ========================================================= */
const branchForm = document.getElementById('branchForm');
const branchNameInput = document.getElementById('branchName');
const branchesList = document.getElementById('branchesList');
const vehicleForm = document.getElementById('vehicleForm');
const vehicleBranchSelect = document.getElementById('vehicleBranch');
const vehiclePlateInput = document.getElementById('vehiclePlate');
const vehicleBrandInput = document.getElementById('vehicleBrand');
const vehicleModelInput = document.getElementById('vehicleModel');
const vehicleCapacityInput = document.getElementById('vehicleCapacity');
const vehicleTypeSelect = document.getElementById('vehicleType');
const vehicleRentedInput = document.getElementById('vehicleRented');
const vehicleCostCenterInput = document.getElementById('vehicleCostCenter');
const vehiclesList = document.getElementById('vehiclesList');
const fleetEditModal = document.getElementById('fleetEditModal');
const fleetEditForm = document.getElementById('fleetEditForm');
const fleetEditTitle = document.getElementById('fleetEditTitle');
const fleetEditSubtitle = document.getElementById('fleetEditSubtitle');
const fleetEditBranchFields = document.getElementById('fleetEditBranchFields');
const fleetEditVehicleFields = document.getElementById('fleetEditVehicleFields');
const fleetEditBranchNameInput = document.getElementById('fleetEditBranchName');
const fleetEditVehicleBranchSelect = document.getElementById('fleetEditVehicleBranch');
const fleetEditVehiclePlateInput = document.getElementById('fleetEditVehiclePlate');
const fleetEditVehicleBrandInput = document.getElementById('fleetEditVehicleBrand');
const fleetEditVehicleModelInput = document.getElementById('fleetEditVehicleModel');
const fleetEditVehicleCapacityInput = document.getElementById('fleetEditVehicleCapacity');
const fleetEditVehicleTypeSelect = document.getElementById('fleetEditVehicleType');
const fleetEditVehicleCostCenterInput = document.getElementById('fleetEditVehicleCostCenter');
const fleetEditVehicleRentedInput = document.getElementById('fleetEditVehicleRented');
const fleetEditError = document.getElementById('fleetEditError');
const vehicleDeleteModal = document.getElementById('vehicleDeleteModal');
const vehicleDeleteForm = document.getElementById('vehicleDeleteForm');
const vehicleDeleteSummary = document.getElementById('vehicleDeleteSummary');
const vehicleDeleteJustification = document.getElementById('vehicleDeleteJustification');
const vehicleDeleteError = document.getElementById('vehicleDeleteError');
const vehicleDeleteSubmitBtn = document.getElementById('vehicleDeleteSubmitBtn');
const branchDeleteModal = document.getElementById('branchDeleteModal');
const branchDeleteForm = document.getElementById('branchDeleteForm');
const branchDeleteSummary = document.getElementById('branchDeleteSummary');
const branchDeleteJustification = document.getElementById('branchDeleteJustification');
const branchDeleteError = document.getElementById('branchDeleteError');
const branchDeleteSubmitBtn = document.getElementById('branchDeleteSubmitBtn');
let fleetEditType = null;
let fleetEditId = null;
let vehicleDeleteId = null;
let branchDeleteId = null;

// O teto de capacidade depende do tipo (ver SEAT_LAYOUTS em js/seat-map.js -
// o mapa de lugares não desenha nada além disso). Ajusta o max do campo e
// reduz o valor já digitado se ele passar do novo teto.
if(vehicleTypeSelect && vehicleCapacityInput){
  vehicleCapacityInput.max = String(seatLayoutFor(vehicleTypeSelect.value).capacidadeMaxima);
  vehicleTypeSelect.addEventListener('change', function(){
    const capacidadeMaxima = seatLayoutFor(vehicleTypeSelect.value).capacidadeMaxima;
    vehicleCapacityInput.max = String(capacidadeMaxima);
    if(Number(vehicleCapacityInput.value) > capacidadeMaxima){
      vehicleCapacityInput.value = String(capacidadeMaxima);
    }
  });
}

function closeFleetEditModal(){
  fleetEditModal.classList.add('hidden');
  fleetEditForm.reset();
  fleetEditError.textContent = '';
  fleetEditType = null;
  fleetEditId = null;
}

function openBranchEditModal(branchId){
  if(!canManageBranches()) return;
  const branch = getBranches().find(item => String(item.id) === String(branchId));
  if(!branch) return;
  fleetEditType = 'branch';
  fleetEditId = branch.id;
  fleetEditForm.reset();
  fleetEditTitle.textContent = 'Editar local';
  fleetEditSubtitle.textContent = 'A alteração será aplicada aos veículos, bloqueios e reservas vinculados.';
  fleetEditBranchFields.classList.remove('hidden');
  fleetEditVehicleFields.classList.add('hidden');
  fleetEditBranchNameInput.value = branch.nome;
  fleetEditError.textContent = '';
  fleetEditModal.classList.remove('hidden');
  fleetEditBranchNameInput.focus();
}

function openVehicleEditModal(vehicleId){
  if(!canManageFleet()) return;
  const vehicle = getVehicles().find(item => String(item.id) === String(vehicleId));
  if(!vehicle) return;
  fleetEditType = 'vehicle';
  fleetEditId = vehicle.id;
  fleetEditForm.reset();
  fleetEditTitle.textContent = 'Editar veículo';
  fleetEditBranchFields.classList.add('hidden');
  fleetEditVehicleFields.classList.remove('hidden');
  fleetEditVehicleBranchSelect.innerHTML = getBranches().map(branch =>
    '<option value="' + escapeHTML(branch.nome) + '">' + escapeHTML(branch.nome) +
      (branch.ativo === false ? ' (inativa)' : '') + '</option>'
  ).join('');
  fleetEditVehicleBranchSelect.value = vehicle.local;
  fleetEditVehiclePlateInput.value = vehicle.placa || '';
  fleetEditVehicleBrandInput.value = getVehicleBrand(vehicle);
  fleetEditVehicleModelInput.value = getVehicleModelName(vehicle);
  fleetEditVehicleCapacityInput.max = String(seatLayoutFor(vehicle.tipo).capacidadeMaxima);
  fleetEditVehicleCapacityInput.value = vehicle.capacidade || CAPACIDADE_MAXIMA;
  fleetEditVehicleTypeSelect.value = vehicle.tipo || 'carro';
  fleetEditVehicleCostCenterInput.value = vehicle.centroCusto || '';
  fleetEditVehicleRentedInput.checked = !!vehicle.alugado;
  fleetEditError.textContent = '';
  fleetEditModal.classList.remove('hidden');
  fleetEditVehiclePlateInput.focus();
}

// Mesmo ajuste de teto de capacidade ao trocar o tipo que o formulário de
// cadastro já faz (ver topo do arquivo) - só que aqui reage ao <select> do
// modal de edição.
fleetEditVehicleTypeSelect.addEventListener('change', function(){
  const capacidadeMaxima = seatLayoutFor(fleetEditVehicleTypeSelect.value).capacidadeMaxima;
  fleetEditVehicleCapacityInput.max = String(capacidadeMaxima);
  if(Number(fleetEditVehicleCapacityInput.value) > capacidadeMaxima){
    fleetEditVehicleCapacityInput.value = String(capacidadeMaxima);
  }
});

function closeVehicleDeleteModal(){
  vehicleDeleteModal.classList.add('hidden');
  vehicleDeleteForm.reset();
  vehicleDeleteError.textContent = '';
  vehicleDeleteSubmitBtn.disabled = false;
  vehicleDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  vehicleDeleteId = null;
}

function openVehicleDeleteModal(vehicleId){
  if(!canManageFleet()) return;
  const vehicle = getVehicles().find(item => String(item.id) === String(vehicleId));
  if(!vehicle) return;
  vehicleDeleteId = vehicle.id;
  vehicleDeleteForm.reset();
  vehicleDeleteError.textContent = '';
  vehicleDeleteSummary.innerHTML =
    '<strong>' + escapeHTML(getVehicleFullModel(vehicle)) +
      (vehicle.placa ? '<br>' + plateBadgeHTML(vehicle.placa) : '') + '</strong>' +
    '<small>' + escapeHTML(vehicle.local) + '</small>';
  vehicleDeleteModal.classList.remove('hidden');
  vehicleDeleteJustification.focus();
}

function closeBranchDeleteModal(){
  branchDeleteModal.classList.add('hidden');
  branchDeleteForm.reset();
  branchDeleteError.textContent = '';
  branchDeleteSubmitBtn.disabled = false;
  branchDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  branchDeleteId = null;
}

function openBranchDeleteModal(branchId){
  if(!canManageBranches()) return;
  const branch = getBranches().find(item => String(item.id) === String(branchId));
  if(!branch) return;
  branchDeleteId = branch.id;
  branchDeleteForm.reset();
  branchDeleteError.textContent = '';
  const linkedVehicles = getVehicles().filter(vehicle => vehicle.local === branch.nome).length;
  branchDeleteSummary.innerHTML = '<strong>' + escapeHTML(branch.nome) + '</strong>' +
    '<small>' + linkedVehicles + (linkedVehicles === 1 ? ' veículo vinculado' : ' veículos vinculados') + '</small>';
  branchDeleteModal.classList.remove('hidden');
  branchDeleteJustification.focus();
}

document.getElementById('fleetEditCloseBtn').addEventListener('click', closeFleetEditModal);
document.getElementById('fleetEditCancelBtn').addEventListener('click', closeFleetEditModal);
fleetEditModal.addEventListener('click', function(e){
  if(e.target === fleetEditModal) closeFleetEditModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !fleetEditModal.classList.contains('hidden')) closeFleetEditModal();
});
fleetEditVehiclePlateInput.addEventListener('input', function(){
  this.value = this.value.toUpperCase();
});
document.getElementById('branchDeleteCloseBtn').addEventListener('click', closeBranchDeleteModal);
document.getElementById('branchDeleteCancelBtn').addEventListener('click', closeBranchDeleteModal);
branchDeleteModal.addEventListener('click', function(e){
  if(e.target === branchDeleteModal) closeBranchDeleteModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !branchDeleteModal.classList.contains('hidden')){
    closeBranchDeleteModal();
  }
});

branchDeleteForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageBranches() || !branchDeleteId) return;
  const justification = branchDeleteJustification.value.trim();
  branchDeleteError.textContent = '';
  if(justification.length < 5){
    branchDeleteError.textContent = 'Informe uma justificativa com pelo menos 5 caracteres.';
    branchDeleteJustification.focus();
    return;
  }
  branchDeleteSubmitBtn.disabled = true;
  branchDeleteSubmitBtn.textContent = 'Excluindo...';
  try{
    await deleteBranchPermanently(branchDeleteId, justification);
    await hydrateDatabaseState();
    closeBranchDeleteModal();
    renderBranchManagement();
    renderCarSelector();
    renderMainCalendar();
    renderMyReservations();
    renderAvailableRides();
    renderBlocksManagement();
    refreshDatePickers();
  }catch(error){
    if(error.code === 'STATE_CONFLICT') await hydrateDatabaseState();
    branchDeleteError.textContent = error.message;
    branchDeleteSubmitBtn.disabled = false;
    branchDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  }
});
vehiclePlateInput.addEventListener('input', function(){
  this.value = this.value.toUpperCase();
});
document.getElementById('vehicleDeleteCloseBtn').addEventListener('click', closeVehicleDeleteModal);
document.getElementById('vehicleDeleteCancelBtn').addEventListener('click', closeVehicleDeleteModal);
vehicleDeleteModal.addEventListener('click', function(e){
  if(e.target === vehicleDeleteModal) closeVehicleDeleteModal();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !vehicleDeleteModal.classList.contains('hidden')){
    closeVehicleDeleteModal();
  }
});

vehicleDeleteForm.addEventListener('submit', async function(e){
  e.preventDefault();
  if(!canManageFleet() || !vehicleDeleteId) return;
  const justification = vehicleDeleteJustification.value.trim();
  vehicleDeleteError.textContent = '';
  if(justification.length < 5){
    vehicleDeleteError.textContent = 'Informe uma justificativa com pelo menos 5 caracteres.';
    vehicleDeleteJustification.focus();
    return;
  }
  vehicleDeleteSubmitBtn.disabled = true;
  vehicleDeleteSubmitBtn.textContent = 'Excluindo...';
  try{
    await deleteVehiclePermanently(vehicleDeleteId, justification);
    await hydrateDatabaseState();
    closeVehicleDeleteModal();
    renderFleetManagement();
    renderCarSelector();
    renderMainCalendar();
    renderMyReservations();
    renderAvailableRides();
    renderBlocksManagement();
    refreshDatePickers();
  }catch(error){
    if(error.code === 'STATE_CONFLICT') await hydrateDatabaseState();
    vehicleDeleteError.textContent = error.message;
    vehicleDeleteSubmitBtn.disabled = false;
    vehicleDeleteSubmitBtn.textContent = 'Excluir definitivamente';
  }
});

fleetEditForm.addEventListener('submit', function(e){
  e.preventDefault();
  if(!fleetEditType || !fleetEditId) return;
  if(fleetEditType === 'branch' ? !canManageBranches() : !canManageFleet()) return;
  fleetEditError.textContent = '';

  if(fleetEditType === 'branch'){
    const list = getBranches();
    const branch = list.find(item => String(item.id) === String(fleetEditId));
    const newName = fleetEditBranchNameInput.value.trim();
    if(!branch || !newName){
      fleetEditError.textContent = 'Informe o nome do local.';
      return;
    }
    if(list.some(item => item.id !== branch.id && item.nome.toLowerCase() === newName.toLowerCase())){
      fleetEditError.textContent = 'Já existe um local com esse nome.';
      return;
    }
    const oldName = branch.nome;
    if(newName === oldName){
      closeFleetEditModal();
      return;
    }
    branch.nome = newName;
    saveBranches(list);
    const vehiclesUpdated = getVehicles();
    vehiclesUpdated.forEach(vehicle => { if(vehicle.local === oldName) vehicle.local = newName; });
    saveVehicles(vehiclesUpdated);
    const blocksUpdated = getVehicleBlocks();
    blocksUpdated.forEach(block => { if(block.local === oldName) block.local = newName; });
    saveVehicleBlocks(blocksUpdated);
    const reservationsUpdated = getReservations();
    reservationsUpdated.forEach(reservation => {
      if(reservation.partida === oldName) reservation.partida = newName;
      if(reservation.destino === oldName) reservation.destino = newName;
    });
    saveReservations(reservationsUpdated);
    logAudit('editou', 'local', branch.id, oldName + ' → ' + newName);
  } else {
    const list = getVehicles();
    const vehicle = list.find(item => String(item.id) === String(fleetEditId));
    const local = fleetEditVehicleBranchSelect.value;
    const marca = fleetEditVehicleBrandInput.value.trim();
    const modelo = fleetEditVehicleModelInput.value.trim();
    const placa = fleetEditVehiclePlateInput.value.trim().toUpperCase();
    const capacidade = Number(fleetEditVehicleCapacityInput.value);
    const tipo = fleetEditVehicleTypeSelect.value;
    const alugado = fleetEditVehicleRentedInput.checked;
    const centroCusto = fleetEditVehicleCostCenterInput.value.trim();
    const capacidadeMaxima = seatLayoutFor(tipo).capacidadeMaxima;
    if(!vehicle || !local || !placa || !marca || !modelo || !Number.isInteger(capacidade) || capacidade < 1 || capacidade > capacidadeMaxima){
      fleetEditError.textContent = 'Preencha local, placa, marca, modelo e uma capacidade entre 1 e ' + capacidadeMaxima + '.';
      return;
    }
    if(list.some(item =>
      item.id !== vehicle.id && String(item.placa || '').toUpperCase() === placa
    )){
      fleetEditError.textContent = 'Já existe um veículo com essa placa.';
      return;
    }
    const oldLocal = vehicle.local;
    const oldCode = String(vehicle.codigo);
    vehicle.local = local;
    vehicle.marca = marca;
    vehicle.modelo = modelo;
    vehicle.placa = placa;
    vehicle.capacidade = capacidade;
    vehicle.tipo = tipo;
    vehicle.alugado = alugado;
    vehicle.centroCusto = centroCusto;
    saveVehicles(list);
    if(oldLocal !== local){
      const blocksUpdated = getVehicleBlocks();
      blocksUpdated.forEach(block => {
        if(block.local === oldLocal && String(block.carro) === oldCode){
          block.local = local;
        }
      });
      saveVehicleBlocks(blocksUpdated);
      const reservationsUpdated = getReservations();
      reservationsUpdated.forEach(reservation => {
        if(reservation.partida === oldLocal && String(reservation.carro) === oldCode){
          reservation.partida = local;
        }
      });
      saveReservations(reservationsUpdated);
    }
    logAudit('editou', 'veículo', vehicle.id,
      oldLocal + ' → ' + local + ' · ' + marca + ' ' + modelo + ' · ' + placa);
  }

  const editedType = fleetEditType;
  closeFleetEditModal();
  if(editedType === 'branch') renderBranchManagement();
  else renderFleetManagement();
  renderCarSelector();
  renderMainCalendar();
  renderMyReservations();
  renderAvailableRides();
  refreshDatePickers();
});

function refreshBranchSelectors(){
  syncFleetGlobals();
  const branches = getBranches().filter(f => f.ativo !== false);
  const options = branches.map(f => '<option value="' + escapeHTML(f.nome) + '">' + escapeHTML(f.nome) + '</option>').join('');

  [vehicleBranchSelect].forEach(select => {
    if(!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecione...</option>' + options;
    if(branches.some(f => f.nome === current)) select.value = current;
  });

  [
    { el: document.getElementById('partida'), first: '<option value="">Selecione...</option>' },
    { el: document.getElementById('aPartida'), first: '<option value="">Selecione...</option>' },
    { el: document.getElementById('adminFiltroLocal'), first: '<option value="">Todas</option>' },
    { el: document.getElementById('reportBranch'), first: '<option value="">Todas</option>' }
  ].forEach(item => {
    if(!item.el) return;
    const current = item.el.value;
    item.el.innerHTML = item.first + options;
    if(branches.some(f => f.nome === current)) item.el.value = current;
  });

  if(typeof populateDestinoOptions === 'function') populateDestinoOptions();
  if(typeof populateAdminDestinoOptions === 'function') populateAdminDestinoOptions();
  if(typeof populateAdminFilters === 'function') populateAdminFilters();
  populateManagementVehicleSelectors();
}

function populateManagementVehicleSelectors(){
  const vehicles = getVehicles().filter(v => v.ativo !== false);
  const vehicleOptions = vehicles.map(v =>
    '<option value="' + escapeHTML(v.local + '|' + v.codigo) + '">' +
      escapeHTML(v.local + ' · ' + getVehicleFullModel(v) + (v.placa ? ' · ' + v.placa : '')) +
    '</option>'
  ).join('');
  const blockVehicle = document.getElementById('blockVehicle');
  if(blockVehicle){
    const current = blockVehicle.value;
    blockVehicle.innerHTML = '<option value="">Selecione...</option>' + vehicleOptions;
    blockVehicle.value = current;
  }

  const reportVehicle = document.getElementById('reportVehicle');
  if(reportVehicle){
    const current = reportVehicle.value;
    reportVehicle.innerHTML = '<option value="">Todos</option>' + vehicleOptions;
    reportVehicle.value = current;
  }
}

function renderBranchManagement(){
  if(!canManageBranches()) return;
  refreshBranchSelectors();
  const branches = getBranches();
  branchesList.innerHTML = branches.length ? branches.map(branch =>
    '<div class="management-item' + (branch.ativo === false ? ' is-inactive' : '') + '">' +
      '<div><strong>' + escapeHTML(branch.nome) + '</strong><small>' + (branch.ativo === false ? 'Inativa' : 'Ativa') + '</small></div>' +
      '<div class="management-actions"><button type="button" class="secondary-btn branch-edit-btn" data-id="' + escapeHTML(branch.id) + '">Editar</button>' +
      '<button type="button" class="secondary-btn branch-toggle-btn" data-id="' + escapeHTML(branch.id) + '">' + (branch.ativo === false ? 'Ativar' : 'Desativar') + '</button>' +
      '<button type="button" class="delete-btn branch-delete-btn" data-id="' + escapeHTML(branch.id) + '">Excluir</button></div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum local cadastrado.</div>';

  branchesList.querySelectorAll('.branch-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageBranches()) return;
      const list = getBranches();
      const branch = list.find(f => String(f.id) === String(this.getAttribute('data-id')));
      if(!branch) return;
      branch.ativo = branch.ativo === false;
      saveBranches(list);
      logAudit(branch.ativo ? 'ativou' : 'desativou', 'local', branch.id, branch.nome);
      renderBranchManagement();
    });
  });

  branchesList.querySelectorAll('.branch-edit-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openBranchEditModal(this.getAttribute('data-id'));
    });
  });

  branchesList.querySelectorAll('.branch-delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openBranchDeleteModal(this.getAttribute('data-id'));
    });
  });
}

function renderFleetManagement(){
  if(!canManageFleet()) return;
  refreshBranchSelectors();
  const vehicles = getVehicles();
  vehiclesList.innerHTML = vehicles.length ? vehicles.map(vehicle =>
    '<div class="management-item' + (vehicle.ativo === false ? ' is-inactive' : '') + '">' +
      '<div><strong>' + escapeHTML(getVehicleFullModel(vehicle)) +
        (vehicle.placa ? '<br>' + plateBadgeHTML(vehicle.placa) : '') + '</strong>' +
      '<small>' + escapeHTML(vehicle.local) + ' · ' + Number(vehicle.capacidade || CAPACIDADE_MAXIMA) + ' lugares · ' + (vehicle.ativo === false ? 'Inativo' : 'Ativo') + '</small></div>' +
      '<div class="management-actions"><button type="button" class="secondary-btn vehicle-edit-btn" data-id="' + escapeHTML(vehicle.id) + '">Editar</button>' +
      '<button type="button" class="secondary-btn vehicle-toggle-btn" data-id="' + escapeHTML(vehicle.id) + '">' + (vehicle.ativo === false ? 'Ativar' : 'Desativar') + '</button>' +
      '<button type="button" class="delete-btn vehicle-delete-btn" data-id="' + escapeHTML(vehicle.id) + '">Excluir</button></div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum veículo cadastrado.</div>';

  vehiclesList.querySelectorAll('.vehicle-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageFleet()) return;
      const list = getVehicles();
      const vehicle = list.find(v => String(v.id) === String(this.getAttribute('data-id')));
      if(!vehicle) return;
      vehicle.ativo = vehicle.ativo === false;
      saveVehicles(list);
      logAudit(vehicle.ativo ? 'ativou' : 'desativou', 'veículo', vehicle.id,
        vehicle.local + ' · ' + getVehicleFullModel(vehicle) +
        (vehicle.placa ? ' · ' + vehicle.placa : ''));
      renderFleetManagement();
      renderCarSelector();
      renderMainCalendar();
    });
  });

  vehiclesList.querySelectorAll('.vehicle-edit-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openVehicleEditModal(this.getAttribute('data-id'));
    });
  });

  vehiclesList.querySelectorAll('.vehicle-delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      openVehicleDeleteModal(this.getAttribute('data-id'));
    });
  });
}

if(branchForm){
  branchForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageBranches()) return;
    const nome = branchNameInput.value.trim();
    if(!nome) return;
    const list = getBranches();
    if(list.some(f => f.nome.toLowerCase() === nome.toLowerCase())){
      await showSiteAlert('Já existe um local com esse nome.', {
        title:'Local não cadastrado',
        type:'warning'
      });
      return;
    }
    const branch = { id: 'local-' + Date.now(), nome: nome, ativo: true };
    list.push(branch);
    try{
      await saveBranches(list);
    }catch(error){
      await hydrateDatabaseState();
      await showSiteAlert(error.message, {
        title:'Não foi possível cadastrar o local',
        type:'danger'
      });
      renderBranchManagement();
      return;
    }
    logAudit('cadastrou', 'local', branch.id, nome);
    branchForm.reset();
    renderBranchManagement();
  });
}

if(vehicleForm){
  vehicleForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageFleet()) return;
    const local = vehicleBranchSelect.value;
    const placa = vehiclePlateInput.value.trim().toUpperCase();
    const marca = vehicleBrandInput.value.trim();
    const modelo = vehicleModelInput.value.trim();
    const capacidade = Number(vehicleCapacityInput.value);
    const tipoSelecionado = vehicleTypeSelect ? vehicleTypeSelect.value : 'carro';
    const capacidadeMaxima = seatLayoutFor(tipoSelecionado).capacidadeMaxima;
    if(!local || !placa || !marca || !modelo || !Number.isInteger(capacidade) || capacidade < 1 || capacidade > capacidadeMaxima){
      await showSiteAlert('Preencha local, placa, marca, modelo e uma capacidade entre 1 e ' + capacidadeMaxima + '.', {
        title:'Revise os dados do veículo',
        type:'warning'
      });
      return;
    }
    const list = getVehicles();
    if(list.some(v => String(v.placa || '').toUpperCase() === placa)){
      await showSiteAlert('Já existe um veículo com essa placa.', {
        title:'Veículo não cadastrado',
        type:'warning'
      });
      return;
    }
    const vehicle = {
      id: 'veiculo-' + Date.now(),
      local: local,
      codigo: placa,
      placa: placa,
      marca: marca,
      modelo: modelo,
      capacidade: capacidade,
      tipo: vehicleTypeSelect ? vehicleTypeSelect.value : 'carro',
      alugado: vehicleRentedInput ? vehicleRentedInput.checked : false,
      centroCusto: vehicleCostCenterInput ? vehicleCostCenterInput.value.trim() : '',
      ativo: true
    };
    list.push(vehicle);
    try{
      await saveVehicles(list);
    }catch(error){
      await hydrateDatabaseState();
      await showSiteAlert(error.message, {
        title:'Não foi possível cadastrar o veículo',
        type:'danger'
      });
      renderFleetManagement();
      return;
    }
    logAudit('cadastrou', 'veículo', vehicle.id,
      local + ' · ' + vehicle.marca + ' ' + vehicle.modelo + ' · ' + placa);
    vehicleForm.reset();
    vehicleCapacityInput.max = String(seatLayoutFor('carro').capacidadeMaxima);
    vehicleCapacityInput.value = '5';
    if(vehicleTypeSelect) vehicleTypeSelect.value = 'carro';
    renderFleetManagement();
    renderCarSelector();
    renderMainCalendar();
  });
}

