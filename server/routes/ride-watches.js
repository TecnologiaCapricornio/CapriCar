const express = require('express');
const { query } = require('../db');

const router = express.Router();
const MAX_ACTIVE_WATCHES = 20;

function watchDto(row){
  return {
    id:row.id,
    origin:row.origin || '',
    destination:row.destination || '',
    startsOn:row.starts_on instanceof Date ? row.starts_on.toISOString().slice(0, 10) : String(row.starts_on),
    endsOn:row.ends_on instanceof Date ? row.ends_on.toISOString().slice(0, 10) : String(row.ends_on),
    createdAt:row.created_at
  };
}

router.get('/', async (req, res) => {
  const result = await query(
    `SELECT id, origin, destination, starts_on, ends_on, created_at
       FROM ride_watches
      WHERE user_id = $1 AND active = TRUE
      ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ watches:result.rows.map(watchDto) });
});

router.post('/', async (req, res) => {
  const origin = String(req.body && req.body.origin || '').trim().slice(0, 160);
  const destination = String(req.body && req.body.destination || '').trim().slice(0, 160);
  const startsOn = String(req.body && req.body.startsOn || '').trim();
  const endsOn = String(req.body && req.body.endsOn || '').trim();
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if(!origin){
    return res.status(400).json({ error:'Informe a origem que deseja monitorar.' });
  }
  if(!validDate(startsOn) || !validDate(endsOn) || endsOn < startsOn){
    return res.status(400).json({ error:'Informe um período válido para o monitoramento.' });
  }
  const countResult = await query(
    'SELECT COUNT(*)::int AS total FROM ride_watches WHERE user_id = $1 AND active = TRUE',
    [req.user.id]
  );
  if(Number(countResult.rows[0].total) >= MAX_ACTIVE_WATCHES){
    return res.status(409).json({ error:`Você já tem o máximo de ${MAX_ACTIVE_WATCHES} monitoramentos ativos. Cancele algum antes de criar outro.` });
  }
  const inserted = await query(
    `INSERT INTO ride_watches (user_id, origin, destination, starts_on, ends_on)
     VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5)
     RETURNING id, origin, destination, starts_on, ends_on, created_at`,
    [req.user.id, origin, destination, startsOn, endsOn]
  );
  res.status(201).json({ watch:watchDto(inserted.rows[0]) });
});

router.delete('/:id', async (req, res) => {
  const result = await query(
    'DELETE FROM ride_watches WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if(!result.rowCount) return res.status(404).json({ error:'Monitoramento não encontrado.' });
  res.json({ ok:true });
});

module.exports = router;
