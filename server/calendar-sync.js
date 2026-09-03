const { query } = require('./db');
const { getGraphAppToken } = require('./sso');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function getCalendarSyncSettings() {
  const result = await query("SELECT value FROM application_state WHERE collection_name = 'calendarSync'");
  const stored = result.rows[0] && result.rows[0].value;
  return { enabled: !!(stored && stored.enabled === true) };
}

// Devolve o e-mail corporativo de um usuário só quando ele fez login via
// Entra ID (a única forma de sabermos que o e-mail é real e verificado) -
// usado tanto para o dono do evento quanto para convidar passageiros.
async function resolveEntraEmail(userId) {
  if (!userId) return null;
  const result = await query(
    'SELECT auth_provider, email, display_name FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId]
  );
  const row = result.rows[0];
  if (!row || row.auth_provider !== 'entra' || !row.email) return null;
  return { email: row.email, name: row.display_name || row.email };
}

async function resolveCalendarOwner(criadorUsuarioId) {
  const resolved = await resolveEntraEmail(criadorUsuarioId);
  return resolved ? resolved.email : null;
}

// Passageiros nomeados (com usuarioId vinculado) que também têm conta
// corporativa via Entra ID viram convidados do evento - assim recebem o
// compromisso na própria agenda do Outlook, não só uma menção no corpo do
// e-mail. Passageiros externos ou sem conta vinculada continuam listados
// apenas no texto do evento (buildEventPayload).
async function resolveAttendees(reservation) {
  const passageiros = Array.isArray(reservation.passageiros) ? reservation.passageiros : [];
  const userIds = [...new Set(
    passageiros
      .map(passageiro => passageiro && passageiro.usuarioId)
      .filter(userId => userId && String(userId) !== String(reservation.criadorUsuarioId || ''))
      .map(String)
  )];
  if (!userIds.length) return [];
  const result = await query(
    `SELECT email, display_name FROM users
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
        AND auth_provider = 'entra' AND email IS NOT NULL AND email <> ''`,
    [userIds]
  );
  return result.rows.map(row => ({
    emailAddress: { address: row.email, name: row.display_name || row.email },
    type: 'required'
  }));
}

