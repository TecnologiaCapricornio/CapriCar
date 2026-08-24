// Regras de transição de estado de uma reserva (quem pode alterar o quê, em
// que ordem) usadas por PUT /api/state/reservations. Extraído de
// server/routes/state.js para ficar testável sem precisar de Express nem de
// um servidor rodando - são funções puras sobre os dados enviados pelo
// cliente e o usuário autenticado, sem acesso a banco.
const { userCanManage } = require('../auth');
const { DEFAULT_RESERVATION_RULES } = require('../../js/reservation-defaults');

function normalizedStatus(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .trim()
    .toLowerCase();
}

function withoutPassengerFields(reservation){
  const clone = { ...reservation };
  delete clone.passageiros;
  delete clone.passageirosConfirmados;
  return clone;
}

function otherPassengerNames(reservation, currentName){
  const normalizedCurrent = String(currentName || '').trim().toLowerCase();
  return (Array.isArray(reservation.passageiros) ? reservation.passageiros : [])
    .map(item => String(item && item.nome || '').trim().toLowerCase())
    .filter(name => name && name !== normalizedCurrent)
    .sort();
}

function reservationOwner(reservation){
  return String(reservation && reservation.nome || '').trim().toLowerCase();
}

function reservationBelongsToUser(reservation, user){
  if(reservation && reservation.criadorUsuarioId){
    return String(reservation.criadorUsuarioId) === String(user.id);
  }
  return reservationOwner(reservation) === String(user.nome || '').trim().toLowerCase();
}

