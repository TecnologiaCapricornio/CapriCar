const express = require('express');
const { query } = require('../db');
const { ensureNotificationsTable, generateUserReminders } = require('../notifications');

const router = express.Router();

router.get('/', async (req, res) => {
  await generateUserReminders(req.user);
  const result = await query(
    `SELECT id, notification_type, title, message, reservation_id, metadata,
            read_at, created_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [req.user.id]
  );
  res.json({
    notifications:result.rows.map(row => ({
      id:String(row.id), type:row.notification_type,
      title:row.notification_type === 'admin_cancelled' ? 'Reserva cancelada' : row.title,
      message:row.message, reservationId:row.reservation_id,
      metadata:row.metadata || {}, read:!!row.read_at,
      readAt:row.read_at, createdAt:row.created_at
    }))
  });
});

router.patch('/:id/read', async (req, res) => {
  await ensureNotificationsTable();
  const result = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
      WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.user.id]
  );
  if(!result.rowCount) return res.status(404).json({ error:'Notificação não encontrada.' });
  res.json({ ok:true });
});

router.post('/read-all', async (req, res) => {
  await ensureNotificationsTable();
  await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
      WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ ok:true });
});

module.exports = router;
