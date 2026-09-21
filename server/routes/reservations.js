const express = require('express');
const { query, withTransaction } = require('../db');
const { validateCollection } = require('../validation');
const {
  canViewAllReservations,
  listReservationsForUser,
  listAllReservations,
  persistReservation,
  cancelReservation,
  getReservationGraphEventIds,
  getPhotoForUser,
  normalizeName,
  updateOperationChecklist,
  setChecklistArchived
} = require('../reservations-store');
const { readPhotoFile } = require('../photo-storage');
const { requirePermission } = require('../auth');
const {
  notifyReservationCancellation,
  notifyReservationPassengerAdditions,
  notifyReservationPassengerRemovals,
  notifyOperationReport,
  notifyOdometerDiscrepancy
} = require('../notifications');
const { createOrUpdateCalendarEvent, deleteCalendarEvent, resolveCalendarOwner } = require('../calendar-sync');
const { sendPassengerJoinedEmail, sendPassengerRemovalEmail, notifyDriverLicenseOnReservation } = require('../reminders');
const { notifyRideWatchMatches, sendRideWatchMatchEmails } = require('../ride-watches');
const { getLicensesForUsers } = require('../driver-licenses');

const router = express.Router();

function ownsReservation(reservation, user){
  return String(reservation && reservation.criadorUsuarioId || '') === String(user.id);
}

function passengerKey(passenger){
  const userId = String(passenger && passenger.usuarioId || '').trim();
  if(userId) return `user:${userId}`;
  return `${passenger && passenger.externo === true ? 'external' : 'name'}:${normalizeName(passenger && passenger.nome)}`;
}

function passengersWithoutUser(reservation, user){
  return (Array.isArray(reservation && reservation.passageiros) ? reservation.passageiros : [])
    .filter(passenger => String(passenger && passenger.usuarioId || '') !== String(user.id))
    .map(passengerKey)
    .sort();
}

function mergePassengerOnlyChange(current, incoming, user){
  if(JSON.stringify(passengersWithoutUser(current, user)) !== JSON.stringify(passengersWithoutUser(incoming, user))){
    throw Object.assign(new Error('Você só pode entrar ou sair da carona em seu próprio nome.'), { status:403 });
  }
  return { ...current, passageiros:incoming.passageiros };
}

const PASSENGER_ONLY_PROTECTED_FIELDS = [
  'nome', 'criadorUsuarioId', 'partida', 'carro', 'destino', 'dataIda', 'dataVolta',
  'horarioRetirada', 'horarioDevolucao', 'motivo', 'email', 'responsavel', 'operacao',
  'status', 'encerramentoAdministrativo', 'passageirosConfirmados'
];

function rejectPassengerPrivateChanges(current, incoming){
  for(const field of PASSENGER_ONLY_PROTECTED_FIELDS){
    if(Object.prototype.hasOwnProperty.call(incoming, field) &&
      JSON.stringify(incoming[field]) !== JSON.stringify(current[field])){
      throw Object.assign(new Error('VocÃª nÃ£o pode alterar os dados privados de uma reserva de outro usuÃ¡rio.'), { status:403 });
    }
  }
}

// Mensagem opcional de quem removeu (ou de quem saiu da carona). Vai parar
// numa notificação e num e-mail HTML, então não pode confiar no cliente:
// tira marcação, caracteres de controle e limita o tamanho.
function sanitizeRemovalReason(value){
  return String(value == null ? '' : value)
    .replace(/[<>]/g, '')
    // Remove caracteres de controle, mas preserva quebra de linha e tabulacao:
    // o campo e multilinha e a mensagem pode ter mais de um paragrafo.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, 300);
}

