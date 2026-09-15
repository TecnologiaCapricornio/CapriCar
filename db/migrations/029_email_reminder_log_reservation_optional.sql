BEGIN;

-- CNH e manutenção não estão ligadas a uma reserva especifica (reservation_id
-- fica NULL nesses casos) - a coluna NOT NULL da migracao 015 fazia o
-- INSERT de "sent" falhar sempre para esses dois tipos, e o e-mail nunca
-- ficava marcado como enviado (por isso repetia a cada varredura, a cada
-- 15 minutos).
ALTER TABLE email_reminder_log ALTER COLUMN reservation_id DROP NOT NULL;

COMMIT;