async function resolveVehicle(car, branch) {
  if (!car || !branch) return null;
  const result = await query(
    `SELECT v.code, v.plate, v.brand, v.model, v.capacity
       FROM vehicles v
       JOIN branches b ON b.id = v.branch_id
      WHERE LOWER(b.name) = LOWER($1) AND LOWER(v.code) = LOWER($2)`,
    [branch, car]
  );
  return result.rows[0] || null;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEventPayload(reservation, attendees) {
  const number = Number(reservation.numeroReserva);
  const prefix = Number.isSafeInteger(number) && number > 0 ? `#${number} · ` : '';
  const origem = reservation.partida || 'Origem';
  const destino = reservation.destino || 'Destino';
  const passageiros = Array.isArray(reservation.passageiros) ? reservation.passageiros : [];
  let passageirosHtml = '';
  passageiros.forEach((passageiro) => {
    if (passageiro && passageiro.nome) {
      passageirosHtml += `<li>${escapeHtml(passageiro.nome)}</li>`;
    }
  });
  const passageirosDescricao = passageirosHtml
    ? `<br>Passageiros confirmados:<ul>${passageirosHtml}</ul><br>`
    : '';
  return {
    subject: `Reserva CapriCar ${prefix}${origem} → ${destino}`,
    body: {
      contentType: 'HTML',
      content: `<p>Reserva ${prefix}${origem} → ${destino}<br><br>` +
        `Veículo: ${reservation.carro || ''} - Placa: ${reservation.placa || ''}<br>` +
        `Origem: ${origem}<br>Destino: ${destino} ${reservation.motivo ? '<br>Motivo: ' + reservation.motivo : ''}<br>` +
        `${passageirosDescricao || ''}` +
        `Retirada: ${reservation.dataIda} às ${reservation.horarioRetirada}<br>` +
        `Devolução: ${reservation.dataVolta} às ${reservation.horarioDevolucao}</p>`
    },
    start: { dateTime: `${reservation.dataIda}T${reservation.horarioRetirada}:00`, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: `${reservation.dataVolta}T${reservation.horarioDevolucao}:00`, timeZone: 'America/Sao_Paulo' },
    location: { displayName: destino },
    attendees: Array.isArray(attendees) ? attendees : [],
    // A reserva do carro não deve travar a agenda de quem convida para uma
    // reunião de verdade nesse período - o evento é só um lembrete visual.
    showAs: 'free'
  };
}

async function graphRequest(method, path, body) {
  const token = await getGraphAppToken();
  const response = await fetch(GRAPH_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error('Microsoft Graph respondeu ' + response.status + ': ' + text.slice(0, 300));
  }
  if (response.status === 204) return null;
  return response.json();
}

// Ponto único chamado pela rota de sync de reservas (server/routes/reservations.js)
// após a transação do banco já ter sido confirmada — nunca deve impedir a
// criação/edição da reserva em si, cabe ao chamador isolar erros num try/catch.
async function createOrUpdateCalendarEvent(reservation, previousGraphEventId) {
  const settings = await getCalendarSyncSettings();
  if (!settings.enabled) return null;
  const upn = await resolveCalendarOwner(reservation.criadorUsuarioId);
  if (!upn) return null;

  const vehicle = await resolveVehicle(reservation.carro, reservation.partida);
  const attendees = await resolveAttendees(reservation);
  const payload = buildEventPayload({
    ...reservation,
    carro: vehicle ? `${vehicle.brand} ${vehicle.model}`.trim() : reservation.carro,
    placa: vehicle ? vehicle.plate : reservation.placa
  }, attendees);
  const encodedUpn = encodeURIComponent(upn);
  if (previousGraphEventId) {
    const updated = await graphRequest(
      'PATCH', `/users/${encodedUpn}/events/${encodeURIComponent(previousGraphEventId)}`, payload
    );
    if (updated) return updated.id;
    // Evento anterior não existe mais (ex.: apagado manualmente) - cria de novo.
  }
  const created = await graphRequest('POST', `/users/${encodedUpn}/events`, payload);
  return created ? created.id : null;
}

async function deleteCalendarEvent(upn, graphEventId) {
  if (!upn || !graphEventId) return;
  await graphRequest('DELETE', `/users/${encodeURIComponent(upn)}/events/${encodeURIComponent(graphEventId)}`);
}

// Usado pelo botão "Testar sincronização" da tela de Integrações - cria e
// imediatamente apaga um evento curto no calendário do administrador logado,
// confirmando que a permissão Calendars.ReadWrite foi concedida no Azure.
async function sendTestCalendarEvent(upn) {
  if (!upn) {
    throw new Error('Cadastre um e-mail para a sua conta antes de testar a sincronização.');
  }
  const now = new Date();
  const start = new Date(now.getTime() + 5 * 60 * 1000);
  const end = new Date(start.getTime() + 10 * 60 * 1000);
  const toLocalIso = date => date.toISOString().slice(0, 19);
  const payload = {
    subject: 'CapriCar — evento de teste (pode ignorar)',
    body: { contentType: 'HTML', content: '<p>Este é um evento de teste da sincronização do CapriCar com o calendário. Pode ser apagado.</p>' },
    start: { dateTime: toLocalIso(start), timeZone: 'UTC' },
    end: { dateTime: toLocalIso(end), timeZone: 'UTC' }
  };
  const encodedUpn = encodeURIComponent(upn);
  const created = await graphRequest('POST', `/users/${encodedUpn}/events`, payload);
  if (!created) throw new Error('Não foi possível criar o evento de teste.');
  await graphRequest('DELETE', `/users/${encodedUpn}/events/${encodeURIComponent(created.id)}`);
}

module.exports = {
  getCalendarSyncSettings,
  resolveCalendarOwner,
  resolveVehicle,
  buildEventPayload,
  createOrUpdateCalendarEvent,
  deleteCalendarEvent,
  sendTestCalendarEvent
};
