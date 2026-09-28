const { query } = require('./db');
const { assert, validDate, ValidationError } = require('./validation');

// Janela padrão de aviso de vencimento, em dias. O mesmo número vale para o
// alerta no portal, para o e-mail e para o selo do painel - manter um só valor
// evita o caso em que a tela avisa e o e-mail não (ou vice-versa).
const DEFAULT_WARNING_DAYS = 60;

const CATEGORIAS = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];

/* =========================================================
   Regras de vencimento (funções puras, testáveis sem banco)
   ========================================================= */

// Normaliza para 'YYYY-MM-DD'. A coluna DATE volta do pg como objeto Date, e
// String(date) daria "Tue Sep 29 2026 ..." - além de não ser ISO, o dia sai
// deslocado quando o fuso do servidor está atrás de UTC. Por isso o Date é
// convertido via toISOString(), nunca por coerção implícita.
function toISODate(value){
  if(!value) return '';
  if(value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

// Meia-noite UTC da data ISO. Usar UTC (e não o fuso do servidor) faz a conta
// de dias ficar imune a horário de verão e a deploys em outra timezone.
function utcMidnight(iso){
  const [ano, mes, dia] = toISODate(iso).split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

// Quantos dias inteiros faltam de `todayISO` até `targetISO`.
// Positivo = ainda vai acontecer; 0 = hoje; negativo = já passou.
function diffInDays(targetISO, todayISO){
  return Math.round((utcMidnight(targetISO) - utcMidnight(todayISO)) / 86400000);
}

// Estado de uma CNH numa data de referência.
//   ausente  - sem CNH cadastrada, ou sem número/validade preenchidos
//   valida   - falta mais que a janela de aviso
//   vencendo - dentro da janela (inclui o próprio dia do vencimento)
//   vencida  - a data já passou
// diasRestantes vem null quando não há validade para comparar.
function licenseStatus(license, todayISO, warningDays = DEFAULT_WARNING_DAYS){
  if(!license || !license.numero || !license.validade){
    return { estado:'ausente', diasRestantes:null };
  }
  const validade = toISODate(license.validade);
  if(!validDate(validade) || !validDate(todayISO)){
    return { estado:'ausente', diasRestantes:null };
  }
  const diasRestantes = diffInDays(validade, todayISO);
  if(diasRestantes < 0) return { estado:'vencida', diasRestantes };
  if(diasRestantes <= warningDays) return { estado:'vencendo', diasRestantes };
  return { estado:'valida', diasRestantes };
}

// Só dirige quem tem CNH cadastrada e dentro da validade. "vencendo" ainda
// dirige - é aviso, não bloqueio.
function canDrive(license, todayISO, warningDays = DEFAULT_WARNING_DAYS){
  const { estado } = licenseStatus(license, todayISO, warningDays);
  return estado === 'valida' || estado === 'vencendo';
}

// Texto curto usado no portal, no e-mail e na notificação - uma fonte só,
// para os três canais dizerem exatamente a mesma coisa.
function licenseStatusMessage(status){
  const { estado, diasRestantes } = status;
  if(estado === 'vencida'){
    const dias = Math.abs(diasRestantes);
    return dias === 1
      ? 'Sua CNH venceu ontem. Renove antes de dirigir veículos da frota.'
      : `Sua CNH venceu há ${dias} dias. Renove antes de dirigir veículos da frota.`;
  }
  if(estado === 'vencendo'){
    if(diasRestantes === 0) return 'Sua CNH vence hoje. Providencie a renovação.';
    return diasRestantes === 1
      ? 'Sua CNH vence amanhã. Providencie a renovação.'
      : `Sua CNH vence em ${diasRestantes} dias. Providencie a renovação.`;
  }
  return '';
}

/* =========================================================
   Persistência

   A CNH só entra no sistema pela e-CNH (ver ./ecnh): não existe mais
   gravação a partir de dados digitados, nem armazenamento de imagem
   do documento. Guardamos apenas número, categoria e validade, mais
   de onde vieram (órgão que assinou e quando foi verificada).
   ========================================================= */

function licenseRowToObject(row){
  if(!row) return null;
  return {
    id:row.id,
    numero:row.numero || '',
    categoria:row.categoria || '',
    validade:toISODate(row.validade),
    origem:row.origem || 'e-cnh',
    emissor:row.emissor || '',
    verificadaEm:row.verificada_em ? new Date(row.verificada_em).toISOString() : ''
  };
}

const LICENSE_COLUMNS = 'id, user_id, numero, categoria, validade, origem, emissor, verificada_em';

async function getLicenseForUser(userId){
  const result = await query(
    `SELECT ${LICENSE_COLUMNS} FROM driver_licenses WHERE user_id = $1`,
    [userId]
  );
  return licenseRowToObject(result.rows[0]);
}

// Mapa userId -> CNH, sem N+1. Usado na listagem de usuários do admin.
async function getLicensesForUsers(userIds){
  const ids = [...new Set((userIds || []).map(String))];
  if(!ids.length) return new Map();
  const result = await query(
    `SELECT ${LICENSE_COLUMNS} FROM driver_licenses WHERE user_id = ANY($1::uuid[])`,
    [ids]
  );
  return new Map(result.rows.map(row => [String(row.user_id), licenseRowToObject(row)]));
}

// Última barreira antes do banco: mesmo vindo da e-CNH já validada, o
// formato é conferido de novo aqui, para nenhum outro chamador conseguir
// gravar dado fora do padrão.
function assertVerifiedLicense(dados){
  assert(dados && /^\d{11}$/.test(String(dados.numero || '')), 'Número de registro da CNH inválido.');
  assert(CATEGORIAS.includes(dados.categoria), 'Categoria de CNH inválida.');
  assert(validDate(dados.validade), 'Data de validade da CNH inválida.');
  assert(dados.emissor, 'Órgão emissor da e-CNH não informado.');
}

// Grava (ou substitui) a CNH verificada do usuário.
async function saveVerifiedLicense(userId, dados){
  assertVerifiedLicense(dados);
  try{
    const result = await query(
      `INSERT INTO driver_licenses (user_id, numero, categoria, validade, origem, emissor, verificada_em)
       VALUES ($1, $2, $3, $4, 'e-cnh', $5, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET numero = EXCLUDED.numero,
             categoria = EXCLUDED.categoria,
             validade = EXCLUDED.validade,
             origem = EXCLUDED.origem,
             emissor = EXCLUDED.emissor,
             verificada_em = EXCLUDED.verificada_em,
             updated_at = NOW()
       RETURNING ${LICENSE_COLUMNS}`,
      [userId, dados.numero, dados.categoria, dados.validade, String(dados.emissor).slice(0, 120)]
    );
    return licenseRowToObject(result.rows[0]);
  }catch(error){
    // driver_licenses_numero_unique (migração 033): a mesma CNH não pode
    // liberar dois usuários como motorista.
    if(error.code === '23505' && /numero/.test(String(error.constraint || ''))){
      throw new ValidationError('Esta CNH já está vinculada a outro usuário do CapriCar. Se isso estiver errado, avise um gestor.', 409);
    }
    throw error;
  }
}

async function removeLicenseForUser(userId){
  await query('DELETE FROM driver_licenses WHERE user_id = $1', [userId]);
}

function todayISO(){
  return new Date().toISOString().slice(0, 10);
}

// Formato único de CNH + vencimento devolvido pela API. Portal, e-mail e
// notificação leem daqui, então os três sempre dizem a mesma coisa.
function licensePayload(license, todayOverride){
  const status = licenseStatus(license, todayOverride || todayISO());
  return {
    cnh:license,
    status:status.estado,
    diasRestantes:status.diasRestantes,
    mensagem:licenseStatusMessage(status),
    janelaAvisoDias:DEFAULT_WARNING_DAYS,
    categorias:CATEGORIAS
  };
}

module.exports = {
  DEFAULT_WARNING_DAYS,
  CATEGORIAS,
  todayISO,
  toISODate,
  licensePayload,
  licenseStatus,
  licenseStatusMessage,
  canDrive,
  getLicenseForUser,
  getLicensesForUsers,
  saveVerifiedLicense,
  removeLicenseForUser
};
