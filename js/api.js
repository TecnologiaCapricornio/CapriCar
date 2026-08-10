let databaseHydrated = false;
let databaseSyncQueue = Promise.resolve();
const databaseRevisions = Object.create(null);

async function apiRequest(path, options){
  const config = { credentials:'same-origin', ...(options || {}) };
  config.headers = { ...(config.headers || {}) };
  if(config.body && typeof config.body !== 'string'){
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(path, config);
  const data = await response.json().catch(() => ({}));
  if(!response.ok){
    const error = new Error(data.error || 'Não foi possível concluir a operação.');
    error.status = response.status;
    error.code = data.code;
    error.currentRevision = data.currentRevision;
    throw error;
  }
  return data;
}

function queueCollectionSync(name, value){
  if(!databaseHydrated) return Promise.resolve({ localOnly:true });
  const operation = databaseSyncQueue
    .catch(() => {})
    .then(async () => {
      const result = await apiRequest('/api/state/' + encodeURIComponent(name), {
        method:'PUT',
        body:{ value:value, revision:Number(databaseRevisions[name] || 0) }
      });
      databaseRevisions[name] = result.revision;
      return result;
    });
  databaseSyncQueue = operation.catch(error => {
    console.error('Falha ao salvar no banco:', error);
    const message = document.getElementById('databaseStatusMessage');
    if(message) message.textContent = error.message;
    if(error.code === 'STATE_CONFLICT'){
      databaseHydrated = false;
      setTimeout(() => {
        hydrateDatabaseState().catch(refreshError => {
          console.error('Falha ao recarregar os dados atualizados:', refreshError);
        });
      }, 0);
    }
  });
  return operation;
}

function deleteVehiclePermanently(vehicleId, justification){
  if(!databaseHydrated){
    return Promise.reject(new Error('Aguarde a conexão com o banco e tente novamente.'));
  }
  const operation = databaseSyncQueue
    .catch(() => {})
    .then(async () => {
      const result = await apiRequest('/api/state/vehicles/' + encodeURIComponent(vehicleId), {
        method:'DELETE',
        body:{
          justification,
          revisions:{
            vehicles:Number(databaseRevisions.vehicles || 0),
            blocks:Number(databaseRevisions.blocks || 0)
          }
        }
      });
      databaseRevisions.vehicles = result.revisions.vehicles;
      databaseRevisions.blocks = result.revisions.blocks;
      return result;
    });
  databaseSyncQueue = operation.catch(error => {
    console.error('Falha ao excluir o veículo:', error);
  });
  return operation;
}

function syncReservations(previous, next){
  if(!databaseHydrated) return Promise.resolve({ localOnly:true, reservations:next });
  const before = new Map((Array.isArray(previous) ? previous : []).map(item => [String(item.id), item]));
  const after = new Map((Array.isArray(next) ? next : []).map(item => [String(item.id), item]));
  const changes = [];
  for(const [id, reservation] of after){
    const old = before.get(id);
    if(!old || JSON.stringify(old) !== JSON.stringify(reservation)){
      changes.push({ type:'upsert', reservation });
    }
  }
  for(const id of before.keys()){
    if(!after.has(id)) changes.push({ type:'delete', id });
  }
  if(!changes.length) return Promise.resolve({ ok:true, reservations:next });
  const operation = databaseSyncQueue
    .catch(() => {})
    .then(() => apiRequest('/api/reservations/sync', {
      method:'POST', body:{ changes }
    }))
    .then(result => {
      if(Array.isArray(result.reservations)){
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.reservations));
      }
      return result;
    });
  databaseSyncQueue = operation.catch(error => {
    console.error('Falha ao salvar reservas:', error);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(previous || []));
  });
  return operation;
}

function deleteBranchPermanently(branchId, justification){
  if(!databaseHydrated){
    return Promise.reject(new Error('Aguarde a conexão com o banco e tente novamente.'));
  }
  const operation = databaseSyncQueue
    .catch(() => {})
    .then(async () => {
      const result = await apiRequest('/api/state/branches/' + encodeURIComponent(branchId), {
        method:'DELETE',
        body:{
          justification,
          revision:Number(databaseRevisions.branches || 0)
        }
      });
      databaseRevisions.branches = result.revision;
      return result;
    });
  databaseSyncQueue = operation.catch(error => {
    console.error('Falha ao excluir a filial:', error);
  });
  return operation;
}

async function hydrateDatabaseState(){
  let localAudit = [];
  try{
    localAudit = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  }catch(error){
    localAudit = [];
  }
  const payload = await apiRequest('/api/state/bootstrap');
  const mapping = {
    branches:BRANCHES_KEY,
    vehicles:VEHICLES_KEY,
    blocks:BLOCKS_KEY,
    rules:RULES_KEY
  };

  for(const [collection, key] of Object.entries(mapping)){
    const serverValue = payload.collections[collection];
    databaseRevisions[collection] = Number(payload.revisions && payload.revisions[collection] || 0);
    if(serverValue !== null){
      localStorage.setItem(key, JSON.stringify(serverValue));
    } else {
      let localValue;
      try{
        localValue = JSON.parse(localStorage.getItem(key) || (collection === 'rules' ? 'null' : '[]'));
      }catch(error){
        localValue = collection === 'rules' ? getReservationRules() : [];
      }
      if(localValue == null && collection === 'rules') localValue = getReservationRules();
      const saved = await apiRequest('/api/state/' + collection, {
        method:'PUT',
        body:{ value:localValue, revision:databaseRevisions[collection] }
      });
      databaseRevisions[collection] = saved.revision;
    }
  }

  if(Array.isArray(payload.audit) && payload.audit.length){
    localStorage.setItem(AUDIT_KEY, JSON.stringify(payload.audit));
  } else if(getCurrentUser() && getCurrentUser().role === 'admin' && localAudit.length){
    await apiRequest('/api/state/audit/import', {
      method:'POST',
      body:{ events:localAudit }
    });
  }
  if(Array.isArray(payload.users) && payload.users.length){
    localStorage.setItem(USERS_KEY, JSON.stringify(payload.users));
  }

  const reservationPayload = await apiRequest('/api/reservations');
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Array.isArray(reservationPayload.reservations) ? reservationPayload.reservations : [])
  );
  if(Array.isArray(payload.userDirectory)){
    localStorage.setItem(USER_DIRECTORY_KEY, JSON.stringify(payload.userDirectory));
  }
  databaseHydrated = true;
  syncFleetGlobals();
}
