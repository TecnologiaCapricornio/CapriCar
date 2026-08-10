/* Inicialização da aplicação — deve ser carregado por último */
/* =========================================================
   Inicialização: login persistido ou tela de login
   ========================================================= */
function setFieldRequiredMarker(fieldId, required){
  const field = document.getElementById(fieldId);
  const label = document.querySelector('label[for="' + fieldId + '"]');
  if(!field || !label) return;
  let marker = label.querySelector('.required-marker');
  if(required && !marker){
    marker = document.createElement('span');
    marker.className = 'required-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '*';
    label.appendChild(marker);
  }
  if(!required && marker) marker.remove();
  if(required) field.setAttribute('aria-required', 'true');
  else field.removeAttribute('aria-required');
}

function markRequiredFields(){
  const requiredFieldIds = [
    'partida', 'destino', 'carro', 'rangePickerTrigger',
    'horarioRetirada', 'horarioDevolucao',
    'branchName', 'vehicleBranch', 'vehiclePlate', 'vehicleBrand', 'vehicleModel', 'vehicleCapacity',
    'blockVehicle', 'blockType', 'blockRangePickerTrigger',
    'ruleMaxConsecutiveDays', 'ruleMaxAdvanceDays', 'ruleMaxReservations', 'ruleReservationBufferMinutes',
    'userAccountName', 'userAccountUsername', 'userAccountPassword',
    'qDestino', 'qDataVolta', 'qHorarioRetirada', 'qHorarioDevolucao',
    'aNome', 'aPartida', 'aDestino', 'aCarro',
    'adminRangePickerTrigger', 'aHorarioRetirada', 'aHorarioDevolucao',
    'fleetEditBranchName', 'fleetEditVehicleBranch', 'fleetEditVehiclePlate',
    'fleetEditVehicleBrand', 'fleetEditVehicleModel', 'fleetEditVehicleCapacity',
    'userDeleteJustification', 'vehicleDeleteJustification', 'branchDeleteJustification',
    'operationKm', 'operationFuel'
  ];
  requiredFieldIds.forEach(fieldId => setFieldRequiredMarker(fieldId, true));
  document.querySelectorAll('[required][id]').forEach(field => setFieldRequiredMarker(field.id, true));
}

markRequiredFields();
initializeTimePickers();

(async function initializeApplication(){
  try{
    const session = await apiRequest('/api/auth/me');
    const user = accountToSession(session.user);
    setCurrentUser(user);
    await hydrateDatabaseState();
    showApp(user);
  }catch(error){
    databaseHydrated = false;
    clearCurrentUser();
    showLogin();
  }
})();
