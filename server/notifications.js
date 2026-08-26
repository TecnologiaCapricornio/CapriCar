const { query } = require('./db');
const { listReservationsForUser } = require('./reservations-store');

let notificationSchemaReady;

function ensureNotificationsTable(executor){
  const run = executor && typeof executor.query === 'function'
    ? executor.query.bind(executor)
    : query;
  if(executor){
    return run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type VARCHAR(40) NOT NULL,
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        reservation_id TEXT,
        dedupe_key VARCHAR(240) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, dedupe_key)
      )
    `).then(() => run(`
      CREATE INDEX IF NOT EXISTS notifications_user_created_idx
        ON notifications (user_id, created_at DESC)
    `));
  }
  if(!notificationSchemaReady){
    notificationSchemaReady = run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type VARCHAR(40) NOT NULL,
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        reservation_id TEXT,
        dedupe_key VARCHAR(240) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, dedupe_key)
      )
    `).then(() => run(`
      CREATE INDEX IF NOT EXISTS notifications_user_created_idx
        ON notifications (user_id, created_at DESC)
    `)).catch(error => {
      notificationSchemaReady = null;
      throw error;
    });
  }
  return notificationSchemaReady;
}

function normalizeName(value){
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function reservationStart(reservation){
  const date = String(reservation && reservation.dataIda || '');
  const time = String(reservation && reservation.horarioRetirada || '');
  const value = Date.parse(`${date}T${time}:00-03:00`);
  return Number.isFinite(value) ? value : null;
}

function reservationEnd(reservation){
  const date = String(reservation && reservation.dataVolta || '');
  const time = String(reservation && reservation.horarioDevolucao || '');
  const value = Date.parse(`${date}T${time}:00-03:00`);
  return Number.isFinite(value) ? value : null;
}

function reservationIsCompleted(reservation){
  const status = normalizeName(reservation && reservation.status)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return !!(reservation && reservation.operacao && reservation.operacao.devolucao) ||
    ['concluida', 'cancelada', 'completed', 'cancelled', 'encerrada_administrativamente'].includes(status);
}

function reservationSummary(reservation){
  const start = reservationStart(reservation);
  const when = start == null ? '' : new Intl.DateTimeFormat('pt-BR', {
    timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  }).format(new Date(start));
  const number = Number(reservation && reservation.numeroReserva);
  const prefix = Number.isSafeInteger(number) && number > 0 ? `#${number} · ` : '';
  const route = `${prefix}${reservation.partida || 'Origem'} → ${reservation.destino || 'Destino'}`;
  return { route, when };
}

async function resolveReservationUsers(client, reservation, includeCreator){
  const ids = [];
  const names = [];
  if(includeCreator){
    if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(reservation.criadorUsuarioId || ''))){
      ids.push(String(reservation.criadorUsuarioId));
    }
    if(reservation.nome) names.push(normalizeName(reservation.nome));
  }
  (Array.isArray(reservation.passageiros) ? reservation.passageiros : []).forEach(passenger => {
    if(passenger && passenger.usuarioId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(passenger.usuarioId))){
      ids.push(String(passenger.usuarioId));
    }
    if(passenger && passenger.nome && passenger.externo !== true){
      names.push(normalizeName(passenger.nome));
    }
  });
  if(!ids.length && !names.length) return [];
  const result = await client.query(
    `SELECT id FROM users
      WHERE active = TRUE AND deleted_at IS NULL
        AND (id = ANY($1::uuid[]) OR LOWER(display_name) = ANY($2::text[]))`,
    [ids, names]
  );
  return [...new Set(result.rows.map(row => String(row.id)))];
}

async function resolveReservationManagers(client){
  const result = await client.query(
    `SELECT id FROM users
      WHERE active = TRUE AND deleted_at IS NULL
        AND (role = 'admin' OR can_manage_reservations = TRUE)`
  );
  return result.rows.map(row => String(row.id));
}

