/* =========================================================
   Gestão — grupos de usuários

   Um grupo é uma lista de usuários. No cadastro do veículo, a gestão da
   frota escolhe quais grupos podem enxergar e reservar aquele veículo
   (vazio = todos). A regra em si é compartilhada com o servidor - ver
   js/vehicle-access.js; aqui só há a tela.

   Os grupos ficam em /api/groups (tabelas próprias no banco), e não no
   application_state como locais e veículos: quem pertence a qual grupo
   é dado de controle de acesso e não deve ir para todo usuário logado.
   ========================================================= */

let userGroupsCache = null;
let userGroupsRequest = null;

function canReadUserGroups(){
  return canManageGroups() || canManageFleet();
}

// Lista de grupos (id, nome, descricao, membros). Guardada em memória; os
// formulários de veículo chamam isto sempre que abrem.
function loadUserGroups(force){
  if(!canReadUserGroups()) return Promise.resolve([]);
  if(userGroupsCache && !force) return Promise.resolve(userGroupsCache);
  if(userGroupsRequest && !force) return userGroupsRequest;
  userGroupsRequest = apiRequest('/api/groups')
    .then(result => {
      userGroupsCache = Array.isArray(result.groups) ? result.groups : [];
      return userGroupsCache;
    })
    .finally(() => {
      userGroupsRequest = null;
    });
  return userGroupsRequest;
}

function getCachedUserGroups(){
  return userGroupsCache || [];
}

// "Restrito: Assistência técnica" (ou '' para veículo de todos).
function vehicleAccessSummary(vehicle){
  const ids = vehicleGroupIds(vehicle);
  if(!ids.length) return '';
  const names = vehicleGroupNames(vehicle, getCachedUserGroups());
  return 'Restrito: ' + (names || ids.length + (ids.length === 1 ? ' grupo' : ' grupos'));
}

/* ---------------- Seletor de grupos (formulários de veículo) ---------------- */

function renderGroupPicker(container, selectedIds){
  if(!container) return;
  const selected = new Set((selectedIds || []).map(String));
  container.dataset.selected = JSON.stringify([...selected]);
  const groups = getCachedUserGroups();
  // Grupo que o veículo usa mas não veio na lista (excluído em outra aba):
  // continua marcado para não sumir do cadastro sem ninguém perceber.
  const missing = [...selected].filter(id => !groups.some(group => String(group.id) === id));
  if(!groups.length && !missing.length){
    container.innerHTML = '<p class="group-picker-empty">Nenhum grupo cadastrado' +
      (canManageGroups() ? ' - crie em Gestão › Grupos.' : '.') + '</p>';
    return;
  }
  container.innerHTML = groups.map(group =>
    '<label class="permission-option">' +
      '<input type="checkbox" value="' + escapeHTML(group.id) + '"' + (selected.has(String(group.id)) ? ' checked' : '') + '> ' +
      escapeHTML(group.nome) +
      ' <small>' + group.membros.length + (group.membros.length === 1 ? ' membro' : ' membros') + '</small>' +
    '</label>'
  ).join('') + missing.map(id =>
    '<label class="permission-option"><input type="checkbox" value="' + escapeHTML(id) + '" checked> ' +
      'Grupo removido <small>desmarque para liberar</small></label>'
  ).join('');
}

function readGroupPicker(container){
  if(!container) return [];
  const boxes = container.querySelectorAll('input[type="checkbox"]');
  // Lista ainda não carregada: mantém o que o veículo já tinha.
  if(!boxes.length){
    try{
      return JSON.parse(container.dataset.selected || '[]');
    }catch(error){
      return [];
    }
  }
  return [...boxes].filter(box => box.checked).map(box => box.value);
}

// Abre o seletor já com a lista atual do servidor (se falhar, o seletor
// mostra o que houver em memória e a validação do servidor decide).
function fillGroupPicker(container, selectedIds){
  renderGroupPicker(container, selectedIds);
  return loadUserGroups(true)
    .then(() => renderGroupPicker(container, selectedIds))
    .catch(error => console.warn('Não foi possível carregar os grupos:', error));
}

