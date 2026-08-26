const path = require('node:path');
const express = require('express');
const { query, closePool } = require('./db');
const { appConfig } = require('./config');
const { requireAuth } = require('./auth');
const authRoutes = require('./routes/auth');
const ssoRoutes = require('./routes/sso');
const userRoutes = require('./routes/users');
const catalogRoutes = require('./routes/catalog');
const stateRoutes = require('./routes/state');
const notificationRoutes = require('./routes/notifications');
const reservationRoutes = require('./routes/reservations');
const settingsRoutes = require('./routes/settings');
const rideWatchRoutes = require('./routes/ride-watches');
const { sweepEmailReminders } = require('./reminders');

const app = express();
const rootDir = path.join(__dirname, '..');
const config = appConfig();

app.disable('x-powered-by');
// Aceita cabeçalhos de protocolo apenas do proxy que roda na própria máquina.
app.set('trust proxy', 'loopback');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if(config.production){
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
    "script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; " +
    "connect-src 'self'; object-src 'none'"
  );
  next();
});
app.use((req, res, next) => {
  if(['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if(!origin) return next();
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if(origin !== expectedOrigin){
    return res.status(403).json({ error:'Origem da requisição não permitida.' });
  }
  next();
});
app.use(express.json({ limit:'8mb' }));

app.get('/api/health', async (req, res) => {
  const result = await query('SELECT current_database() AS database, NOW() AS server_time');
  res.json({ ok:true, database:result.rows[0].database, serverTime:result.rows[0].server_time });
});
app.use('/api/auth/sso', ssoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/catalog', requireAuth, catalogRoutes);
app.use('/api/state', requireAuth, stateRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/reservations', requireAuth, reservationRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/ride-watches', requireAuth, rideWatchRoutes);

app.use('/assets', express.static(path.join(rootDir, 'assets'), { fallthrough:false }));
app.use('/css', express.static(path.join(rootDir, 'css'), { fallthrough:false }));
app.use('/js', express.static(path.join(rootDir, 'js'), { fallthrough:false }));
app.get('/logo.png', (req, res) => res.sendFile(path.join(rootDir, 'logo.png')));
app.get('/bg.jpg', (req, res) => res.sendFile(path.join(rootDir, 'bg.jpg')));
app.get('/', (req, res) => res.sendFile(path.join(rootDir, 'index.html')));

app.use((req, res) => {
  if(req.path.startsWith('/api/')) return res.status(404).json({ error:'Rota não encontrada.' });
  res.status(404).send('Página não encontrada.');
});

app.use((error, req, res, next) => {
  if(res.headersSent) return next(error);
  if(error.type === 'entity.parse.failed'){
    return res.status(400).json({ error:'JSON inválido.' });
  }
  if(error.status === 413){
    return res.status(413).json({ error:'O conteúdo enviado excede o limite permitido.' });
  }
  if(error.status && Number.isInteger(error.status)){
    const payload = { error:error.message };
    if(error.code === 'STATE_CONFLICT'){
      payload.code = error.code;
      payload.currentRevision = error.currentRevision;
    }
    return res.status(error.status).json(payload);
  }
  if(error.code === '23505') return res.status(409).json({ error:'Já existe um registro com esses dados.' });
  if(error.code === '22P02') return res.status(400).json({ error:'Identificador inválido.' });
  console.error(error);
  res.status(500).json({ error:'Erro interno do servidor.' });
});

const REMINDER_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
let sweepRunning = false;

async function runReminderSweep(){
  if(sweepRunning) return;
  sweepRunning = true;
  try{
    const summary = await sweepEmailReminders();
    if(summary.sent || summary.failed){
      console.log('Lembretes por e-mail:', summary);
    }
  }catch(error){
    console.error('Falha na varredura de lembretes por e-mail:', error);
  }finally{
    sweepRunning = false;
  }
}

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log('CapriCar disponível em http://localhost:' + config.port);
  runReminderSweep();
});

const reminderSweepTimer = setInterval(runReminderSweep, REMINDER_SWEEP_INTERVAL_MS);

async function shutdown(){
  clearInterval(reminderSweepTimer);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
