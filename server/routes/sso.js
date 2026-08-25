const express = require('express');
const { ssoConfig, appConfig } = require('../config');
const { createSessionToken } = require('../security');
const { parseCookies, issueSession } = require('../auth');
const { getAuthCodeUrl, acquireTokenFromCode, resolveOrCreateSsoUser } = require('../sso');

const router = express.Router();
const STATE_COOKIE = 'capricar_sso_state';

function stateCookieOptions(){
  return {
    httpOnly:true,
    sameSite:'lax',
    secure:appConfig().secureCookie,
    maxAge:10 * 60 * 1000,
    path:'/api/auth/sso'
  };
}

router.get('/status', (req, res) => {
  const config = ssoConfig();
  res.json({ enabled:config.enabled, graphImportEnabled:config.enabled });
});

router.get('/login', async (req, res) => {
  if(!ssoConfig().enabled){
    return res.status(503).json({ error:'Login via Microsoft não está configurado.' });
  }
  try{
    const state = createSessionToken();
    const authUrl = await getAuthCodeUrl(state);
    res.cookie(STATE_COOKIE, state, stateCookieOptions());
    res.redirect(authUrl);
  }catch(error){
    console.error('Falha ao iniciar login SSO:', error);
    res.status(500).json({ error:'Não foi possível iniciar o login via Microsoft.' });
  }
});

router.get('/callback', async (req, res) => {
  const clearStateCookie = () => res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(), maxAge:undefined });

  if(!ssoConfig().enabled){
    clearStateCookie();
    return res.redirect('/?error=sso_disabled');
  }
  if(req.query.error){
    clearStateCookie();
    return res.redirect('/?error=sso_denied');
  }

  const cookieState = parseCookies(req.headers.cookie)[STATE_COOKIE];
  const queryState = typeof req.query.state === 'string' ? req.query.state : '';
  clearStateCookie();
  if(!cookieState || !queryState || cookieState !== queryState){
    return res.redirect('/?error=sso_state');
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if(!code){
    return res.redirect('/?error=sso_state');
  }

  try{
    const tokenResult = await acquireTokenFromCode(code);
    const account = tokenResult.account || {};
    const { user } = await resolveOrCreateSsoUser({
      objectId:tokenResult.uniqueId,
      upn:account.username || account.upn || '',
      displayName:account.name || ''
    });
    await issueSession(res, user.id);
    res.redirect('/');
  }catch(error){
    console.error('Falha no callback SSO:', error);
    res.redirect('/?error=sso_failed');
  }
});

module.exports = router;
