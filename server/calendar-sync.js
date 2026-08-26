const { query } = require('./db');
const { getGraphAppToken } = require('./sso');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function getCalendarSyncSettings(){
  const result = await query("SELECT value FROM application_state WHERE collection_name = 'calendarSync'");
  const stored = result.rows[0] && result.rows[0].value;
  return { enabled: !!(stored && stored.enabled === true) };
}

async function resolveCalendarOwner(criadorUsuarioId){
  if(!criadorUsuarioId) return null;
  const result = await query(
    'SELECT auth_provider, email FROM users WHERE id = $1 AND deleted_at IS NULL',
    [criadorUsuarioId]
  );
  const row = result.rows[0];
  if(!row || row.auth_provider !== 'entra' || !row.email) return null;
  return row.email;
}

function buildEventPayload(reservation){
  const number = Number(reservation.numeroReserva);
  const prefix = Number.isSafeInteger(number) && number > 0 ? `#${number} · ` : '';
  const origem = reservation.partida || 'Origem';
  const destino = reservation.destino || 'Destino';
  return {
    subject:`Reserva CapriCar ${prefix}${origem} → ${destino}`,
    body:{
      contentType:'HTML',
      content:`<p>Reserva criada pelo CapriCar.</p><p>Veículo: ${reservation.carro || ''}<br>` +
        `Origem: ${origem}<br>Destino: ${destino}${reservation.motivo ? '<br>Motivo: ' + reservation.motivo : ''}</p>`
    },
    start:{ dateTime:`${reservation.dataIda}T${reservation.horarioRetirada}:00`, timeZone:'America/Sao_Paulo' },
    end:{ dateTime:`${reservation.dataVolta}T${reservation.horarioDevolucao}:00`, timeZone:'America/Sao_Paulo' },
    location:{ displayName:destino }
  };
}

async function graphRequest(method, path, body){
  const token = await getGraphAppToken();
  const response = await fetch(GRAPH_BASE + path, {
    method,
    headers:{
      Authorization:'Bearer ' + token,
      'Content-Type':'application/json'
    },
    body:body ? JSON.stringify(body) : undefined
  });
  if(response.status === 404) return null;
  if(!response.ok){
    const text = await response.text().catch(() => '');
    throw new Error('Microsoft Graph respondeu ' + response.status + ': ' + text.slice(0, 300));
  }
  if(response.status === 204) return null;
  return response.json();
}

// Ponto único chamado pela rota de sync de reservas (server/routes/reservations.js)
// após a transação do banco já ter sido confirmada — nunca deve impedir a
// criação/edição da reserva em si, cabe ao chamador isolar erros num try/catch.
async function createOrUpdateCalendarEvent(reservation, previousGraphEventId){
  const settings = await getCalendarSyncSettings();
  if(!settings.enabled) return null;
  const upn = await resolveCalendarOwner(reservation.criadorUsuarioId);
  if(!upn) return null;

  const payload = buildEventPayload(reservation);
  const encodedUpn = encodeURIComponent(upn);
  if(previousGraphEventId){
    const updated = await graphRequest(
      'PATCH', `/users/${encodedUpn}/events/${encodeURIComponent(previousGraphEventId)}`, payload
    );
    if(updated) return updated.id;
    // Evento anterior não existe mais (ex.: apagado manualmente) - cria de novo.
  }
  const created = await graphRequest('POST', `/users/${encodedUpn}/events`, payload);
  return created ? created.id : null;
}

async function deleteCalendarEvent(upn, graphEventId){
  if(!upn || !graphEventId) return;
  await graphRequest('DELETE', `/users/${encodeURIComponent(upn)}/events/${encodeURIComponent(graphEventId)}`);
}

// Usado pelo botão "Testar sincronização" da tela de Integrações - cria e
// imediatamente apaga um evento curto no calendário do administrador logado,
// confirmando que a permissão Calendars.ReadWrite foi concedida no Azure.
async function sendTestCalendarEvent(upn){
  if(!upn){
    throw new Error('Cadastre um e-mail para a sua conta antes de testar a sincronização.');
  }
  const now = new Date();
  const start = new Date(now.getTime() + 5 * 60 * 1000);
  const end = new Date(start.getTime() + 10 * 60 * 1000);
  const toLocalIso = date => date.toISOString().slice(0, 19);
  const payload = {
    subject:'CapriCar — evento de teste (pode ignorar)',
    body:{ contentType:'HTML', content:'<p>Este é um evento de teste da sincronização do CapriCar com o calendário. Pode ser apagado.</p>' },
    start:{ dateTime:toLocalIso(start), timeZone:'UTC' },
    end:{ dateTime:toLocalIso(end), timeZone:'UTC' }
  };
  const encodedUpn = encodeURIComponent(upn);
  const created = await graphRequest('POST', `/users/${encodedUpn}/events`, payload);
  if(!created) throw new Error('Não foi possível criar o evento de teste.');
  await graphRequest('DELETE', `/users/${encodedUpn}/events/${encodeURIComponent(created.id)}`);
}

module.exports = {
  getCalendarSyncSettings,
  resolveCalendarOwner,
  createOrUpdateCalendarEvent,
  deleteCalendarEvent,
  sendTestCalendarEvent
};
