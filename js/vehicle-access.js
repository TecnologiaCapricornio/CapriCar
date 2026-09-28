/* =========================================================
   Acesso a veículos restritos por grupo

   Um veículo pode ter `grupos` (ids de user_groups, migração 034).
   Sem grupos, é de todos. Com grupos, a regra se divide em duas:

     ENXERGAR (listas, calendário, reservas de outros, caronas):
       membros de algum dos grupos, ou quem tem qualquer permissão de
       gestão - a gestão precisa ver o veículo para cuidar de bloqueios,
       manutenção, relatórios e checklist dele.

     RESERVAR COMO MOTORISTA:
       só membros de algum dos grupos. Vale também quando a gestão cria
       a reserva em nome de alguém: quem conta é o motorista
       (criadorUsuarioId), não quem clicou.

   Funções puras - quem chama carrega os grupos do usuário.

   Carregado tanto via <script> no navegador quanto via require() no
   servidor (server/vehicle-access.js reexporta), mesmo padrão de
   js/cnh-categorias.js: a regra fica escrita num lugar só.
   ========================================================= */

const MANAGEMENT_PERMISSIONS = [
  'reservations', 'branches', 'fleet', 'maintenance', 'blocks', 'reports',
  'audit', 'rules', 'users', 'groups', 'integrations', 'checklist'
];

function hasAnyManagementPermission(user){
  if(!user) return false;
  if(user.role === 'admin') return true;
  const permissions = user.permissions || {};
  return MANAGEMENT_PERMISSIONS.some(permission => permissions[permission] === true);
}

function vehicleGroupIds(vehicle){
  if(!vehicle || !Array.isArray(vehicle.grupos)) return [];
  return [...new Set(vehicle.grupos.map(String).filter(Boolean))];
}

function isRestrictedVehicle(vehicle){
  return vehicleGroupIds(vehicle).length > 0;
}

function toIdSet(groupIds){
  if(groupIds instanceof Set) return groupIds;
  return new Set((groupIds || []).map(String));
}

// O motorista (dono dos grupos `userGroupIds`) pode reservar este veículo?
function canDriveVehicle(vehicle, userGroupIds){
  const groups = vehicleGroupIds(vehicle);
  if(!groups.length) return true;
  const mine = toIdSet(userGroupIds);
  return groups.some(id => mine.has(id));
}

// `user` precisa trazer `grupos` (ver publicUser em ./auth).
function canSeeVehicle(vehicle, user){
  if(!isRestrictedVehicle(vehicle)) return true;
  if(hasAnyManagementPermission(user)) return true;
  return canDriveVehicle(vehicle, user && user.grupos);
}

function vehicleAccessKey(local, codigo){
  return `${String(local || '').trim().toLowerCase()}|${String(codigo || '').trim().toLowerCase()}`;
}

// Índice local|codigo -> veículo, o mesmo par que as reservas usam
// (partida|carro) para apontar para o veículo.
function indexVehicles(vehicles){
  return new Map((Array.isArray(vehicles) ? vehicles : []).map(vehicle => [vehicleAccessKey(vehicle.local, vehicle.codigo), vehicle]));
}

function vehicleForReservation(reservation, vehiclesIndex){
  return vehiclesIndex.get(vehicleAccessKey(reservation && reservation.partida, reservation && reservation.carro)) || null;
}

// Nome curto dos grupos, para mensagens ("Assistência técnica, Diretoria").
function vehicleGroupNames(vehicle, groups){
  const byId = new Map((groups || []).map(group => [String(group.id), group.nome || group.name]));
  return vehicleGroupIds(vehicle).map(id => byId.get(id)).filter(Boolean).join(', ');
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    MANAGEMENT_PERMISSIONS,
    hasAnyManagementPermission,
    vehicleGroupIds,
    isRestrictedVehicle,
    canDriveVehicle,
    canSeeVehicle,
    vehicleAccessKey,
    indexVehicles,
    vehicleForReservation,
    vehicleGroupNames
  };
}
