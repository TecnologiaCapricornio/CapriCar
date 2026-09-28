const express = require('express');
const { query } = require('../db');
const { hasAnyManagementPermission, canSeeVehicle, indexVehicles, vehicleForReservation } = require('../vehicle-access');

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
            v.brand, v.model, v.capacity, v.active, v.created_at, v.updated_at
       FROM vehicles v
       JOIN branches b ON b.id = v.branch_id
      ORDER BY b.name, v.model, v.code`
  );
  // Mesma regra do bootstrap: veículo restrito a grupo não aparece para quem
  // não é membro nem da gestão (grupos ficam no veículo da coleção JSON).
  if(hasAnyManagementPermission(req.user)) return res.json({ vehicles:result.rows });
  const state = await query("SELECT value FROM application_state WHERE collection_name = 'vehicles'");
  const index = indexVehicles(state.rows[0] && Array.isArray(state.rows[0].value) ? state.rows[0].value : []);
  res.json({
    vehicles:result.rows.filter(row => {
      const vehicle = vehicleForReservation({ partida:row.branch_name, carro:row.code }, index);
      return !vehicle || canSeeVehicle(vehicle, req.user);
    })
  });
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

