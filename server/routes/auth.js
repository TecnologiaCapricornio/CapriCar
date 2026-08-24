const express = require('express');
const { query, withTransaction } = require('../db');
const { appConfig } = require('../config');
const { hashPassword, verifyPassword, createSessionToken, hashSessionToken } = require('../security');
const { SESSION_COOKIE, parseCookies, publicUser, requireAuth } = require('../auth');
const {
  LOGIN_WINDOW_MS,
  LOGIN_MAX_FAILURES,
  attemptKey,
  activeAttempt,
  registerFailure,
  clearAttempts
} = require('../login-attempts');

const router = express.Router();
const dummyPasswordHash = hashPassword('CapriCar-Dummy-Password@2026');

function cookieOptions(){
  const config = appConfig();
  return {
    httpOnly:true,
    sameSite:'lax',
    secure:config.secureCookie,
    maxAge:config.sessionTtlHours * 60 * 60 * 1000,
    path:'/'
  };
}

router.post('/login', async (req, res) => {
  const username = String(req.body && req.body.username || '').trim().toLowerCase();
  const password = String(req.body && req.body.password || '');
  if(!username || !password){
    return res.status(400).json({ error:'Informe usuário e senha.' });
  }
  if(username.length > 40 || password.length > 128){
    return res.status(400).json({ error:'Credenciais inválidas.' });
  }

  const key = attemptKey(req, username);
  const attempt = await activeAttempt(key);
  if(attempt && attempt.failures >= LOGIN_MAX_FAILURES){
    res.setHeader(
      'Retry-After',
      String(Math.ceil((LOGIN_WINDOW_MS - (Date.now() - new Date(attempt.started_at).getTime())) / 1000))
    );
    return res.status(429).json({
      error:'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    });
  }

  const result = await query(
    `SELECT *
       FROM users
      WHERE LOWER(username) = $1
        AND active = TRUE
        AND deleted_at IS NULL
      LIMIT 1`,
    [username]
  );
  const account = result.rows[0];
  const passwordMatches = account
    ? await verifyPassword(password, account.password_hash)
    : await verifyPassword(password, await dummyPasswordHash);
  if(!account || !passwordMatches){
    await registerFailure(key);
    return res.status(401).json({ error:'Usuário ou senha incorretos.' });
  }
  await clearAttempts(key);

  const token = createSessionToken();
  const config = appConfig();
  await withTransaction(async client => {
    await client.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
    await client.query(
      `INSERT INTO user_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 hour'))`,
      [hashSessionToken(token), account.id, config.sessionTtlHours]
    );
    await client.query(
      `DELETE FROM user_sessions
        WHERE token_hash IN (
          SELECT token_hash
            FROM user_sessions
           WHERE user_id = $1
           ORDER BY created_at DESC
           OFFSET 10
        )`,
      [account.id]
    );
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.json({ user:publicUser(account) });
});

router.post('/logout', async (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if(token){
    await query('DELETE FROM user_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
  }
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge:undefined });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user:req.user });
});

module.exports = router;