// Igual à checagem que já existia pra "após a retirada, só a devolução/
// encerramento pode mudar" (ver stripMutableOperation logo abaixo), mas pra
// quem NÃO é dono nem manager: só tem permissão de tocar em operacao/status,
// nada mais - nenhum outro campo da reserva pode vir diferente.
function mergeOperationOnlyChange(current, incoming){
  const stripOperation = value => {
    const clone = JSON.parse(JSON.stringify(value));
    delete clone.operacao;
    delete clone.status;
    return clone;
  };
  if(JSON.stringify(stripOperation(current)) !== JSON.stringify(stripOperation(incoming))){
    throw Object.assign(new Error('Você só pode registrar a retirada ou a devolução desta reserva.'), { status:403 });
  }
  const currentOp = current.operacao || {};
  const incomingOp = incoming.operacao || {};
  if(!currentOp.retirada){
    if(!incomingOp.retirada || incomingOp.devolucao){
      throw Object.assign(new Error('Registre a retirada antes da devolução.'), { status:409 });
    }
  }else if(!currentOp.devolucao){
    if(JSON.stringify(incomingOp.retirada || null) !== JSON.stringify(currentOp.retirada || null)){
      throw Object.assign(new Error('A retirada já registrada não pode ser alterada por aqui.'), { status:409 });
    }
    if(!incomingOp.devolucao){
      throw Object.assign(new Error('Nenhuma retirada ou devolução pendente para registrar.'), { status:409 });
    }
  }else{
    throw Object.assign(new Error('Esta reserva já foi concluída.'), { status:409 });
  }
  return { ...current, operacao:incomingOp, status:incoming.status };
}

function sanitizeIncoming(current, incoming, user, manager, canOperateOthers){
  if(!current){
    if(!manager){
      if(incoming.criadorUsuarioId && String(incoming.criadorUsuarioId) !== String(user.id)){
        throw Object.assign(new Error('A reserva deve pertencer ao usuário autenticado.'), { status:403 });
      }
      return { ...incoming, criadorUsuarioId:String(user.id), nome:user.nome };
    }
    return incoming;
  }
  if(!manager && !ownsReservation(current, user)){
    // Permissão "Checklist": só entra aqui quando o pedido realmente tenta
    // mudar operacao (ver comentário na permissão) - uma pessoa dessas ainda
    // pode entrar/sair de carona como qualquer outra, então isso não pode
    // "sequestrar" o fluxo de passageiro abaixo.
    if(canOperateOthers && JSON.stringify(incoming.operacao || null) !== JSON.stringify(current.operacao || null)){
      return mergeOperationOnlyChange(current, incoming);
    }
    rejectPassengerPrivateChanges(current, incoming);
    if(current.operacao && current.operacao.retirada){
      throw Object.assign(new Error('Não é mais possível alterar passageiros após a retirada.'), { status:409 });
    }
    return mergePassengerOnlyChange(current, incoming, user);
  }
  if(!manager && current.criadorUsuarioId &&
    String(incoming.criadorUsuarioId || current.criadorUsuarioId) !== String(current.criadorUsuarioId)){
    throw Object.assign(new Error('O criador da reserva não pode ser alterado.'), { status:403 });
  }
  if(current.operacao && current.operacao.devolucao){
    throw Object.assign(new Error('Uma reserva concluída não pode mais ser alterada.'), { status:409 });
  }
  if(String(current.status) === 'encerrada_administrativamente'){
    throw Object.assign(new Error('Uma reserva encerrada pela gestão não pode mais ser alterada.'), { status:409 });
  }
  if(current.operacao && current.operacao.retirada){
    const preserved = { ...incoming, operacao:{ ...incoming.operacao, retirada:current.operacao.retirada } };
    const stripMutableOperation = value => {
      const clone = JSON.parse(JSON.stringify(value));
      if(clone.operacao) delete clone.operacao.devolucao;
      delete clone.status;
      delete clone.encerramentoAdministrativo;
      return clone;
    };
    if(JSON.stringify(stripMutableOperation(current)) !== JSON.stringify(stripMutableOperation(preserved))){
      throw Object.assign(new Error('Após a retirada, somente a devolução ou o encerramento administrativo pode ser registrado.'), { status:409 });
    }
    return preserved;
  }
  return { ...incoming, criadorUsuarioId:current.criadorUsuarioId, nome:manager ? incoming.nome : current.nome };
}

async function validationContext(client, driverIds){
  const state = await client.query(
    `SELECT collection_name, value FROM application_state
      WHERE collection_name IN ('vehicles','blocks','rules')`
  );
  const values = Object.fromEntries(state.rows.map(row => [row.collection_name, row.value]));
  // Só busca a CNH de quem aparece como motorista no lote - a checagem de
  // categoria x capacidade (server/validation.js) usa isso por
  // criadorUsuarioId; sem conta vinculada, essa checagem é pulada (ver
  // comentário lá).
  const licensesByUserId = await getLicensesForUsers(driverIds || []);
  return {
    vehicles:Array.isArray(values.vehicles) ? values.vehicles : [],
    blocks:Array.isArray(values.blocks) ? values.blocks : [],
    rules:values.rules || {},
    licensesByUserId
  };
}

