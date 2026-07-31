const fs = require('node:fs/promises');
const path = require('node:path');
const { query, closePool } = require('../db');

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
}

main()
  .catch(error => {
    console.error('Falha na migração:', error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