/* ---------------- Seção "Grupos" ---------------- */

const groupsList = document.getElementById('groupsList');
const groupNewBtn = document.getElementById('groupNewBtn');
const groupModal = document.getElementById('groupModal');
const groupForm = document.getElementById('groupForm');
const groupModalTitle = document.getElementById('groupModalTitle');
const groupNameInput = document.getElementById('groupName');
const groupDescriptionInput = document.getElementById('groupDescription');
const groupMemberSearch = document.getElementById('groupMemberSearch');
const groupMemberList = document.getElementById('groupMemberList');
const groupMemberCount = document.getElementById('groupMemberCount');
const groupFormError = document.getElementById('groupFormError');
let editingGroupId = null;
let groupSelectedMembers = new Set();

function groupVehicles(groupId){
  return getVehicles().filter(vehicle => vehicleGroupIds(vehicle).includes(String(groupId)));
}

async function renderGroupManagement(){
  if(!canManageGroups() || !groupsList) return;
  try{
    await loadUserGroups(true);
  }catch(error){
    groupsList.innerHTML = '<div class="empty-state">' + escapeHTML(error.message) + '</div>';
    return;
  }
  const usersById = new Map(getSystemUsers().map(user => [String(user.id), user]));
  const groups = getCachedUserGroups();
  groupsList.innerHTML = groups.length ? groups.map(group => {
    const vehicles = groupVehicles(group.id);
    const memberNames = group.membros.map(id => usersById.get(String(id))).filter(Boolean).map(user => user.nome);
    const preview = memberNames.slice(0, 4).join(', ') + (memberNames.length > 4 ? ' e mais ' + (memberNames.length - 4) : '');
    return '<div class="management-item">' +
      '<div><strong>' + escapeHTML(group.nome) + '</strong>' +
        '<small>' + group.membros.length + (group.membros.length === 1 ? ' membro' : ' membros') +
          ' · ' + (vehicles.length
            ? vehicles.length + (vehicles.length === 1 ? ' veículo restrito' : ' veículos restritos')
            : 'nenhum veículo') +
          (group.descricao ? ' · ' + escapeHTML(group.descricao) : '') + '</small>' +
        (preview ? '<small class="group-members-preview">' + escapeHTML(preview) + '</small>' : '') +
      '</div>' +
      '<div class="management-actions">' +
        '<button type="button" class="secondary-btn group-edit-btn" data-id="' + escapeHTML(group.id) + '">Editar</button>' +
        '<button type="button" class="delete-btn group-delete-btn" data-id="' + escapeHTML(group.id) + '">Excluir</button>' +
      '</div>' +
    '</div>';
  }).join('') : '<div class="empty-state">Nenhum grupo cadastrado. Crie um grupo e depois escolha, no cadastro do veículo, quais grupos podem reservá-lo.</div>';

  groupsList.querySelectorAll('.group-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openGroupModal(btn.getAttribute('data-id')));
  });
  groupsList.querySelectorAll('.group-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteGroup(btn.getAttribute('data-id')));
  });
}

