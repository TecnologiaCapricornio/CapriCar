const { query } = require('./db');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;

function attemptKey(req, username){
  return `${req.ip || req.socket.remoteAddress || 'local'}|${username}`;
}

// Retorna as falhas dentro da janela atual, ou null se não houver
// nenhuma tentativa recente (ou a última tentativa já expirou).
async function activeAttempt(key){
  const threshold = new Date(Date.now() - LOGIN_WINDOW_MS);
  const result = await query(
    'SELECT failures, started_at FROM login_attempts WHERE attempt_key = $1 AND started_at > $2',
    [key, threshold]
  );
  return result.rows[0] || null;
}

// Incrementa a falha dentro da janela atual, ou inicia uma nova janela se a
// anterior já expirou. A condição no UPDATE resolve isso de forma atômica.
async function registerFailure(key){
  const threshold = new Date(Date.now() - LOGIN_WINDOW_MS);
  await query(
    `INSERT INTO login_attempts (attempt_key, failures, started_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (attempt_key) DO UPDATE
        SET failures = CASE
              WHEN login_attempts.started_at > $2 THEN login_attempts.failures + 1
              ELSE 1
            END,
            started_at = CASE
              WHEN login_attempts.started_at > $2 THEN login_attempts.started_at
              ELSE NOW()
            END`,
    [key, threshold]
  );
}

async function clearAttempts(key){
  await query('DELETE FROM login_attempts WHERE attempt_key = $1', [key]);
}

module.exports = { LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES, attemptKey, activeAttempt, registerFailure, clearAttempts };
