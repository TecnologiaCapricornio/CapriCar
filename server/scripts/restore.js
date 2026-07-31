const fs = require('node:fs');
const path = require('node:path');
const { databaseConfig } = require('../config');
const { runPostgresTool } = require('./postgres-tool');

function argumentValue(prefix){
  const match = process.argv.slice(2).find(value => value.startsWith(prefix + '='));
  return match ? match.slice(prefix.length + 1) : '';
}

function restoreBackup(){
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
    backupPath
  ];
  runPostgresTool('pg_restore', args, {
    configuredPath:process.env.PG_RESTORE_PATH,
    env:{ ...process.env, PGPASSWORD:database.password },
    stdio:'inherit'
  });
  return backupPath;
}

try{
  const restored = restoreBackup();
  console.log(`Banco restaurado a partir de: ${restored}`);
}catch(error){
  console.error(`Restauração cancelada: ${error.message}`);
  process.exitCode = 1;
}