function renderGroupMemberOptions(){
  const search = String(groupMemberSearch.value || '').trim().toLocaleLowerCase('pt-BR');
  const users = getSystemUsers()
    .filter(user => user.active !== false || groupSelectedMembers.has(String(user.id)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const visible = users.filter(user => !search ||
    user.nome.toLocaleLowerCase('pt-BR').includes(search) ||
    String(user.username || '').includes(search) ||
    String(user.centroCusto || '').toLocaleLowerCase('pt-BR').includes(search));
  groupMemberList.innerHTML = visible.length ? visible.map(user =>
    '<label class="permission-option group-member-option">' +
      '<input type="checkbox" value="' + escapeHTML(user.id) + '"' + (groupSelectedMembers.has(String(user.id)) ? ' checked' : '') + '> ' +
      '<span>' + escapeHTML(user.nome) + '<small>' + escapeHTML([user.username, user.centroCusto].filter(Boolean).join(' · ')) + '</small></span>' +
    '</label>'
  ).join('') : '<p class="group-picker-empty">Nenhum usuário encontrado.</p>';
  groupMemberCount.textContent = groupSelectedMembers.size + (groupSelectedMembers.size === 1 ? ' selecionado' : ' selecionados');
}

function openGroupModal(groupId){
  if(!canManageGroups()) return;
  const group = groupId ? getCachedUserGroups().find(item => String(item.id) === String(groupId)) : null;
  editingGroupId = group ? group.id : null;
  groupForm.reset();
  groupFormError.textContent = '';
  groupModalTitle.textContent = group ? 'Editar grupo' : 'Novo grupo';
  groupNameInput.value = group ? group.nome : '';
  groupDescriptionInput.value = group ? group.descricao : '';
  groupSelectedMembers = new Set(group ? group.membros.map(String) : []);
  renderGroupMemberOptions();
  groupModal.classList.remove('hidden');
  groupNameInput.focus();
}

function closeGroupModal(){
  groupModal.classList.add('hidden');
  editingGroupId = null;
}

async function deleteGroup(groupId){
  const group = getCachedUserGroups().find(item => String(item.id) === String(groupId));
  if(!group) return;
  const vehicles = groupVehicles(group.id);
  if(vehicles.length){
    await showSiteAlert(
      'O grupo "' + group.nome + '" ainda controla o acesso de ' +
      vehicles.map(vehicle => getVehicleFullModel(vehicle) + (vehicle.placa ? ' (' + vehicle.placa + ')' : '')).join(', ') +
      '. Remova o grupo do cadastro do veículo antes de excluí-lo.',
      { title:'Grupo em uso', type:'warning' }
    );
    return;
  }
  const confirmed = await showSiteConfirm(
    'Excluir o grupo "' + group.nome + '"? Os usuários continuam cadastrados; só o agrupamento é removido.',
    { title:'Excluir grupo', confirmText:'Sim, excluir', type:'danger' }
  );
  if(!confirmed) return;
  try{
    await apiRequest('/api/groups/' + encodeURIComponent(group.id), { method:'DELETE' });
    await renderGroupManagement();
  }catch(error){
    await showSiteAlert(error.message, { title:'Não foi possível excluir o grupo', type:'danger' });
  }
}

if(groupNewBtn) groupNewBtn.addEventListener('click', () => openGroupModal(null));
if(groupModal){
  document.getElementById('groupModalCloseBtn').addEventListener('click', closeGroupModal);
  document.getElementById('groupCancelBtn').addEventListener('click', closeGroupModal);
}
if(groupMemberSearch) groupMemberSearch.addEventListener('input', renderGroupMemberOptions);
if(groupMemberList){
  groupMemberList.addEventListener('change', function(event){
    const box = event.target.closest('input[type="checkbox"]');
    if(!box) return;
    if(box.checked) groupSelectedMembers.add(box.value);
    else groupSelectedMembers.delete(box.value);
    groupMemberCount.textContent = groupSelectedMembers.size + (groupSelectedMembers.size === 1 ? ' selecionado' : ' selecionados');
  });
}

if(groupForm){
  groupForm.addEventListener('submit', async function(event){
    event.preventDefault();
    groupFormError.textContent = '';
    const payload = {
      nome:groupNameInput.value.trim(),
      descricao:groupDescriptionInput.value.trim(),
      membros:[...groupSelectedMembers]
    };
    if(payload.nome.length < 2){
      groupFormError.textContent = 'Informe o nome do grupo.';
      return;
    }
    try{
      await apiRequest(editingGroupId ? '/api/groups/' + encodeURIComponent(editingGroupId) : '/api/groups', {
        method:editingGroupId ? 'PATCH' : 'POST',
        body:payload
      });
      closeGroupModal();
      await renderGroupManagement();
    }catch(error){
      groupFormError.textContent = error.message;
    }
  });
}