// Odômetro do veículo ANTES desta sincronização (context.vehicles foi lido no
// início da transação, antes de qualquer retirada/devolução deste lote ser
// persistida) - é o valor "esperado" mostrado na notificação de divergência.
function vehicleOdometerFor(context, reservation){
  const vehicle = (context.vehicles || []).find(item =>
    normalizeName(item.local) === normalizeName(reservation.partida) &&
    normalizeName(item.codigo) === normalizeName(reservation.carro)
  );
  const value = Number(vehicle && vehicle.odometroAtual);
  return Number.isFinite(value) ? value : null;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ reservations:await listReservationsForUser(req.user) });
});

router.post('/sync', async (req, res) => {
  const changes = Array.isArray(req.body && req.body.changes) ? req.body.changes : [];
  if(!changes.length || changes.length > 100){
    return res.status(400).json({ error:'Nenhuma alteração de reserva válida foi informada.' });
  }
  const manager = canViewAllReservations(req.user) &&
    (req.user.role === 'admin' || !!(req.user.permissions && req.user.permissions.reservations));
  // Permissão "Checklist": além de revisar/aprovar/editar (rota PATCH
  // .../checklist), também dá acesso a registrar a retirada ou devolução em
  // nome de outra pessoa - não dá acesso de manager (não pode editar/cancelar
  // reserva de outra pessoa), só permite mudar operacao.retirada/devolucao,
  // ver mergeOperationOnlyChange acima.
  const canOperateOthers = req.user.role === 'admin' ||
    !!(req.user.permissions && req.user.permissions.checklist);
  const calendarSyncTasks = [];
  const passengerJoinedEmailTasks = [];
  const passengerRemovedEmailTasks = [];
  const rideWatchEmailTasks = [];
  const cnhReminderTasks = [];

  await withTransaction(async client => {
    const current = await listAllReservations(client);
    const currentById = new Map(current.map(item => [String(item.id), item]));
    const nextById = new Map(currentById);
    const prepared = [];

    for(const change of changes){
      const type = String(change && change.type || '');
      const id = String(change && (change.id || change.reservation && change.reservation.id) || '');
      const previous = currentById.get(id) || null;
      if(type === 'delete'){
        if(!previous) continue;
        if(!manager && !ownsReservation(previous, req.user)){
          throw Object.assign(new Error('Você não pode cancelar a reserva de outro usuário.'), { status:403 });
        }
        if(previous.operacao && previous.operacao.retirada){
          throw Object.assign(new Error('Não é possível cancelar uma reserva após a retirada.'), { status:409 });
        }
        nextById.delete(id);
        prepared.push({ type, id, previous });
        continue;
      }
      if(type !== 'upsert' || !change.reservation || typeof change.reservation !== 'object'){
        throw Object.assign(new Error('Alteração de reserva inválida.'), { status:400 });
      }
      const reservation = sanitizeIncoming(previous, change.reservation, req.user, manager, canOperateOthers);
      nextById.set(String(reservation.id), reservation);
      prepared.push({
        type, previous, reservation,
        motivoRemocao:sanitizeRemovalReason(change.motivoRemocao)
      });
    }

    const next = [...nextById.values()];
    const driverIds = next.map(reservation => reservation.criadorUsuarioId).filter(Boolean);
    const context = await validationContext(client, driverIds);
    validateCollection('reservations', next, {
      ...context,
      currentReservations:current
    });

    const graphEventIds = await getReservationGraphEventIds(
      client,
      prepared.map(change => change.type === 'delete' ? change.id : change.reservation.id)
    );

    for(const change of prepared){
      if(change.type === 'delete'){
        const graphEventId = graphEventIds.get(change.id) || null;
        await notifyReservationCancellation(client, change.previous, req.user);
        await cancelReservation(client, change.id, req.user);
        await client.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
           VALUES ($1, 'cancelou', 'reserva', $2, $3::jsonb)`,
          [req.user.id, change.id, JSON.stringify({
            description:`Reserva #${change.previous.numeroReserva || change.id} cancelada`
          })]
        );
        if(graphEventId){
          calendarSyncTasks.push({
            type:'delete',
            graphEventId,
            criadorUsuarioId:change.previous.criadorUsuarioId
          });
        }
      }else{
        const previousGraphEventId = graphEventIds.get(change.reservation.id) || null;
        const addedPassengers = await notifyReservationPassengerAdditions(client, change.previous, change.reservation, req.user);
        if(addedPassengers && addedPassengers.length && String(change.reservation.criadorUsuarioId || '') !== String(req.user.id)){
          passengerJoinedEmailTasks.push({ reservation:change.reservation, addedPassengers });
        }
        const removalTasks = await notifyReservationPassengerRemovals(
          client, change.previous, change.reservation, req.user, change.motivoRemocao
        );
        for(const task of removalTasks){
          passengerRemovedEmailTasks.push({ ...task, reservation:change.reservation });
        }
        const saved = await persistReservation(client, change.reservation, req.user);
        if(!change.previous){
          const numberedReservation = { ...change.reservation, numeroReserva:saved.reservationNumber };
          const matches = await notifyRideWatchMatches(client, numberedReservation, req.user);
          if(matches.length) rideWatchEmailTasks.push({ reservation:numberedReservation, matches });
        }
        await notifyOperationReport(client, change.reservation, 'retirada', req.user);
        await notifyOperationReport(client, change.reservation, 'devolucao', req.user);
        const retiradaRecord = change.reservation.operacao && change.reservation.operacao.retirada;
        if(retiradaRecord && retiradaRecord.quilometragemDivergente === true){
          const esperado = vehicleOdometerFor(context, change.reservation);
          if(esperado != null){
            await notifyOdometerDiscrepancy(
              client, change.reservation, 'retirada', req.user, Number(retiradaRecord.quilometragem), esperado
            );
          }
        }
        const devolucaoRecord = change.reservation.operacao && change.reservation.operacao.devolucao;
        if(devolucaoRecord && devolucaoRecord.quilometragemDivergente === true && retiradaRecord){
          await notifyOdometerDiscrepancy(
            client, change.reservation, 'devolucao', req.user,
            Number(devolucaoRecord.quilometragem), Number(retiradaRecord.quilometragem)
          );
        }
        await client.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
           VALUES ($1, $2, 'reserva', $3, $4::jsonb)`,
          [req.user.id, change.previous ? 'editou' : 'criou', saved.legacyId, JSON.stringify({
            description:`Reserva #${saved.reservationNumber} ${change.previous ? 'editada' : 'criada'}`
          })]
        );
        calendarSyncTasks.push({
          type:'upsert',
          legacyId:saved.legacyId,
          // numeroReserva não vem em change.reservation (é atribuído só ao
          // persistir) - sem isso o evento no Outlook fica sem "#N ·" no
          // assunto e no corpo.
          reservation:{ ...change.reservation, numeroReserva:saved.reservationNumber },
          previousGraphEventId
        });
        // Reforça o aviso de CNH vencendo/vencida na hora da reserva (além da
        // varredura diária) - dedupeado por reserva em notifyDriverLicenseOnReservation,
        // então reeditar a mesma reserva não reenvia.
        cnhReminderTasks.push({
          userId:change.reservation.criadorUsuarioId,
          reservationId:saved.legacyId
        });
      }
    }
  });

  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok:true, reservations:await listReservationsForUser(req.user) });

  // Roda depois que a transação já foi confirmada e a resposta já foi enviada -
  // a sincronização com o calendário do Outlook é só uma comodidade extra e
  // nunca deve atrasar nem bloquear a criação/edição/cancelamento da reserva.
  for(const task of calendarSyncTasks){
    try{
      if(task.type === 'delete'){
        const upn = await resolveCalendarOwner(task.criadorUsuarioId);
        if(upn) await deleteCalendarEvent(upn, task.graphEventId);
      }else{
        const newEventId = await createOrUpdateCalendarEvent(task.reservation, task.previousGraphEventId);
        if(newEventId && newEventId !== task.previousGraphEventId){
          await query('UPDATE reservations SET graph_event_id = $2 WHERE legacy_id = $1', [task.legacyId, newEventId]);
        }
      }
    }catch(error){
      console.error('Falha ao sincronizar reserva com o calendário do Outlook:', error.message);
    }
  }

  for(const task of passengerJoinedEmailTasks){
    const driverId = task.reservation.criadorUsuarioId;
    const driverResult = await query('SELECT email, display_name FROM users WHERE id = $1', [driverId]);
    await sendPassengerJoinedEmail(task.reservation, task.addedPassengers, driverResult.rows[0]);
  }

  for(const task of passengerRemovedEmailTasks){
    await sendPassengerRemovalEmail(task);
  }

  for(const task of rideWatchEmailTasks){
    await sendRideWatchMatchEmails(task.reservation, task.matches);
  }

  for(const task of cnhReminderTasks){
    try{
      await notifyDriverLicenseOnReservation(task.userId, task.reservationId);
    }catch(error){
      console.error('Falha ao enviar aviso de vencimento de CNH na reserva:', error.message);
    }
  }
});

