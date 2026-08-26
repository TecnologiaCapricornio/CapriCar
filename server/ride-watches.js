const { query } = require('./db');
const { resolveVehicle } = require('./calendar-sync');
const { ensureNotificationsTable, insertNotification, reservationSummary } = require('./notifications');
const { getEmailReminderSettings, renderTemplate, reservationTokens, sendMail } = require('./reminders');

// Compara um monitoramento de carona (origem/destino/período, todos
// opcionais - vazio/nulo significa "qualquer") contra uma reserva recém
// criada. Função pura, sem acesso a banco, para ficar testável sozinha.
function watchMatchesReservation(watch, reservation){
  if(!watch || !reservation) return false;
  const startsOn = String(watch.startsOn || '');
  const endsOn = String(watch.endsOn || '');
  const dataIda = String(reservation.dataIda || '');
  const dataVolta = String(reservation.dataVolta || '');
  if(!startsOn || !endsOn || !dataIda || !dataVolta) return false;
  if(startsOn > dataVolta || endsOn < dataIda) return false;
  const origin = String(watch.origin || '').trim().toLowerCase();
  if(origin && origin !== String(reservation.partida || '').trim().toLowerCase()) return false;
  const destination = String(watch.destination || '').trim().toLowerCase();
  if(destination && destination !== String(reservation.destino || '').trim().toLowerCase()) return false;
  return true;
}

function watchRowToObject(row){
  return {
    id:row.id,
    userId:String(row.user_id),
    origin:row.origin || '',
    destination:row.destination || '',
    startsOn:row.starts_on instanceof Date ? row.starts_on.toISOString().slice(0, 10) : String(row.starts_on),
    endsOn:row.ends_on instanceof Date ? row.ends_on.toISOString().slice(0, 10) : String(row.ends_on)
  };
}

// Roda só na criação de uma reserva nova (nunca em edição), dentro da
// mesma transação da reserva - avisa no portal quem monitora uma rota
// compatível. Só considera reservas com pelo menos uma vaga além do
// motorista (capacidade > 1), já que uma reserva recém-criada ainda não
// tem passageiros. Devolve os watches batidos, para o chamador disparar
// os e-mails depois (fora da transação - ver sendRideWatchMatchEmails).
async function notifyRideWatchMatches(client, reservation, actor){
  const vehicle = await resolveVehicle(reservation.carro, reservation.partida);
  if(!vehicle || Number(vehicle.capacity) <= 1) return [];

  const result = await client.query(
    `SELECT id, user_id, origin, destination, starts_on, ends_on
       FROM ride_watches
      WHERE active = TRUE AND user_id <> $1`,
    [actor.id]
  );
  const watches = result.rows.map(watchRowToObject);
  const matches = watches.filter(watch => watchMatchesReservation(watch, reservation));
  if(!matches.length) return [];

  await ensureNotificationsTable(client);
  const summary = reservationSummary(reservation);
  for(const watch of matches){
    await insertNotification(client, {
      userId:watch.userId,
      type:'ride_watch_match',
      title:'Uma carona que você monitora apareceu!',
      message:`${actor.nome} criou uma reserva em ${summary.route}, com saída prevista para ` +
        `${summary.when || 'a data informada'} — ela está disponível para carona.`,
      reservationId:String(reservation.id || ''),
      dedupeKey:`ride-watch:${watch.id}:${reservation.id}`,
      metadata:{ route:summary.route, scheduledAt:summary.when, watchId:watch.id }
    });
  }
  return matches;
}

// Dispara os e-mails dos watches batidos, depois que a transação já foi
// confirmada e a resposta já foi enviada - mesmo padrão de
// sendPassengerJoinedEmail (server/reminders.js). Nunca deve interromper
// o fluxo de sincronização da reserva: erros só vão para o console.
async function sendRideWatchMatchEmails(reservation, matches){
  if(!Array.isArray(matches) || !matches.length) return;
  const settings = await getEmailReminderSettings();
  const config = settings.rideWatchMatch;
  if(!config || !config.enabled) return;
  const vehicle = await resolveVehicle(reservation.carro, reservation.partida);
  const tokens = reservationTokens(reservation, vehicle);
  for(const watch of matches){
    try{
      const userResult = await query('SELECT email, display_name FROM users WHERE id = $1', [watch.userId]);
      const user = userResult.rows[0];
      if(!user || !user.email) continue;
      const mergedTokens = { ...tokens, nome:user.display_name };
      const subject = renderTemplate(config.subject, mergedTokens);
      const html = renderTemplate(config.body, mergedTokens);
      await sendMail({ to:user.email, subject, html });
    }catch(error){
      console.error('Falha ao enviar e-mail de carona monitorada:', error.message);
    }
  }
}

module.exports = { watchMatchesReservation, notifyRideWatchMatches, sendRideWatchMatchEmails };
