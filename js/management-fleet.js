/* Gestão — filiais e veículos */

/* =========================================================
   Filiais e veículos
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

function closeFleetEditModal(){
  fleetEditModal.classList.add('hidden');
  fleetEditForm.reset();
  fleetEditError.textContent = '';
  fleetEditType = null;
  fleetEditId = null;
}

function openBranchEditModal(branchId){
  if(!canManageFleet()) return;
  const branch = getBranches().find(item => String(item.id) === String(branchId));
  if(!branch) return;
  fleetEditType = 'branch';
  fleetEditId = branch.id;
  fleetEditForm.reset();
  fleetEditTitle.textContent = 'Editar filial';
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
  fleetEditSubtitle.textContent = 'Atualize a filial, a placa, a marca, o modelo e a capacidade do veículo.';
  fleetEditBranchFields.classList.add('hidden');
  fleetEditVehicleFields.classList.remove('hidden');
  fleetEditVehicleBranchSelect.innerHTML = getBranches().map(branch =>
    '<option value="' + escapeHTML(branch.nome) + '">' + escapeHTML(branch.nome) +
      (branch.ativo === false ? ' (inativa)' : '') + '</option>'
  ).join('');
  fleetEditVehicleBranchSelect.value = vehicle.filial;
  fleetEditVehiclePlateInput.value = vehicle.placa || '';
  fleetEditVehicleBrandInput.value = getVehicleBrand(vehicle);
  fleetEditVehicleModelInput.value = getVehicleModelName(vehicle);
  fleetEditVehicleCapacityInput.value = vehicle.capacidade || CAPACIDADE_MAXIMA;
  fleetEditError.textContent = '';
  fleetEditModal.classList.remove('hidden');
  fleetEditVehiclePlateInput.focus();
}

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
      (vehicle.placa ? ' · ' + escapeHTML(vehicle.placa) : '') + '</strong>' +
    '<small>' + escapeHTML(vehicle.filial) + '</small>';
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
  if(!canManageFleet()) return;
  const branch = getBranches().find(item => String(item.id) === String(branchId));
  if(!branch) return;
  branchDeleteId = branch.id;
  branchDeleteForm.reset();
  branchDeleteError.textContent = '';
  const linkedVehicles = getVehicles().filter(vehicle => vehicle.filial === branch.nome).length;
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
  if(!canManageFleet() || !branchDeleteId) return;
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
    renderFleetManagement();
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
  if(!canManageFleet() || !fleetEditType || !fleetEditId) return;
  fleetEditError.textContent = '';

  if(fleetEditType === 'branch'){
    const list = getBranches();
    const branch = list.find(item => String(item.id) === String(fleetEditId));
    const newName = fleetEditBranchNameInput.value.trim();
    if(!branch || !newName){
      fleetEditError.textContent = 'Informe o nome da filial.';
      return;
    }
    if(list.some(item => item.id !== branch.id && item.nome.toLowerCase() === newName.toLowerCase())){
      fleetEditError.textContent = 'Já existe uma filial com esse nome.';
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
    vehiclesUpdated.forEach(vehicle => { if(vehicle.filial === oldName) vehicle.filial = newName; });
    saveVehicles(vehiclesUpdated);
    const blocksUpdated = getVehicleBlocks();
    blocksUpdated.forEach(block => { if(block.filial === oldName) block.filial = newName; });
    saveVehicleBlocks(blocksUpdated);
    const reservationsUpdated = getReservations();
    reservationsUpdated.forEach(reservation => {
      if(reservation.partida === oldName) reservation.partida = newName;
      if(reservation.destino === oldName) reservation.destino = newName;
    });
    saveReservations(reservationsUpdated);
    logAudit('editou', 'filial', branch.id, oldName + ' → ' + newName);
  } else {
    const list = getVehicles();
    const vehicle = list.find(item => String(item.id) === String(fleetEditId));
    const filial = fleetEditVehicleBranchSelect.value;
    const marca = fleetEditVehicleBrandInput.value.trim();
    const modelo = fleetEditVehicleModelInput.value.trim();
    const placa = fleetEditVehiclePlateInput.value.trim().toUpperCase();
    const capacidade = Number(fleetEditVehicleCapacityInput.value);
    if(!vehicle || !filial || !placa || !marca || !modelo || !Number.isInteger(capacidade) || capacidade < 1 || capacidade > 20){
      fleetEditError.textContent = 'Preencha filial, placa, marca, modelo e uma capacidade entre 1 e 20.';
      return;
    }
    if(list.some(item =>
      item.id !== vehicle.id && String(item.placa || '').toUpperCase() === placa
    )){
      fleetEditError.textContent = 'Já existe um veículo com essa placa.';
      return;
    }
    const oldFilial = vehicle.filial;
    const oldCode = String(vehicle.codigo);
    vehicle.filial = filial;
    vehicle.marca = marca;
    vehicle.modelo = modelo;
    vehicle.placa = placa;
    vehicle.capacidade = capacidade;
    saveVehicles(list);
    if(oldFilial !== filial){
      const blocksUpdated = getVehicleBlocks();
      blocksUpdated.forEach(block => {
        if(block.filial === oldFilial && String(block.carro) === oldCode){
          block.filial = filial;
        }
      });
      saveVehicleBlocks(blocksUpdated);
      const reservationsUpdated = getReservations();
      reservationsUpdated.forEach(reservation => {
        if(reservation.partida === oldFilial && String(reservation.carro) === oldCode){
          reservation.partida = filial;
        }
      });
      saveReservations(reservationsUpdated);
    }
    logAudit('editou', 'veículo', vehicle.id,
      oldFilial + ' → ' + filial + ' · ' + marca + ' ' + modelo + ' · ' + placa);
  }

  closeFleetEditModal();
  renderFleetManagement();
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
    { el: document.getElementById('adminFiltroFilial'), first: '<option value="">Todas</option>' },
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
    '<option value="' + escapeHTML(v.filial + '|' + v.codigo) + '">' +
      escapeHTML(v.filial + ' · ' + getVehicleFullModel(v) + (v.placa ? ' · ' + v.placa : '')) +
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

function renderFleetManagement(){
  if(!canManageFleet()) return;
  refreshBranchSelectors();
  const branches = getBranches();
  branchesList.innerHTML = branches.length ? branches.map(branch =>
    '<div class="management-item' + (branch.ativo === false ? ' is-inactive' : '') + '">' +
      '<div><strong>' + escapeHTML(branch.nome) + '</strong><small>' + (branch.ativo === false ? 'Inativa' : 'Ativa') + '</small></div>' +
      '<div class="management-actions"><button type="button" class="secondary-btn branch-edit-btn" data-id="' + escapeHTML(branch.id) + '">Editar</button>' +
      '<button type="button" class="secondary-btn branch-toggle-btn" data-id="' + escapeHTML(branch.id) + '">' + (branch.ativo === false ? 'Ativar' : 'Desativar') + '</button>' +
      '<button type="button" class="delete-btn branch-delete-btn" data-id="' + escapeHTML(branch.id) + '">Excluir</button></div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhuma filial cadastrada.</div>';

  const vehicles = getVehicles();
  vehiclesList.innerHTML = vehicles.length ? vehicles.map(vehicle =>
    '<div class="management-item' + (vehicle.ativo === false ? ' is-inactive' : '') + '">' +
      '<div><strong>' + escapeHTML(getVehicleFullModel(vehicle)) +
        (vehicle.placa ? ' · ' + escapeHTML(vehicle.placa) : '') + '</strong>' +
      '<small>' + escapeHTML(vehicle.filial) + ' · ' + Number(vehicle.capacidade || CAPACIDADE_MAXIMA) + ' lugares · ' + (vehicle.ativo === false ? 'Inativo' : 'Ativo') + '</small></div>' +
      '<div class="management-actions"><button type="button" class="secondary-btn vehicle-edit-btn" data-id="' + escapeHTML(vehicle.id) + '">Editar</button>' +
      '<button type="button" class="secondary-btn vehicle-toggle-btn" data-id="' + escapeHTML(vehicle.id) + '">' + (vehicle.ativo === false ? 'Ativar' : 'Desativar') + '</button>' +
      '<button type="button" class="delete-btn vehicle-delete-btn" data-id="' + escapeHTML(vehicle.id) + '">Excluir</button></div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum veículo cadastrado.</div>';

  branchesList.querySelectorAll('.branch-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageFleet()) return;
      const list = getBranches();
      const branch = list.find(f => String(f.id) === String(this.getAttribute('data-id')));
      if(!branch) return;
      branch.ativo = branch.ativo === false;
      saveBranches(list);
      logAudit(branch.ativo ? 'ativou' : 'desativou', 'filial', branch.id, branch.nome);
      renderFleetManagement();
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

  vehiclesList.querySelectorAll('.vehicle-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageFleet()) return;
      const list = getVehicles();
      const vehicle = list.find(v => String(v.id) === String(this.getAttribute('data-id')));
      if(!vehicle) return;
      vehicle.ativo = vehicle.ativo === false;
      saveVehicles(list);
      logAudit(vehicle.ativo ? 'ativou' : 'desativou', 'veículo', vehicle.id,
        vehicle.filial + ' · ' + getVehicleFullModel(vehicle) +
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
    if(!canManageFleet()) return;
    const nome = branchNameInput.value.trim();
    if(!nome) return;
    const list = getBranches();
    if(list.some(f => f.nome.toLowerCase() === nome.toLowerCase())){
      await showSiteAlert('Já existe uma filial com esse nome.', {
        title:'Filial não cadastrada',
        type:'warning'
      });
      return;
    }
    const branch = { id: 'filial-' + Date.now(), nome: nome, ativo: true };
    list.push(branch);
    try{
      await saveBranches(list);
    }catch(error){
      await hydrateDatabaseState();
      await showSiteAlert(error.message, {
        title:'Não foi possível cadastrar a filial',
        type:'danger'
      });
      renderFleetManagement();
      return;
    }
    logAudit('cadastrou', 'filial', branch.id, nome);
    branchForm.reset();
    renderFleetManagement();
  });
}

if(vehicleForm){
  vehicleForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageFleet()) return;
    const filial = vehicleBranchSelect.value;
    const placa = vehiclePlateInput.value.trim().toUpperCase();
    const marca = vehicleBrandInput.value.trim();
    const modelo = vehicleModelInput.value.trim();
    const capacidade = Number(vehicleCapacityInput.value);
    if(!filial || !placa || !marca || !modelo || !Number.isFinite(capacidade) || capacidade < 1){
      await showSiteAlert('Preencha filial, placa, marca, modelo e capacidade.', {
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
      filial: filial,
      codigo: placa,
      placa: placa,
      marca: marca,
      modelo: modelo,
      capacidade: capacidade,
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
      filial + ' · ' + vehicle.marca + ' ' + vehicle.modelo + ' · ' + placa);
    vehicleForm.reset();
    vehicleCapacityInput.value = '5';
    renderFleetManagement();
    renderCarSelector();
    renderMainCalendar();
  });
}

