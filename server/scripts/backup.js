const fs = require('node:fs');
const path = require('node:path');
const { databaseConfig } = require('../config');
const { runPostgresTool } = require('./postgres-tool');
const { encryptFile } = require('../backup-crypto');

const projectRoot = path.join(__dirname, '..', '..');

function backupDirectory(){
  const configured = String(process.env.BACKUP_DIR || 'backups').trim();
  return path.resolve(projectRoot, configured);
}

function backupName(database){
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeDatabase = database.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeDatabase}-${timestamp}.backup`;
}

function removeExpiredBackups(directory, retentionDays){
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for(const entry of fs.readdirSync(directory, { withFileTypes:true })){
    if(!entry.isFile() || !(entry.name.endsWith('.backup') || entry.name.endsWith('.backup.enc'))) continue;
    const fullPath = path.join(directory, entry.name);
    if(fs.statSync(fullPath).mtimeMs < cutoff) fs.unlinkSync(fullPath);
  }
}

async function createBackup(){
  const database = databaseConfig();
  const directory = backupDirectory();
  const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 30));
  const encryptionKey = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  fs.mkdirSync(directory, { recursive:true });
  const output = path.join(directory, backupName(database.database));
  const args = [
    '--host', database.host,
    '--port', String(database.port),
    '--username', database.user,
    '--format', 'custom',
    '--no-owner',
    '--no-privileges',
    '--file', output,
    database.database
  ];
  try{
    runPostgresTool('pg_dump', args, {
      configuredPath:process.env.PG_DUMP_PATH,
      env:{ ...process.env, PGPASSWORD:database.password }
    });
    const size = fs.statSync(output).size;
    if(size < 100) throw new Error('O arquivo de backup foi criado vazio.');
    if(!encryptionKey){
      removeExpiredBackups(directory, retentionDays);
      return { output, size, encrypted:false };
    }
    const encryptedOutput = `${output}.enc`;
    await encryptFile(output, encryptedOutput, encryptionKey);
    fs.unlinkSync(output);
    const encryptedSize = fs.statSync(encryptedOutput).size;
    removeExpiredBackups(directory, retentionDays);
    return { output:encryptedOutput, size:encryptedSize, encrypted:true };
  }catch(error){
    if(fs.existsSync(output)) fs.unlinkSync(output);
    throw error;
  }
}

if(require.main === module){
  createBackup().then(result => {
    console.log(`Backup criado: ${result.output}`);
    console.log(`Tamanho: ${result.size} bytes`);
    if(!result.encrypted){
      console.log(
        'Aviso: backup gravado sem criptografia. Defina BACKUP_ENCRYPTION_KEY no .env para cifrar novos backups.'
      );
    }
  }).catch(error => {
    console.error(`Falha no backup: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createBackup, removeExpiredBackups };
