const { query } = require('./db');
const { decodeImageDataUrl, assert, validDate } = require('./validation');
const {
  saveLicensePhotoFile,
  readLicensePhotoFile,
  deleteLicensePhotoFile
} = require('./photo-storage');

// Janela padrão de aviso de vencimento, em dias. O mesmo número vale para o
// alerta no portal, para o e-mail e para o selo do painel - manter um só valor
// evita o caso em que a tela avisa e o e-mail não (ou vice-versa).
const DEFAULT_WARNING_DAYS = 60;

const CATEGORIAS = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];
const LADOS = ['frente', 'verso'];

/* =========================================================
   Regras de vencimento (funções puras, testáveis sem banco)
   ========================================================= */

// Meia-noite UTC da data ISO. Usar UTC (e não o fuso do servidor) faz a conta
// de dias ficar imune a horário de verão e a deploys em outra timezone.
function utcMidnight(iso){
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-').map(Number);
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
  const validade = String(license.validade).slice(0, 10);
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
   ========================================================= */

function licenseRowToObject(row, photos){
  if(!row) return null;
  return {
    id:row.id,
    numero:row.numero || '',
    categoria:row.categoria || '',
    validade:row.validade ? String(row.validade.toISOString ? row.validade.toISOString().slice(0, 10) : row.validade).slice(0, 10) : '',
    fotos:LADOS.reduce((acc, lado) => {
      acc[lado] = (photos || []).some(photo => photo.lado === lado);
      return acc;
    }, {})
  };
}

async function getLicenseForUser(userId){
  const result = await query(
    `SELECT id, numero, categoria, validade FROM driver_licenses WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if(!row) return null;
  const photos = await query(
    'SELECT lado FROM driver_license_photos WHERE license_id = $1',
    [row.id]
  );
  return licenseRowToObject(row, photos.rows);
}

// Mapa userId -> CNH, sem N+1. Usado na listagem de usuários do admin.
async function getLicensesForUsers(userIds){
  const ids = [...new Set((userIds || []).map(String))];
  if(!ids.length) return new Map();
  const result = await query(
    `SELECT l.id, l.user_id, l.numero, l.categoria, l.validade,
            COALESCE(ARRAY_AGG(p.lado) FILTER (WHERE p.lado IS NOT NULL), '{}') AS lados
       FROM driver_licenses l
       LEFT JOIN driver_license_photos p ON p.license_id = l.id
      WHERE l.user_id = ANY($1::uuid[])
      GROUP BY l.id`,
    [ids]
  );
  return new Map(
    result.rows.map(row => [
      String(row.user_id),
      licenseRowToObject(row, (row.lados || []).map(lado => ({ lado })))
    ])
  );
}

function validateLicenseInput(payload){
  const numero = String(payload.numero == null ? '' : payload.numero).trim();
  const categoria = String(payload.categoria == null ? '' : payload.categoria).trim().toUpperCase();
  const validade = String(payload.validade == null ? '' : payload.validade).trim();

  // Cadastro vazio significa "remover a CNH" e é permitido.
  if(!numero && !categoria && !validade) return null;

  assert(/^\d{9,11}$/.test(numero), 'O número da CNH deve ter de 9 a 11 dígitos.');
  assert(CATEGORIAS.includes(categoria), 'Selecione uma categoria de CNH válida.');
  assert(validDate(validade), 'Informe uma data de validade válida para a CNH.');

  return { numero, categoria, validade };
}

// Grava a CNH e, quando vierem fotos novas, substitui as do lado enviado.
// `fotos` é { frente?:dataUrl, verso?:dataUrl } - lado ausente mantém a atual.
async function saveLicenseForUser(userId, payload, fotos){
  const dados = validateLicenseInput(payload);

  if(!dados){
    const existing = await query('SELECT id FROM driver_licenses WHERE user_id = $1', [userId]);
    if(existing.rows[0]) await removeLicense(existing.rows[0].id);
    return null;
  }

  const upserted = await query(
    `INSERT INTO driver_licenses (user_id, numero, categoria, validade)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET numero = EXCLUDED.numero,
           categoria = EXCLUDED.categoria,
           validade = EXCLUDED.validade,
           updated_at = NOW()
     RETURNING id, numero, categoria, validade`,
    [userId, dados.numero, dados.categoria, dados.validade]
  );
  const license = upserted.rows[0];

  for(const lado of LADOS){
    const dataUrl = fotos && fotos[lado];
    if(!dataUrl) continue;
    const { subtype, buffer } = decodeImageDataUrl(dataUrl);
    const storageKey = saveLicensePhotoFile(buffer, subtype);

    const anterior = await query(
      'SELECT storage_key FROM driver_license_photos WHERE license_id = $1 AND lado = $2',
      [license.id, lado]
    );

    await query(
      `INSERT INTO driver_license_photos
         (license_id, lado, storage_key, content_type, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (license_id, lado) DO UPDATE
         SET storage_key = EXCLUDED.storage_key,
             content_type = EXCLUDED.content_type,
             file_size_bytes = EXCLUDED.file_size_bytes,
             data_url = NULL,
             created_at = NOW()`,
      [license.id, lado, storageKey, `image/${subtype}`, buffer.length]
    );

    // Só apaga o arquivo antigo depois que o novo já está referenciado.
    if(anterior.rows[0] && anterior.rows[0].storage_key){
      deleteLicensePhotoFile(anterior.rows[0].storage_key);
    }
  }

  const photos = await query(
    'SELECT lado FROM driver_license_photos WHERE license_id = $1',
    [license.id]
  );
  return licenseRowToObject(license, photos.rows);
}

async function removeLicense(licenseId){
  const photos = await query(
    'SELECT storage_key FROM driver_license_photos WHERE license_id = $1',
    [licenseId]
  );
  await query('DELETE FROM driver_licenses WHERE id = $1', [licenseId]);
  for(const photo of photos.rows){
    if(photo.storage_key) deleteLicensePhotoFile(photo.storage_key);
  }
}

// Devolve os bytes de um lado da CNH, ou null. A autorização (dono ou gestor
// de usuários) é responsabilidade da rota - ver server/routes/users.js.
async function readLicensePhoto(userId, lado){
  if(!LADOS.includes(lado)) return null;
  const result = await query(
    `SELECT p.storage_key, p.data_url, p.content_type
       FROM driver_license_photos p
       JOIN driver_licenses l ON l.id = p.license_id
      WHERE l.user_id = $1 AND p.lado = $2`,
    [userId, lado]
  );
  const photo = result.rows[0];
  if(!photo) return null;

  const fromDisk = readLicensePhotoFile(photo.storage_key);
  if(fromDisk){
    return { bytes:fromDisk, contentType:photo.content_type || 'application/octet-stream' };
  }
  const match = String(photo.data_url || '').match(/^data:([^;,]+);base64,(.+)$/s);
  if(!match) return null;
  return {
    bytes:Buffer.from(match[2], 'base64'),
    contentType:photo.content_type || match[1] || 'application/octet-stream'
  };
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
  LADOS,
  todayISO,
  licensePayload,
  licenseStatus,
  licenseStatusMessage,
  canDrive,
  getLicenseForUser,
  getLicensesForUsers,
  validateLicenseInput,
  saveLicenseForUser,
  removeLicense,
  readLicensePhoto
};
