/* =========================================================
   Perfis de acesso (migração 036)

   No lugar das caixinhas de permissão uma a uma, cada conta tem um de três
   perfis pré-definidos. O perfil decide as permissões de gestão (as mesmas
   colunas can_manage_* de sempre, gravadas junto pelo servidor) e, no caso
   da Portaria, também tira o que qualquer conta comum pode fazer:

     usuario  - padrão de toda conta nova: faz reservas, sem gestão;
     gestao   - acesso a tudo do painel de Gestão;
     portaria - só as abas Checklist e Calendário e a lista de Reservas da
                Gestão, esta só para consulta. Não faz reserva (nem entra
                de carona) e não cadastra CNH.

   A conta admin (role 'admin') continua à parte: tem tudo por definição e
   aparece como Gestão.

   Carregado tanto via <script> no navegador quanto via require() no
   servidor (server/profiles.js reexporta), mesmo padrão de
   js/vehicle-access.js: a regra fica escrita num lugar só.
   ========================================================= */

const PROFILE_KEYS = ['usuario', 'gestao', 'portaria'];
const DEFAULT_PROFILE = 'usuario';

const PROFILE_LABELS = {
  usuario:'Usuário',
  gestao:'Gestão',
  portaria:'Portaria'
};

const PROFILE_DESCRIPTIONS = {
  usuario:'Faz reservas de veículos. Sem acesso à Gestão.',
  gestao:'Acesso a tudo: reservas de todos, locais, veículos, usuários, relatórios, checklist etc.',
  portaria:'Só Checklist, Calendário e a lista de Reservas (consulta). Não faz reservas nem cadastra CNH.'
};

const PROFILE_PERMISSION_KEYS = [
  'reservations', 'branches', 'fleet', 'maintenance', 'blocks', 'reports',
  'audit', 'rules', 'users', 'groups', 'integrations', 'checklist'
];

function normalizeProfile(value){
  const key = String(value || '').trim().toLowerCase();
  return PROFILE_KEYS.includes(key) ? key : DEFAULT_PROFILE;
}

function isValidProfile(value){
  return PROFILE_KEYS.includes(String(value || '').trim().toLowerCase());
}

// Permissões de gestão que o perfil concede (mesmas chaves de
// user.permissions).
function permissionsForProfile(profile){
  const key = normalizeProfile(profile);
  const permissions = {};
  PROFILE_PERMISSION_KEYS.forEach(permission => {
    permissions[permission] = key === 'gestao' || (key === 'portaria' && permission === 'checklist');
  });
  return permissions;
}

// Perfil efetivo de uma conta: admin conta como Gestão.
function userProfile(user){
  if(!user) return DEFAULT_PROFILE;
  if(user.role === 'admin' || user.isAdmin === true) return 'gestao';
  return normalizeProfile(user.perfil);
}

function isPortariaUser(user){
  return !!user && userProfile(user) === 'portaria';
}

// Portaria não reserva, não entra de carona e não cadastra CNH.
function canMakeReservations(user){
  return !!user && !isPortariaUser(user);
}

function profileLabel(profile){
  return PROFILE_LABELS[normalizeProfile(profile)];
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    PROFILE_KEYS,
    DEFAULT_PROFILE,
    PROFILE_LABELS,
    PROFILE_DESCRIPTIONS,
    normalizeProfile,
    isValidProfile,
    permissionsForProfile,
    userProfile,
    isPortariaUser,
    canMakeReservations,
    profileLabel
  };
}
