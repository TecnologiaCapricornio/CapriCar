function validReservationNumber(value){
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function reservationOrder(left, right){
  const leftCreated = Date.parse(left.criadoEm || '');
  const rightCreated = Date.parse(right.criadoEm || '');
  if(Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated){
    return leftCreated - rightCreated;
  }
  const leftId = Number(left.id);
  const rightId = Number(right.id);
  if(Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId){
    return leftId - rightId;
  }
  return String(left.id || '').localeCompare(String(right.id || ''));
}

async function ensureReservationNumberCounter(client){
  await client.query(`
    CREATE TABLE IF NOT EXISTS reservation_number_counter (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0)
    )
  `);
  await client.query(
    `INSERT INTO reservation_number_counter (id, last_number)
     VALUES (1, 0) ON CONFLICT (id) DO NOTHING`
  );
}

async function nextReservationNumber(client){
  const result = await client.query(
    `UPDATE reservation_number_counter
        SET last_number = last_number + 1
      WHERE id = 1
      RETURNING last_number`
  );
  return Number(result.rows[0].last_number);
}

async function numberReservations(client, reservations, authoritativeReservations){
  await ensureReservationNumberCounter(client);
  const output = (Array.isArray(reservations) ? reservations : []).map(item => ({ ...item }));
  const authoritative = authoritativeReservations == null
    ? null
    : new Map(authoritativeReservations.map(item => [String(item.id), item]));
  const used = new Set();

  output.slice().sort(reservationOrder).forEach(reservation => {
    const source = authoritative
      ? authoritative.get(String(reservation.id))
      : reservation;
    const candidate = validReservationNumber(source && source.numeroReserva);
    if(candidate && !used.has(candidate)){
      reservation.numeroReserva = candidate;
      used.add(candidate);
    } else {
      delete reservation.numeroReserva;
    }
  });

  const highest = used.size ? Math.max(...used) : 0;
  if(highest){
    await client.query(
      `UPDATE reservation_number_counter
          SET last_number = GREATEST(last_number, $1)
        WHERE id = 1`,
      [highest]
    );
  }

  const missing = output.filter(item => !validReservationNumber(item.numeroReserva)).sort(reservationOrder);
  for(const reservation of missing){
    reservation.numeroReserva = await nextReservationNumber(client);
  }
  return output;
}

module.exports = { numberReservations, validReservationNumber };