function scheduledPickupTimestamp(reservation){
  const date = String(reservation && reservation.dataIda || '');
  const time = String(reservation && reservation.horarioRetirada || '');
  const timestamp = Date.parse(`${date}T${time}:00-03:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function withoutOperationFields(reservation){
  const clone = { ...reservation };
  delete clone.operacao;
  delete clone.status;
  return clone;
}

function withoutAdministrativeClosureFields(reservation){
  const clone = withoutOperationFields(reservation);
  delete clone.encerramentoAdministrativo;
  return clone;
}

function passengerIdentityCounts(reservation){
  const counts = new Map();
  for(const passenger of (Array.isArray(reservation && reservation.passageiros) ? reservation.passageiros : [])){
    const userId = String(passenger && passenger.usuarioId || '').trim().toLowerCase();
    const name = String(passenger && passenger.nome || '').trim().toLocaleLowerCase('pt-BR');
    const key = userId ? `user:${userId}` : `${passenger && passenger.externo === true ? 'external' : 'name'}:${name}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function hasPassengerAdditions(previous, reservation){
  const before = passengerIdentityCounts(previous);
  const after = passengerIdentityCounts(reservation);
  for(const [key, count] of after){
    if(count > (before.get(key) || 0)) return true;
  }
  return Number(reservation.passageirosConfirmados || 0) > Number(previous.passageirosConfirmados || 0);
}

function validateReservationReplacement(current, incoming, user, rules){
  const privileged = userCanManage(user, 'reservations');
  const configuredPickupAdvance = rules && rules.pickupAdvanceMinutes;
  const pickupAdvanceMinutes = configuredPickupAdvance == null
    ? DEFAULT_RESERVATION_RULES.pickupAdvanceMinutes
    : Math.min(1440, Math.max(0, Number(configuredPickupAdvance) || 0));
  if(!Array.isArray(incoming)) throw Object.assign(new Error('Formato de reservas inválido.'), { status:400 });

  const currentById = new Map(
    (Array.isArray(current) ? current : []).map(item => [String(item.id), item])
  );
  const incomingById = new Map(incoming.map(item => [String(item.id), item]));

  for(const reservation of incoming){
    const previous = currentById.get(String(reservation.id));
    if(!previous){
      if(!privileged && !reservationBelongsToUser(reservation, user)){
        throw Object.assign(new Error('A reserva deve pertencer ao usuário autenticado.'), { status:403 });
      }
      continue;
    }
    if(JSON.stringify(previous) === JSON.stringify(reservation)) continue;

    const hadPickup = !!(previous.operacao && previous.operacao.retirada);
    const hadReturn = !!(previous.operacao && previous.operacao.devolucao);
    const hasPickup = !!(reservation.operacao && reservation.operacao.retirada);
    if(hasPassengerAdditions(previous, reservation) && hadPickup){
      throw Object.assign(new Error(
        'Não é mais possível adicionar passageiros: a retirada do veículo já foi registrada.'
      ), { status:409 });
    }
    if(!hadPickup && hasPickup){
      const scheduledPickup = scheduledPickupTimestamp(previous);
      const pickupAvailableFrom = scheduledPickup == null
        ? null
        : scheduledPickup - pickupAdvanceMinutes * 60 * 1000;
      if(pickupAvailableFrom == null || Date.now() < pickupAvailableFrom){
        const availableLabel = pickupAvailableFrom == null ? '' : new Intl.DateTimeFormat('pt-BR', {
          timeZone:'America/Sao_Paulo',
          day:'2-digit',
          month:'2-digit',
          year:'numeric',
          hour:'2-digit',
          minute:'2-digit'
        }).format(new Date(pickupAvailableFrom));
        throw Object.assign(new Error(
          `A retirada só pode ser registrada a partir de ${availableLabel || 'do horário permitido'}.`
        ), { status:409 });
      }
    }
    if(hadReturn){
      throw Object.assign(new Error('Uma reserva concluída não pode mais ser alterada.'), { status:409 });
    }
    if(normalizedStatus(previous.status) === 'encerrada_administrativamente'){
      throw Object.assign(new Error('Uma reserva encerrada pela gestão não pode mais ser alterada.'), { status:409 });
    }
    if(hadPickup){
      const administrativeClosure =
        privileged &&
        normalizedStatus(reservation.status) === 'encerrada_administrativamente' &&
        reservation.encerramentoAdministrativo &&
        !(reservation.operacao && reservation.operacao.devolucao);
      if(administrativeClosure){
        const coreUnchanged =
          JSON.stringify(withoutAdministrativeClosureFields(previous)) ===
          JSON.stringify(withoutAdministrativeClosureFields(reservation));
        const pickupUnchanged =
          JSON.stringify(previous.operacao.retirada) ===
          JSON.stringify(reservation.operacao && reservation.operacao.retirada);
        if(!coreUnchanged || !pickupUnchanged){
          throw Object.assign(new Error(
            'O encerramento administrativo não pode alterar os dados da retirada ou da reserva.'
          ), { status:409 });
        }
        continue;
      }
      const coreUnchanged =
        JSON.stringify(withoutOperationFields(previous)) ===
        JSON.stringify(withoutOperationFields(reservation));
      const pickupUnchanged =
        JSON.stringify(previous.operacao.retirada) ===
        JSON.stringify(reservation.operacao && reservation.operacao.retirada);
      if(!coreUnchanged || !pickupUnchanged){
        throw Object.assign(new Error('Após a retirada, somente a devolução pode ser registrada.'), { status:409 });
      }
      continue;
    }
    if(privileged || reservationBelongsToUser(previous, user)){
      if(
        !privileged &&
        previous.criadorUsuarioId &&
        String(reservation.criadorUsuarioId || '') !== String(previous.criadorUsuarioId)
      ){
        throw Object.assign(new Error('O criador da reserva não pode ser alterado.'), { status:403 });
      }
      continue;
    }

    const onlyPassengersChanged =
      JSON.stringify(withoutPassengerFields(previous)) === JSON.stringify(withoutPassengerFields(reservation)) &&
      JSON.stringify(otherPassengerNames(previous, user.nome)) ===
        JSON.stringify(otherPassengerNames(reservation, user.nome));
    if(!onlyPassengersChanged){
      throw Object.assign(new Error('Você não pode editar a reserva de outro usuário.'), { status:403 });
    }
  }

  for(const previous of (Array.isArray(current) ? current : [])){
    if(!incomingById.has(String(previous.id))){
      if(previous.operacao && previous.operacao.retirada){
        throw Object.assign(new Error('Não é possível cancelar uma reserva após a retirada.'), { status:409 });
      }
      if(!privileged && !reservationBelongsToUser(previous, user)){
        throw Object.assign(new Error('Você não pode cancelar a reserva de outro usuário.'), { status:403 });
      }
    }
  }
}

module.exports = {
  normalizedStatus,
  withoutPassengerFields,
  otherPassengerNames,
  reservationOwner,
  reservationBelongsToUser,
  scheduledPickupTimestamp,
  withoutOperationFields,
  withoutAdministrativeClosureFields,
  passengerIdentityCounts,
  hasPassengerAdditions,
  validateReservationReplacement
};
