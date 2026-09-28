const fs = require('node:fs/promises');
const path = require('node:path');
const { query, closePool } = require('../db');
const { migrateLegacyReservations } = require('../reservations-store');
const { licenseUploadsDir } = require('../photo-storage');

const projectRoot = path.join(__dirname, '..', '..');

async function applyMigration(name, filePath){
  const alreadyApplied = await query(
    'SELECT 1 FROM schema_migrations WHERE name = $1',
    [name]
  );
  if(alreadyApplied.rowCount) return false;

  const sql = await fs.readFile(filePath, 'utf8');
  await query(sql);
  await query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
  return true;
}

async function main(){
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = [
    { name:'001_schema.sql', path:path.join(projectRoot, 'db', 'schema.sql') }
  ];
  const migrationsDir = path.join(projectRoot, 'db', 'migrations');
  const migrationNames = (await fs.readdir(migrationsDir))
    .filter(name => name.endsWith('.sql'))
    .sort();
  for(const name of migrationNames){
    files.push({ name, path:path.join(migrationsDir, name) });
  }

  for(const migration of files){
    const applied = await applyMigration(migration.name, migration.path);
    console.log(applied ? `Aplicada: ${migration.name}` : `Já aplicada: ${migration.name}`);
  }
  const migratedReservations = await migrateLegacyReservations();
  console.log(`Reservas normalizadas migradas: ${migratedReservations}`);
  await purgeLegacyLicensePhotos();
}

// A migração 033 removeu as fotos de CNH do banco; aqui saem os arquivos.
// Nada mais grava nesse diretório (a CNH vem só da e-CNH, sem imagem), então
// é seguro repetir a cada execução - é o que garante a limpeza também em
// réplicas/volumes que ainda tivessem arquivos antigos.
async function purgeLegacyLicensePhotos(){
  const applied = await query("SELECT 1 FROM schema_migrations WHERE name = '033_ecnh_verified_licenses.sql'");
  if(!applied.rowCount) return;
  const existed = await fs.stat(licenseUploadsDir).then(() => true, () => false);
  await fs.rm(licenseUploadsDir, { recursive:true, force:true });
  if(existed) console.log(`Fotos antigas de CNH apagadas: ${licenseUploadsDir}`);
}

main()
  .catch(error => {
    console.error('Falha na migração:', error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
