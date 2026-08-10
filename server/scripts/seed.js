const { withTransaction, closePool } = require('../db');
const { hashPassword } = require('../security');

const DEFAULT_USERS = [
  {
    username:'admin',
    displayName:'Administrador',
    passwordEnv:'ADMIN_INITIAL_PASSWORD',
    role:'admin',
    permissions:[true, true, true, true, true, true, true]
  },
  {
    username:'facilities',
    displayName:'Facilities',
    passwordEnv:'FACILITIES_INITIAL_PASSWORD',
    role:'facilities',
    permissions:[true, true, true, true, false, false, false]
  }
];

const DEFAULT_BRANCHES = [
  {
    name:'São Paulo',
    vehicles:[
      { code:'89', brand:'Volkswagen', model:'Polo', capacity:5 },
      { code:'45', brand:'Volkswagen', model:'Polo', capacity:5 }
    ]
  },
  {
    name:'São Carlos',
    vehicles:[
      { code:'78', brand:'Volkswagen', model:'Polo', capacity:5 },
      { code:'32', brand:'Volkswagen', model:'Polo', capacity:5 }
    ]
  },
  {
    name:'Bragança Paulista',
    vehicles:[
      { code:'67', brand:'Volkswagen', model:'Polo', capacity:5 },
      { code:'54', brand:'Volkswagen', model:'Polo', capacity:5 }
    ]
  }
];

async function seedUsers(client){
  for(const user of DEFAULT_USERS){
    const existing = await client.query(
      'SELECT 1 FROM users WHERE LOWER(username) = $1',
      [user.username]
    );
    if(existing.rowCount) continue;
    const initialPassword = String(process.env[user.passwordEnv] || '');
    if(initialPassword.length < 8 || initialPassword.length > 128){
      throw new Error(
        `Defina ${user.passwordEnv} com uma senha de 8 a 128 caracteres antes da primeira carga.`
      );
    }
    const passwordHash = await hashPassword(initialPassword);
    await client.query(
      `INSERT INTO users (
         username, display_name, password_hash, role, active,
         can_manage_reservations, can_manage_fleet,
         can_manage_blocks, can_view_reports, can_view_audit,
         can_manage_rules, can_manage_users
       ) VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (LOWER(username)) DO NOTHING`,
      [
        user.username,
        user.displayName,
        passwordHash,
        user.role,
        ...user.permissions
      ]
    );
  }
}

async function seedFleet(client){
  for(const branch of DEFAULT_BRANCHES){
    const branchResult = await client.query(
      `INSERT INTO branches (name)
       VALUES ($1)
       ON CONFLICT (LOWER(name))
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [branch.name]
    );
    const branchId = branchResult.rows[0].id;
    for(const vehicle of branch.vehicles){
      await client.query(
        `INSERT INTO vehicles (branch_id, code, brand, model, capacity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (branch_id, LOWER(code)) DO NOTHING`,
        [branchId, vehicle.code, vehicle.brand, vehicle.model, vehicle.capacity]
      );
    }
  }
}

async function main(){
  await withTransaction(async client => {
    await seedUsers(client);
    await seedFleet(client);
  });
  console.log('Dados iniciais verificados com sucesso.');
}

main()
  .catch(error => {
    console.error('Falha ao inserir dados iniciais:', error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
