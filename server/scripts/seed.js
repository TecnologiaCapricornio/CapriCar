const { withTransaction, closePool } = require('../db');
const { hashPassword } = require('../security');
const { DEFAULT_RESERVATION_RULES } = require('../../js/reservation-defaults');

// permissions segue a ordem das colunas no INSERT abaixo: reservations,
// branches, fleet, maintenance, blocks, reports, audit, rules, users,
// integrations.
const DEFAULT_USERS = [
  {
    username:'admin',
    displayName:'Administrador',
    passwordEnv:'ADMIN_INITIAL_PASSWORD',
    role:'admin',
    permissions:[true, true, true, true, true, true, true, true, true, true]
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
         can_manage_reservations, can_manage_branches, can_manage_fleet, can_manage_maintenance,
         can_manage_blocks, can_view_reports, can_view_audit,
         can_manage_rules, can_manage_users, can_manage_integrations
       ) VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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

// A interface le a frota de application_state (JSONB), nao das tabelas
// relacionais que seedFleet() preenche acima - essas so alimentam
// /api/catalog/*, que hoje nenhum front-end chama. Sem isso, o primeiro
// login sempre falha: o app tenta empurrar veiculos de demonstracao do
// navegador (com placa vazia) para preencher o servidor, e o servidor
// recusa por falta de placa.
async function seedApplicationState(client, adminUserId){
  const existing = await client.query(
    `SELECT collection_name FROM application_state
      WHERE collection_name IN ('branches', 'vehicles', 'rules', 'blocks')`
  );
  const seeded = new Set(existing.rows.map(row => row.collection_name));

  const branches = DEFAULT_BRANCHES.map((branch, index) => ({
    id:`local-${index + 1}`,
    nome:branch.name,
    ativo:true
  }));
  const vehicles = DEFAULT_BRANCHES.flatMap(branch =>
    branch.vehicles.map(vehicle => ({
      id:`veiculo-${vehicle.code}`,
      local:branch.name,
      codigo:vehicle.code,
      marca:vehicle.brand,
      modelo:vehicle.model,
      placa:`DEMO${vehicle.code}`.slice(0, 7),
      capacidade:vehicle.capacity,
      ativo:true
    }))
  );

  const collections = [
    ['branches', branches],
    ['vehicles', vehicles],
    ['rules', DEFAULT_RESERVATION_RULES],
    ['blocks', []]
  ];
  for(const [name, value] of collections){
    if(seeded.has(name)) continue;
    await client.query(
      `INSERT INTO application_state (collection_name, value, updated_by, revision)
       VALUES ($1, $2::jsonb, $3, 1)
       ON CONFLICT (collection_name) DO NOTHING`,
      [name, JSON.stringify(value), adminUserId]
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
    const admin = await client.query(
      `SELECT id FROM users WHERE LOWER(username) = 'admin' LIMIT 1`
    );
    if(admin.rows[0]) await seedApplicationState(client, admin.rows[0].id);
  });
  console.log('Dados iniciais verificados com sucesso.');
}

main()
  .catch(error => {
    console.error('Falha ao inserir dados iniciais:', error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