// Aba "Checklist" do painel de gestão (js/management-operations.js ->
// renderChecklistManagement). Passa por fora de POST /sync de propósito:
// sanitizeIncoming trava qualquer alteração numa retirada/devolução já
// registrada, mesmo para admin - essa rota é o único jeito de aprovar ou
// editar um checklist depois de enviado, e só quem tem a permissão
// "Checklist" chega até aqui.
router.patch('/:reservationId/operacao/:phase/checklist', requirePermission('checklist'), async (req, res) => {
  const phase = String(req.params.phase || '');
  if(!['retirada', 'devolucao'].includes(phase)){
    return res.status(400).json({ error:'Fase inválida.' });
  }
  const action = String(req.body && req.body.action || '');
  if(!['approve', 'edit'].includes(action)){
    return res.status(400).json({ error:'Ação inválida.' });
  }
  const reservation = await withTransaction(client =>
    updateOperationChecklist(client, req.params.reservationId, phase, action, req.body, req.user)
  );
  if(!reservation) return res.status(404).json({ error:'Registro operacional não encontrado.' });
  res.json({ reservation });
});

// Botões "Arquivar"/"Desarquivar" da aba Checklist. Ao contrário da rota
// .../checklist acima, não exige que a retirada/devolução já tenha sido
// registrada - dá pra arquivar um item que ainda está em "Registrar
// retirada/devolução", não só um já enviado aguardando revisão.
router.patch('/:reservationId/operacao/:phase/archive', requirePermission('checklist'), async (req, res) => {
  const phase = String(req.params.phase || '');
  if(!['retirada', 'devolucao'].includes(phase)){
    return res.status(400).json({ error:'Fase inválida.' });
  }
  const archived = req.body && req.body.arquivado === true;
  const reservation = await withTransaction(client =>
    setChecklistArchived(client, req.params.reservationId, phase, archived, req.user)
  );
  if(!reservation) return res.status(404).json({ error:'Reserva não encontrada.' });
  res.json({ reservation });
});

router.get('/:reservationId/photos/:photoId', async (req, res) => {
  const photo = await getPhotoForUser(req.user, req.params.reservationId, req.params.photoId);
  if(!photo) return res.status(404).json({ error:'Foto não encontrada.' });

  // Fotos novas ficam em server/uploads/operacoes (ver server/photo-storage.js).
  // Fotos gravadas antes dessa mudança continuam em operation_photos.data_url.
  const fromDisk = readPhotoFile(photo.storage_key);
  let bytes = fromDisk;
  let contentType = photo.content_type || 'application/octet-stream';
  if(!bytes){
    const match = String(photo.data_url || '').match(/^data:([^;,]+);base64,(.+)$/s);
    if(!match) return res.status(422).json({ error:'Arquivo de foto inválido.' });
    contentType = photo.content_type || match[1] || contentType;
    bytes = Buffer.from(match[2], 'base64');
  }

  const filename = String(photo.original_name || 'foto')
    .replace(/[\r\n"\\/]/g, '_').slice(0, 180);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${filename}"`);
  res.send(bytes);
});

module.exports = router;
