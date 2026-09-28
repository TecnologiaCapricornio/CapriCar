const { query } = require('./db');
const { publicUser } = require('./auth');
const { getLicensesForUsers, licenseStatus } = require('./driver-licenses');

// Listagem de usuários da gestão, compartilhada por GET /api/users e pelo
// GET /api/state/bootstrap. A tela Gestão › Usuários lê o bootstrap e reenvia
// as permissões/centro de custo no PATCH, então as duas rotas precisam
// devolver exatamente o mesmo formato - uma coluna faltando aqui vira `false`
// no cliente e é revogada no próximo salvamento.
const USER_SELECT = `
  SELECT id, username, display_name, email, role, active, auth_provider,
         can_manage_reservations, can_manage_branches, can_manage_fleet, can_manage_maintenance,
         can_manage_blocks, can_view_reports, can_view_audit,
         can_manage_rules, can_manage_users, can_manage_groups, can_manage_integrations, can_manage_checklist,
         cost_center, created_at, updated_at
    FROM users
   WHERE deleted_at IS NULL`;

function todaySaoPaulo(){
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Sao_Paulo',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).format(new Date());
}

async function listManagedUsers(){
  const result = await query(USER_SELECT + " ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, display_name");

  // Uma consulta só para todas as CNHs, e não uma por usuário - a lista de
  // usuários é paginada no cliente, então o N+1 apareceria em cheio aqui.
  const licenses = await getLicensesForUsers(result.rows.map(row => row.id));
  const hoje = todaySaoPaulo();

  return result.rows.map(row => {
    const user = publicUser(row);
    const cnh = licenses.get(String(row.id)) || null;
    const status = licenseStatus(cnh, hoje);
    user.cnh = cnh;
    user.cnhStatus = status.estado;
    user.cnhDiasRestantes = status.diasRestantes;
    return user;
  });
}

module.exports = { USER_SELECT, listManagedUsers, todaySaoPaulo };
