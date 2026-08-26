const { query } = require('./db');
const { listAllReservations } = require('./reservations-store');
const { sendMail } = require('./mailer');
const {
  reservationStart,
  reservationEnd,
  reservationIsCompleted,
  resolveReservationUsers
} = require('./notifications');

const REMINDER_TYPES = {
  reservationUpcoming:{ dedupePrefix:'email:upcoming' },
  pickupOverdue:{ dedupePrefix:'email:pickup-overdue' },
  returnOverdue:{ dedupePrefix:'email:return-overdue' }
};

const DEFAULT_TEMPLATES = {
  reservationUpcoming:{
    enabled:false,
    subject:'Lembrete: sua reserva {{numeroReserva}} começa em breve',
    body:'<p>Olá, {{nome}}.</p><p>Sua reserva {{numeroReserva}} de {{origem}} para {{destino}} começa em {{dataIda}} às {{horarioRetirada}}.</p>'
  },
  pickupOverdue:{
    enabled:false,
    subject:'Retirada pendente — reserva {{numeroReserva}}',
    body:'<p>Olá, {{nome}}.</p><p>A retirada do veículo da reserva {{numeroReserva}} ({{origem}} → {{destino}}) estava prevista para {{dataIda}} às {{horarioRetirada}} e ainda não foi registrada.</p>'
  },
  returnOverdue:{
    enabled:false,
    subject:'Devolução pendente — reserva {{numeroReserva}}',
    body:'<p>Olá, {{nome}}.</p><p>A devolução do veículo da reserva {{numeroReserva}} ({{origem}} → {{destino}}) estava prevista para {{dataVolta}} às {{horarioDevolucao}} e ainda não foi registrada.</p>'
  }
};

async function getEmailReminderSettings(){
  const result = await query("SELECT value FROM application_state WHERE collection_name = 'emailReminders'");
  const stored = (result.rows[0] && result.rows[0].value) || {};
  return {
    reservationUpcoming:{ ...DEFAULT_TEMPLATES.reservationUpcoming, ...(stored.reservationUpcoming || {}) },
    pickupOverdue:{ ...DEFAULT_TEMPLATES.pickupOverdue, ...(stored.pickupOverdue || {}) },
    returnOverdue:{ ...DEFAULT_TEMPLATES.returnOverdue, ...(stored.returnOverdue || {}) }
  };
}

function renderTemplate(template, tokens){
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? String(tokens[key]) : match
  );
}

function reservationTokens(reservation){
  return {
    numeroReserva:reservation.numeroReserva || reservation.id,
    origem:reservation.partida || '',
    destino:reservation.destino || '',
    dataIda:reservation.dataIda || '',
    horarioRetirada:reservation.horarioRetirada || '',
    dataVolta:reservation.dataVolta || '',
    horarioDevolucao:reservation.horarioDevolucao || ''
  };
}

// Espelha reminderTypesForReservation (notifications.js), mas centrado na
// reserva (varre todos os usuarios, nao um so sob demanda) e adiciona o
// tipo de devolucao pendente, que nao existe no canal de notificacoes
// internas do sininho.
function pendingReminders(reservation, now){
  if(reservationIsCompleted(reservation)) return [];
  const startsAt = reservationStart(reservation);
  const endsAt = reservationEnd(reservation);
  const pickupDone = !!(reservation.operacao && reservation.operacao.retirada);
  const returnDone = !!(reservation.operacao && reservation.operacao.devolucao);
  const types = [];
  if(startsAt != null){
    const remaining = startsAt - now;
    if(remaining > 0 && remaining <= 24 * 60 * 60 * 1000){
      types.push({ type:'reservationUpcoming', creatorOnly:false });
    }
    if(remaining <= 0 && !pickupDone){
      types.push({ type:'pickupOverdue', creatorOnly:true });
    }
  }
  if(endsAt != null){
    const remainingReturn = endsAt - now;
    if(remainingReturn <= 0 && pickupDone && !returnDone){
      types.push({ type:'returnOverdue', creatorOnly:true });
    }
  }
  return types;
}

async function alreadySent(userId, dedupeKey){
  const result = await query(
    "SELECT 1 FROM email_reminder_log WHERE user_id = $1 AND dedupe_key = $2 AND status = 'sent'",
    [userId, dedupeKey]
  );
  return result.rowCount > 0;
}

async function recordOutcome(userId, reminderType, reservationId, dedupeKey, status, error){
  await query(
    `INSERT INTO email_reminder_log (user_id, reminder_type, reservation_id, dedupe_key, status, error)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, dedupe_key) DO UPDATE
       SET status = EXCLUDED.status, error = EXCLUDED.error, sent_at = NOW()`,
    [userId, reminderType, reservationId, dedupeKey, status, error || null]
  );
}

async function sweepEmailReminders(){
  const settings = await getEmailReminderSettings();
  const anyEnabled = Object.values(settings).some(item => item.enabled);
  const summary = { scanned:0, sent:0, skipped:0, failed:0 };
  if(!anyEnabled) return summary;

  const reservations = await listAllReservations();
  const now = Date.now();

  for(const reservation of reservations){
    const pending = pendingReminders(reservation, now);
    if(!pending.length) continue;
    summary.scanned++;

    for(const item of pending){
      const config = settings[item.type];
      if(!config.enabled){ summary.skipped++; continue; }

      const recipientIds = await resolveReservationUsers({ query }, reservation, true);
      const targets = item.creatorOnly
        ? recipientIds.filter(id => String(id) === String(reservation.criadorUsuarioId))
        : recipientIds;
      if(!targets.length){ summary.skipped++; continue; }

      const tokens = reservationTokens(reservation);

      for(const userId of targets){
        const userResult = await query('SELECT id, email, display_name FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];
        if(!user || !user.email){ summary.skipped++; continue; }

        const dedupeKey = `${REMINDER_TYPES[item.type].dedupePrefix}:${reservation.id}`;
        if(await alreadySent(user.id, dedupeKey)){ summary.skipped++; continue; }

        const subject = renderTemplate(config.subject, { ...tokens, nome:user.display_name });
        const html = renderTemplate(config.body, { ...tokens, nome:user.display_name });

        try{
          await sendMail({ to:user.email, subject, html });
          await recordOutcome(user.id, item.type, String(reservation.id), dedupeKey, 'sent', null);
          summary.sent++;
        }catch(error){
          await recordOutcome(user.id, item.type, String(reservation.id), dedupeKey, 'failed', error.message);
          summary.failed++;
        }
      }
    }
  }

  return summary;
}

module.exports = { sweepEmailReminders, getEmailReminderSettings, DEFAULT_TEMPLATES };
