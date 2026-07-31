const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/branches', async (req, res) => {
  const result = await query(
    'SELECT id, name, active, created_at, updated_at FROM branches ORDER BY active DESC, name'
  );
  res.json({ branches:result.rows });
});

router.get('/vehicles', async (req, res) => {
  const result = await query(
    `SELECT v.id, v.branch_id, b.name AS branch_name, v.code, v.plate,
            v.model, v.capacity, v.active, v.created_at, v.updated_at
       FROM vehicles v
       JOIN branches b ON b.id = v.branch_id
      ORDER BY b.name, v.model, v.code`
  );
  res.json({ vehicles:result.rows });
});

router.get('/reservation-rules', async (req, res) => {
  const result = await query(
    `SELECT max_consecutive_days, max_advance_days,
            max_reservations_in_window, updated_at
       FROM reservation_rules
      WHERE id = 1`
  );
  res.json({ rules:result.rows[0] || null });
});

module.exports = router;

