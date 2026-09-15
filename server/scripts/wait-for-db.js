// Espera o Postgres aceitar conexões antes de seguir com migração/seed/boot
// (ver docker/entrypoint.sh). Necessário porque o Compose sobe o container
// do banco e o da aplicação praticamente juntos - o healthcheck do serviço
// "db" no docker-compose.yml já ajuda (o Compose só inicia o container da
// app depois que o Postgres responde a "pg_isready"), mas este loop é uma
// segunda camada de segurança para quando o container sobe fora do Compose
// (ex.: reinício isolado, orquestrador diferente) e não pode contar com
// aquele healthcheck.
const { Pool } = require('pg');
const { databaseConfig } = require('../config');

const maxAttempts = Number(process.env.DB_WAIT_MAX_ATTEMPTS || 30);
const delayMs = Number(process.env.DB_WAIT_DELAY_MS || 2000);

async function attempt(){
  const pool = new Pool(databaseConfig());
  try{
    await pool.query('SELECT 1');
  }finally{
    await pool.end().catch(() => {});
  }
}

async function wait(){
  for(let tentativa = 1; tentativa <= maxAttempts; tentativa++){
    try{
      await attempt();
      console.log('[wait-for-db] Banco de dados disponível.');
      return;
    }catch(error){
      console.log(
        `[wait-for-db] Ainda não respondeu (tentativa ${tentativa}/${maxAttempts}): ${error.message}`
      );
      if(tentativa === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

wait().catch(error => {
  console.error('[wait-for-db] Não foi possível conectar ao banco a tempo:', error.message);
  process.exit(1);
});
