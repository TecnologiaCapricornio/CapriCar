const { Pool } = require('pg');
const { databaseConfig } = require('./config');

let pool;

function getPool(){
  if(!pool) pool = new Pool(databaseConfig());
  return pool;
}

async function query(text, params){
  return getPool().query(text, params);
}

async function withTransaction(callback){
  const client = await getPool().connect();
  try{
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
}

async function closePool(){
  if(pool){
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, withTransaction, closePool };

