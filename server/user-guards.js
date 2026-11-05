// Quem pode alterar a conta de quem. Puro, para ser testado sem banco.

// Contas com estas permissões controlam outras contas (usuários) ou os
// segredos de integração (SMTP, Entra), por isso só o admin mexe nelas.
const PRIVILEGED_COLUMNS = ['can_manage_users', 'can_manage_integrations'];

function isPrivilegedAccount(row){
  return PRIVILEGED_COLUMNS.some(column => row[column] === true);
}

// Devolve a mensagem de recusa, ou null se a alteração é permitida.
function accountChangeRefusal(actor, target, { isSelf, permissionsChanged, passwordChanged }){
  if(actor.role === 'admin') return null;
  if(isSelf && permissionsChanged) return 'Você não pode alterar as próprias permissões.';
  if(!isSelf && (permissionsChanged || passwordChanged) && isPrivilegedAccount(target)){
    return 'Só o administrador pode alterar permissões ou senha de outro gestor.';
  }
  return null;
}

module.exports = { accountChangeRefusal, isPrivilegedAccount };