async function insertNotification(client, notification){
  await client.query(
    `INSERT INTO notifications
       (user_id, notification_type, title, message, reservation_id, dedupe_key, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [
      notification.userId, notification.type, notification.title, notification.message,
      notification.reservationId || null, notification.dedupeKey,
      JSON.stringify(notification.metadata || {})
    ]
  );
}

async function notifyReservationCancellation(client, reservation, actor){
  await ensureNotificationsTable(client);
  const managedCancellation = actor.role === 'admin' ||
    !!(actor.permissions && actor.permissions.reservations);
  const recipients = await resolveReservationUsers(client, reservation, managedCancellation);
  const summary = reservationSummary(reservation);
  for(const userId of recipients){
    if(String(userId) === String(actor.id)) continue;
    await insertNotification(client, {
      userId,
      type:managedCancellation ? 'admin_cancelled' : 'passenger_cancelled',
      title:managedCancellation ? 'Reserva cancelada' : 'Sua carona foi cancelada',
      message:`${summary.route}, prevista para ${summary.when || 'a data informada'}, foi cancelada por ${actor.nome}.`,
      reservationId:String(reservation.id || ''),
      dedupeKey:`cancelled:${reservation.id}`,
      metadata:{ route:summary.route, scheduledAt:summary.when, cancelledBy:actor.nome }
    });
  }
}

async function notifyReservationPassengerAdditions(client, previousReservation, reservation, actor){
  const previousIds = new Set(
    (Array.isArray(previousReservation && previousReservation.passageiros)
      ? previousReservation.passageiros
      : [])
      .map(passenger => String(passenger && passenger.usuarioId || ''))
      .filter(Boolean)
  );
  const addedPassengers = (Array.isArray(reservation && reservation.passageiros)
    ? reservation.passageiros
    : []).filter(passenger => {
    const userId = String(passenger && passenger.usuarioId || '');
    if(!userId || previousIds.has(userId)) return false;
    if(String(userId) === String(reservation.criadorUsuarioId || '')) return false;
    return normalizeName(passenger.nome) !== normalizeName(reservation.nome);
  });
  if(!addedPassengers.length) return addedPassengers;

  await ensureNotificationsTable(client);
  const validRecipients = new Set(await resolveReservationUsers(client, {
    passageiros:addedPassengers
  }, false));
  const summary = reservationSummary(reservation);
  for(const passenger of addedPassengers){
    const userId = String(passenger.usuarioId || '');
    if(!validRecipients.has(userId) || String(userId) === String(actor.id)) continue;
    await insertNotification(client, {
      userId,
      type:'passenger_added',
      title:'Você foi adicionado a uma carona',
      message:`${actor.nome} adicionou você em ${summary.route}, com saída prevista para ${summary.when || 'a data informada'}.`,
      reservationId:String(reservation.id || ''),
      dedupeKey:`passenger-added:${reservation.id}:${userId}`,
      metadata:{ route:summary.route, scheduledAt:summary.when, addedBy:actor.nome }
    });
  }

  const driverId = String(reservation.criadorUsuarioId || '');
  if(driverId && driverId !== String(actor.id)){
    const names = addedPassengers.map(passenger => passenger.nome).join(', ');
    const plural = addedPassengers.length > 1;
    await insertNotification(client, {
      userId:driverId,
      type:'passenger_joined',
      title:plural ? 'Novos passageiros na sua carona!' : 'Alguém entrou na sua carona!',
      message:`${names} ${plural ? 'entraram' : 'entrou'} em ${summary.route}, com saída prevista para ` +
        `${summary.when || 'a data informada'}. Combine os detalhes com quem está indo junto e lembre-se de ` +
        `respeitar os horários combinados na reserva — seus passageiros estão contando com isso!`,
      reservationId:String(reservation.id || ''),
      dedupeKey:`passenger-joined:${reservation.id}:${driverId}:${addedPassengers.map(passenger => passenger.usuarioId).join(',')}`,
      metadata:{ route:summary.route, scheduledAt:summary.when, passengers:names }
    });
  }

  return addedPassengers;
}

async function notifyOperationReport(client, reservation, phase, actor){
  const record = reservation && reservation.operacao && reservation.operacao[phase];
  if(!record) return;
  const hasAvarias = String(record.avarias || '').trim().length > 0;
  const photoCount = Array.isArray(record.fotos) ? record.fotos.length : 0;
  if(!hasAvarias && !photoCount) return;

  await ensureNotificationsTable(client);
  const recipients = await resolveReservationManagers(client);
  const summary = reservationSummary(reservation);
  const phaseLabel = phase === 'retirada' ? 'retirada' : 'devolução';
  const parts = [];
  if(hasAvarias) parts.push('uma observação');
  if(photoCount) parts.push(photoCount + (photoCount === 1 ? ' foto' : ' fotos'));
  const message = `${actor.nome} registrou ${parts.join(' e ')} na ${phaseLabel} de ${summary.route}.`;

  for(const userId of recipients){
    if(String(userId) === String(actor.id)) continue;
    await insertNotification(client, {
      userId,
      type:'operation_report',
      title:'Avaria ou foto registrada',
      message,
      reservationId:String(reservation.id || ''),
      dedupeKey:`operation-report:${reservation.id}:${phase}`,
      metadata:{ route:summary.route, phase, hasAvarias, photoCount }
    });
  }
}

function userParticipates(reservation, user){
  if(String(reservation.criadorUsuarioId || '') === String(user.id)) return true;
  const userName = normalizeName(user.nome);
  if(normalizeName(reservation.nome) === userName) return true;
  return (Array.isArray(reservation.passageiros) ? reservation.passageiros : []).some(passenger =>
    String(passenger && passenger.usuarioId || '') === String(user.id) ||
    (passenger && passenger.externo !== true && normalizeName(passenger.nome) === userName)
  );
}

function userOwnsReservation(reservation, user){
  return String(reservation.criadorUsuarioId || '') === String(user.id) ||
    normalizeName(reservation.nome) === normalizeName(user.nome);
}

function reminderTypesForReservation(reservation, user, now){
  if(reservationIsCompleted(reservation) || !userParticipates(reservation, user)) return [];
  const startsAt = reservationStart(reservation);
  if(startsAt == null) return [];
  const remaining = startsAt - now;
  const types = [];
  if(remaining > 0 && remaining <= 24 * 60 * 60 * 1000){
    types.push('reservation_upcoming');
  }
  if(remaining <= 0 && userOwnsReservation(reservation, user) &&
    !(reservation.operacao && reservation.operacao.retirada)){
    types.push('pickup_overdue');
  }
  return types;
}

async function generateUserReminders(user){
  await ensureNotificationsTable();
  const reservations = await listReservationsForUser(user);
  const now = Date.now();
  for(const reservation of reservations){
    const startsAt = reservationStart(reservation);
    if(startsAt == null) continue;
    const summary = reservationSummary(reservation);
    const reminderTypes = reminderTypesForReservation(reservation, user, now);
    if(reminderTypes.includes('reservation_upcoming')){
      await insertNotification({ query }, {
        userId:user.id,
        type:'reservation_upcoming',
        title:'Sua reserva está próxima',
        message:`${summary.route} começa em ${summary.when}.`,
        reservationId:String(reservation.id || ''),
        dedupeKey:`upcoming-24h:${reservation.id}`,
        metadata:{ route:summary.route, scheduledAt:summary.when }
      });
    }
    if(reminderTypes.includes('pickup_overdue')){
      await insertNotification({ query }, {
        userId:user.id,
        type:'pickup_overdue',
        title:'Retirada do veículo pendente',
        message:`A retirada de ${summary.route} estava prevista para ${summary.when}. Registre a retirada.`,
        reservationId:String(reservation.id || ''),
        dedupeKey:`pickup-overdue:${reservation.id}`,
        metadata:{ route:summary.route, scheduledAt:summary.when }
      });
    }
  }
}

module.exports = {
  ensureNotificationsTable,
  generateUserReminders,
  notifyReservationCancellation,
  notifyReservationPassengerAdditions,
  notifyOperationReport,
  resolveReservationManagers,
  reminderTypesForReservation,
  reservationStart,
  reservationEnd,
  reservationIsCompleted,
  reservationSummary,
  resolveReservationUsers,
  userParticipates,
  userOwnsReservation,
  normalizeName
};
