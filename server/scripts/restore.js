const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { databaseConfig } = require('../config');
const { runPostgresTool } = require('./postgres-tool');
const { decryptFile } = require('../backup-crypto');

function argumentValue(prefix){
  const match = process.argv.slice(2).find(value => value.startsWith(prefix + '='));
  return match ? match.slice(prefix.length + 1) : '';
}

async function restoreBackup(){
  const backupArgument = process.argv.slice(2).find(value => !value.startsWith('--'));
  const confirmation = argumentValue('--confirm');
  const database = databaseConfig();
  if(!backupArgument){
    throw new Error('Informe o arquivo: npm run db:restore -- caminho.backup --confirm=capricar');
  }
  if(confirmation !== database.database){
    throw new Error(`Para confirmar a substituição, informe --confirm=${database.database}`);
  }
  const backupPath = path.resolve(backupArgument);
  if(!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()){
    throw new Error('Arquivo de backup não encontrado.');
  }

  let restorePath = backupPath;
  let temporaryPath = null;
  if(backupPath.endsWith('.enc')){
    const encryptionKey = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();
    if(!encryptionKey){
      throw new Error('Este backup está criptografado. Defina BACKUP_ENCRYPTION_KEY no .env para restaurá-lo.');
    }
    temporaryPath = path.join(os.tmpdir(), `capricar-restore-${Date.now()}.backup`);
    await decryptFile(backupPath, temporaryPath, encryptionKey);
    restorePath = temporaryPath;
  }

  const args = [
    '--host', database.host,
    '--port', String(database.port),
    '--username', database.user,
    '--dbname', database.database,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--single-transaction',
    restorePath
  ];
  try{
    runPostgresTool('pg_restore', args, {
      configuredPath:process.env.PG_RESTORE_PATH,
      env:{ ...process.env, PGPASSWORD:database.password },
      stdio:'inherit'
    });
  }finally{
    if(temporaryPath && fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return backupPath;
}

restoreBackup().then(restored => {
  console.log(`Banco restaurado a partir de: ${restored}`);
}).catch(error => {
  console.error(`Restauração cancelada: ${error.message}`);
  process.exitCode = 1;
});
