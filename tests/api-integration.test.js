const assert = require('node:assert/strict');
const { withTransaction, closePool } = require('../server/db');

const BASE = 'http://127.0.0.1:3000';
const testSuffix = Date.now().toString(36);
const username = `auditoria.${testSuffix}`;
const displayName = `Auditoria ${testSuffix}`;
const reservationId = `audit-reservation-${testSuffix}`;
const vehicleId = `audit-vehicle-${testSuffix}`;
const reservationVehicleId = `audit-reservation-vehicle-${testSuffix}`;
const branchId = `audit-branch-${testSuffix}`;
const adminPassword = process.env.CAPRICAR_TEST_ADMIN_PASSWORD;
const temporaryUserPassword = 'Auditoria-Temporaria@2026';
let createdUserId = null;

async function request(path, options){
  const config = { ...(options || {}) };
  config.headers = { ...(config.headers || {}) };
  if(config.body && typeof config.body !== 'string'){
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(BASE + path, config);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}

async function login(loginUsername, password){
  const result = await request('/api/auth/login', {
    method:'POST',
    body:{ username:loginUsername, password }
  });
  assert.equal(result.response.status, 200);
  const setCookie = result.response.headers.get('set-cookie');
  assert.ok(setCookie);
  return { cookie:setCookie.split(';')[0], setCookie, user:result.body.user };
}

function auth(cookie, extra){
  return { Cookie:cookie, ...(extra || {}) };
}

function addDays(iso, days){
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function findSlot(state){
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Sao_Paulo',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).format(new Date());
  const vehicles = (state.vehicles || []).filter(vehicle => vehicle.ativo !== false);
  for(let day = 1; day <= Number(state.rules.maxAdvanceDays); day++){
    const date = addDays(today, day);
    for(const vehicle of vehicles){
      for(const [start, end] of [['06:00','06:30'], ['20:00','20:30'], ['22:00','22:30']]){
        const startMs = new Date(`${date}T${start}:00Z`).getTime();
        const endMs = new Date(`${date}T${end}:00Z`).getTime();
        const bufferMs = Number(state.rules.reservationBufferMinutes == null ? 60 : state.rules.reservationBufferMinutes) * 60 * 1000;
        const blocked = (state.blocks || []).some(block =>
          block.local === vehicle.local &&
          String(block.carro) === String(vehicle.codigo) &&
          date >= block.dataInicio && date <= block.dataFim
        );
        const conflict = (state.reservations || []).some(reservation =>
          reservation.partida === vehicle.local &&
          String(reservation.carro) === String(vehicle.codigo) &&
          startMs < new Date(`${reservation.dataVolta}T${reservation.horarioDevolucao}:00Z`).getTime() + bufferMs &&
          endMs > new Date(`${reservation.dataIda}T${reservation.horarioRetirada}:00Z`).getTime() - bufferMs
        );
        if(!blocked && !conflict) return { date, start, end, vehicle };
      }
    }
  }
  throw new Error(
    `Nenhum horário livre para o teste de integração ` +
    `(veículos ativos: ${vehicles.length}, reservas: ${(state.reservations || []).length}, ` +
    `bloqueios: ${(state.blocks || []).length}, antecedência: ${state.rules && state.rules.maxAdvanceDays}).`
  );
}

async function cleanup(){
  await withTransaction(async client => {
    // Reservas ficam na tabela relacional "reservations" (legacy_id guarda o
    // id enviado pelo cliente), nao mais em application_state - ver
    // server/reservations-store.js.
    await client.query('DELETE FROM reservations WHERE legacy_id = $1', [reservationId]);
    const vehicleState = await client.query(
      `SELECT value
         FROM application_state
        WHERE collection_name = 'vehicles'
        FOR UPDATE`
    );
    if(vehicleState.rows[0] && Array.isArray(vehicleState.rows[0].value)){
      const cleanedVehicles = vehicleState.rows[0].value.filter(item =>
        ![vehicleId, reservationVehicleId].includes(String(item.id))
      );
      await client.query(
        `UPDATE application_state
            SET value = $1::jsonb, updated_at = NOW(), revision = revision + 1
          WHERE collection_name = 'vehicles'`,
        [JSON.stringify(cleanedVehicles)]
      );
    }
    const branchState = await client.query(
      `SELECT value
         FROM application_state
        WHERE collection_name = 'branches'
        FOR UPDATE`
    );
    if(branchState.rows[0] && Array.isArray(branchState.rows[0].value)){
      const cleanedBranches = branchState.rows[0].value.filter(item => String(item.id) !== branchId);
      await client.query(
        `UPDATE application_state
            SET value = $1::jsonb, updated_at = NOW(), revision = revision + 1
          WHERE collection_name = 'branches'`,
        [JSON.stringify(cleanedBranches)]
      );
    }
    await client.query(
      `DELETE FROM audit_logs
        WHERE entity_id IN ($1, $3, $4, $5)
           OR (entity_type = 'user' AND entity_id = $2)`,
      [reservationId, createdUserId, vehicleId, reservationVehicleId, branchId]
    );
    if(createdUserId) await client.query('DELETE FROM users WHERE id = $1', [createdUserId]);
  });
}

async function main(){
  assert.ok(
    adminPassword,
    'Defina CAPRICAR_TEST_ADMIN_PASSWORD apenas no ambiente para executar este teste.'
  );
  try{
    const home = await fetch(BASE + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');

    const anonymousUsers = await request('/api/users');
    assert.equal(anonymousUsers.response.status, 401);
    const foreignOrigin = await request('/api/auth/login', {
      method:'POST',
      headers:{ Origin:'https://evil.example' },
      body:{ username:'admin', password:adminPassword }
    });
    assert.equal(foreignOrigin.response.status, 403);

    const injection = await request('/api/auth/login', {
      method:'POST',
      body:{ username:"admin' OR '1'='1", password:'qualquer-senha' }
    });
    assert.equal(injection.response.status, 401);
    const rateUsername = `inexistente.${testSuffix}`;
    for(let index = 0; index < 8; index++){
      const failed = await request('/api/auth/login', {
        method:'POST',
        body:{ username:rateUsername, password:'senha-incorreta' }
      });
      assert.equal(failed.response.status, 401);
    }
    const rateLimited = await request('/api/auth/login', {
      method:'POST',
      body:{ username:rateUsername, password:'senha-incorreta' }
    });
    assert.equal(rateLimited.response.status, 429);

    const admin = await login('admin', adminPassword);
    assert.match(admin.setCookie, /HttpOnly/i);
    assert.match(admin.setCookie, /SameSite=Lax/i);

    const bootstrapResult = await request('/api/state/bootstrap', {
      headers:auth(admin.cookie)
    });
    assert.equal(bootstrapResult.response.status, 200);
    const state = bootstrapResult.body.collections;
    const revisions = { ...bootstrapResult.body.revisions };
    // As reservas nao ficam mais em application_state (ver server/reservations-store.js),
    // entao o teste de conflito otimista (STATE_CONFLICT) usa "rules", que continua
    // sendo uma colecao JSONB de verdade.
    const initialRulesRevision = revisions.rules;
    const sameState = await request('/api/state/rules', {
      method:'PUT',
      headers:auth(admin.cookie),
      body:{ value:state.rules, revision:revisions.rules }
    });
    assert.equal(sameState.response.status, 200, sameState.body && sameState.body.error);
    revisions.rules = sameState.body.revision;

    const staleState = await request('/api/state/rules', {
      method:'PUT',
      headers:auth(admin.cookie),
      body:{ value:state.rules, revision:initialRulesRevision }
    });
    assert.equal(staleState.response.status, 409);
    assert.equal(staleState.body.code, 'STATE_CONFLICT');

    const currentReservationsResult = await request('/api/reservations', { headers:auth(admin.cookie) });
    assert.equal(currentReservationsResult.response.status, 200);
    const currentReservations = currentReservationsResult.body.reservations || [];

    const weakPassword = await request('/api/users', {
      method:'POST',
      headers:auth(admin.cookie),
      body:{
        username,
        nome:displayName,
        password:'1234567',
        perfil:'usuario'
      }
    });
    assert.equal(weakPassword.response.status, 400);

    const created = await request('/api/users', {
      method:'POST',
      headers:auth(admin.cookie),
      body:{
        username,
        nome:displayName,
        password:temporaryUserPassword,
        perfil:'usuario'
      }
    });
    assert.equal(created.response.status, 201, created.body && created.body.error);
    createdUserId = created.body.user.id;

    // Reserva nova exige motorista com CNH válida cadastrada (ver
    // server/validation.js, licenseCurrentlyValid) - inserida direto no
    // banco, já que a única forma "de produto" de cadastrar uma é a
    // importação da e-CNH (assinatura digital de verdade, inviável aqui).
    // numero/categoria/validade/emissor/verificada_em são NOT NULL desde a
    // migração 033 (endurecida quando a CNH digitada foi desativada).
    // Categoria D cobre qualquer capacidade de veículo (ver
    // js/cnh-categorias.js), então o slot sorteado por findSlot() nunca
    // esbarra na checagem de categoria x capacidade. A linha é removida
    // junto com o usuário em cleanup() (driver_licenses tem ON DELETE
    // CASCADE em user_id - ver db/migrations/021_driver_licenses.sql).
    await withTransaction(client => client.query(
      `INSERT INTO driver_licenses (user_id, numero, categoria, validade, emissor, verificada_em)
       VALUES ($1, $2, 'D', $3, 'DETRAN Teste de Integração', NOW())`,
      [createdUserId, String(Date.now()).slice(-11), addDays(
        new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()),
        365
      )]
    ));

    const duplicate = await request('/api/users', {
      method:'POST',
      headers:auth(admin.cookie),
      body:{
        username,
        nome:displayName,
        password:temporaryUserPassword,
        perfil:'usuario'
      }
    });
    assert.equal(duplicate.response.status, 409);

    const testUser = await login(username, temporaryUserPassword);
    const deniedUsers = await request('/api/users', { headers:auth(testUser.cookie) });
    assert.equal(deniedUsers.response.status, 403);
    const deniedBranches = await request('/api/state/branches', {
      method:'PUT',
      headers:auth(testUser.cookie),
      body:{ value:state.branches, revision:revisions.branches }
    });
    assert.equal(deniedBranches.response.status, 403);
    const deniedRules = await request('/api/state/rules', {
      method:'PUT',
      headers:auth(testUser.cookie),
      body:{ value:state.rules, revision:revisions.rules }
    });
    assert.equal(deniedRules.response.status, 403);
    const unknownCollection = await request('/api/state/desconhecida', {
      method:'PUT',
      headers:auth(admin.cookie),
      body:{ value:[] }
    });
    assert.equal(unknownCollection.response.status, 404);

    const testBranch = {
      id:branchId,
      nome:`Local temporário ${testSuffix}`,
      ativo:true
    };
    const createTestBranch = await request('/api/state/branches', {
      method:'PUT',
      headers:auth(admin.cookie),
      body:{ value:[...state.branches, testBranch], revision:revisions.branches }
    });
    assert.equal(createTestBranch.response.status, 200, createTestBranch.body && createTestBranch.body.error);
    revisions.branches = createTestBranch.body.revision;

    const bypassBranchJustification = await request('/api/state/branches', {
      method:'PUT',
      headers:auth(admin.cookie),
      body:{ value:state.branches, revision:revisions.branches }
    });
    assert.equal(bypassBranchJustification.response.status, 400);

    const branchWithoutJustification = await request(`/api/state/branches/${branchId}`, {
      method:'DELETE',
      headers:auth(admin.cookie),
      body:{ justification:'', revision:revisions.branches }
    });
    assert.equal(branchWithoutJustification.response.status, 400);

    const unauthorizedBranchDelete = await request(`/api/state/branches/${branchId}`, {
      method:'DELETE',
      headers:auth(testUser.cookie),
      body:{ justification:'Teste de permissão', revision:revisions.branches }
    });
    assert.equal(unauthorizedBranchDelete.response.status, 403);

    const permanentBranchDelete = await request(`/api/state/branches/${branchId}`, {
      method:'DELETE',
      headers:auth(admin.cookie),
      body:{
        justification:'Local criado somente para testar a exclusão definitiva.',
        revision:revisions.branches
      }
    });
    assert.equal(permanentBranchDelete.response.status, 200, permanentBranchDelete.body && permanentBranchDelete.body.error);
    revisions.branches = permanentBranchDelete.body.revision;

    const afterBranchDelete = await request('/api/state/bootstrap', { headers:auth(admin.cookie) });
    assert.equal(
      afterBranchDelete.body.collections.branches.some(item => String(item.id) === branchId),
      false
    );
    assert.ok(afterBranchDelete.body.audit.some(item =>
      item.entityId === branchId &&
      item.action === 'excluiu definitivamente' &&
      item.details.includes('Justificativa:')
    ));

    const testVehicle = {
      id:vehicleId,
      local:state.branches[0].nome,
      codigo:`QA-${testSuffix.slice(-6)}`,
      placa:`QA${testSuffix.slice(-5).toUpperCase()}`,
      marca:'Marca teste',
      modelo:'Veículo temporário da auditoria',
      capacidade:5,
      ativo:true
    };
    const reservationTestVehicle = {
      ...testVehicle,
      id:reservationVehicleId,
      codigo:`QR-${testSuffix.slice(-6)}`,
      placa:`QR${testSuffix.slice(-5).toUpperCase()}`,
      marca:'Marca teste',
      modelo:'Veículo temporário para reserva'
    };
    const createTestVehicle = await request('/api/state/vehicles', {
      method:'PUT',
      headers:auth(admin.cookie),
      body:{
        value:[...state.vehicles, testVehicle, reservationTestVehicle],
        revision:revisions.vehicles
      }
    });
    assert.equal(createTestVehicle.response.status, 200);
    revisions.vehicles = createTestVehicle.body.revision;

    const bypassJustification = await request('/api/state/vehicles', {
      method:'PUT',
      headers:auth(admin.cookie),
      body:{
        value:[...state.vehicles, reservationTestVehicle],
        revision:revisions.vehicles
      }
    });
    assert.equal(bypassJustification.response.status, 400);

    const missingJustification = await request(`/api/state/vehicles/${vehicleId}`, {
      method:'DELETE',
      headers:auth(admin.cookie),
      body:{ justification:'', revisions }
    });
    assert.equal(missingJustification.response.status, 400);

    const unauthorizedDelete = await request(`/api/state/vehicles/${vehicleId}`, {
      method:'DELETE',
      headers:auth(testUser.cookie),
      body:{ justification:'Teste de permissão', revisions }
    });
    assert.equal(unauthorizedDelete.response.status, 403);

    const permanentDelete = await request(`/api/state/vehicles/${vehicleId}`, {
      method:'DELETE',
      headers:auth(admin.cookie),
      body:{ justification:'Veículo criado somente para testar a exclusão definitiva.', revisions }
    });
    assert.equal(permanentDelete.response.status, 200, permanentDelete.body && permanentDelete.body.error);
    revisions.vehicles = permanentDelete.body.revisions.vehicles;
    revisions.blocks = permanentDelete.body.revisions.blocks;
    const afterVehicleDelete = await request('/api/state/bootstrap', {
      headers:auth(admin.cookie)
    });
    assert.equal(
      afterVehicleDelete.body.collections.vehicles.some(item => String(item.id) === vehicleId),
      false
    );
    assert.ok(afterVehicleDelete.body.audit.some(item =>
      item.entityId === vehicleId &&
      item.action === 'excluiu definitivamente' &&
      item.details.includes('Justificativa:')
    ));

    // Reservas nao usam mais PUT /api/state/reservations (colecao removida
    // quando os dados foram normalizados - ver server/routes/reservations.js);
    // o caminho real hoje e POST /api/reservations/sync.
    const slot = findSlot({
      reservations:currentReservations,
      vehicles:[reservationTestVehicle],
      blocks:state.blocks,
      rules:state.rules
    });
    const ownReservation = {
      id:reservationId,
      nome:displayName,
      partida:slot.vehicle.local,
      destino:'Teste de integração',
      carro:String(slot.vehicle.codigo),
      motivo:'Auditoria automatizada',
      responsavel:displayName,
      dataIda:slot.date,
      dataVolta:slot.date,
      horarioRetirada:slot.start,
      horarioDevolucao:slot.end,
      passageiros:[{ nome:displayName }],
      passageirosConfirmados:0,
      status:'confirmada',
      criadoEm:new Date().toISOString()
    };
    const ownSave = await request('/api/reservations/sync', {
      method:'POST',
      headers:auth(testUser.cookie),
      body:{ changes:[{ type:'upsert', reservation:ownReservation }] }
    });
    assert.equal(ownSave.response.status, 200, ownSave.body && ownSave.body.error);

    const foreignReservation = currentReservations.find(item =>
      String(item.criadorUsuarioId) !== String(testUser.user.id)
    );
    if(foreignReservation){
      const forbiddenEdit = await request('/api/reservations/sync', {
        method:'POST',
        headers:auth(testUser.cookie),
        body:{
          changes:[{
            type:'upsert',
            reservation:{ ...foreignReservation, motivo:'Alterado sem permissão' }
          }]
        }
      });
      assert.equal(forbiddenEdit.response.status, 403);
    }

    const xssAttempt = await request('/api/reservations/sync', {
      method:'POST',
      headers:auth(testUser.cookie),
      body:{
        changes:[{
          type:'upsert',
          reservation:{ ...ownReservation, id:`${reservationId}-xss`, motivo:'<img src=x onerror=alert(1)>' }
        }]
      }
    });
    assert.equal(xssAttempt.response.status, 400);

    const overCapacity = await request('/api/reservations/sync', {
      method:'POST',
      headers:auth(testUser.cookie),
      body:{
        changes:[{
          type:'upsert',
          reservation:{
            ...ownReservation,
            id:`${reservationId}-cap`,
            passageiros:Array.from({ length:21 }, (_, index) => ({ nome:`Pessoa ${index}` }))
          }
        }]
      }
    });
    assert.equal(overCapacity.response.status, 400);

    const conflictAttempt = await request('/api/reservations/sync', {
      method:'POST',
      headers:auth(testUser.cookie),
      body:{
        changes:[{
          type:'upsert',
          reservation:{ ...ownReservation, id:`${reservationId}-conflict`, motivo:'Conflito proposital' }
        }]
      }
    });
    assert.equal(conflictAttempt.response.status, 400);

    const stateBeforeProtectedDelete = await request('/api/state/bootstrap', {
      headers:auth(admin.cookie)
    });
    const reservationsBeforeProtectedDelete = await request('/api/reservations', { headers:auth(admin.cookie) });
    const protectedVehicle = stateBeforeProtectedDelete.body.collections.vehicles.find(item =>
      String(item.id) === reservationVehicleId
    );
    const protectedReservation = (reservationsBeforeProtectedDelete.body.reservations || []).find(item =>
      String(item.id) === reservationId
    );
    assert.ok(protectedVehicle);
    assert.ok(protectedReservation);
    assert.equal(String(protectedReservation.carro), String(protectedVehicle.codigo));
    assert.equal(String(protectedReservation.partida), String(protectedVehicle.local));

    const deleteVehicleWithReservation = await request(
      `/api/state/vehicles/${reservationVehicleId}`,
      {
        method:'DELETE',
        headers:auth(admin.cookie),
        body:{
          justification:'Tentativa de excluir veículo com reserva futura.',
          revisions
        }
      }
    );
    assert.equal(deleteVehicleWithReservation.response.status, 409);

    // Perfis de acesso (migração 036): Usuário / Gestão / Portaria.
    const invalidProfile = await request(`/api/users/${createdUserId}`, {
      method:'PATCH',
      headers:auth(admin.cookie),
      body:{ nome:displayName, perfil:'superusuario' }
    });
    assert.equal(invalidProfile.response.status, 400);

    const toPortaria = await request(`/api/users/${createdUserId}`, {
      method:'PATCH',
      headers:auth(admin.cookie),
      body:{ nome:displayName, perfil:'portaria' }
    });
    assert.equal(toPortaria.response.status, 200, toPortaria.body && toPortaria.body.error);
    assert.equal(toPortaria.body.user.perfil, 'portaria');
    assert.equal(toPortaria.body.user.permissions.checklist, true);
    assert.equal(toPortaria.body.user.permissions.reservations, false);
    assert.equal(toPortaria.body.user.permissions.users, false);

    // A sessão já aberta passa a valer como Portaria (o perfil é relido a
    // cada requisição).
    const portariaList = await request('/api/reservations', { headers:auth(testUser.cookie) });
    assert.equal(portariaList.response.status, 200);
    const portariaOwn = (portariaList.body.reservations || []).find(item => String(item.id) === reservationId);
    assert.ok(portariaOwn);

    const portariaCreate = await request('/api/reservations/sync', {
      method:'POST',
      headers:auth(testUser.cookie),
      body:{ changes:[{ type:'upsert', reservation:{ ...ownReservation, id:`${reservationId}-portaria` } }] }
    });
    assert.equal(portariaCreate.response.status, 403);

    const portariaEdit = await request('/api/reservations/sync', {
      method:'POST',
      headers:auth(testUser.cookie),
      body:{ changes:[{ type:'upsert', reservation:{ ...portariaOwn, motivo:'Alterado pela portaria' } }] }
    });
    assert.equal(portariaEdit.response.status, 403);

    const portariaCancel = await request('/api/reservations/sync', {
      method:'POST',
      headers:auth(testUser.cookie),
      body:{ changes:[{ type:'delete', id:reservationId }] }
    });
    assert.equal(portariaCancel.response.status, 403);

    const portariaCnhUpload = await request('/api/profile/cnh/e-cnh', {
      method:'POST',
      headers:auth(testUser.cookie, { 'Content-Type':'application/pdf' }),
      body:'%PDF-1.4 teste'
    });
    assert.equal(portariaCnhUpload.response.status, 403);
    const portariaCnhRead = await request('/api/profile/cnh', { headers:auth(testUser.cookie) });
    assert.equal(portariaCnhRead.response.status, 200);

    const portariaRideWatch = await request('/api/ride-watches', {
      method:'POST',
      headers:auth(testUser.cookie),
      body:{}
    });
    assert.equal(portariaRideWatch.response.status, 403);

    const portariaUsers = await request('/api/users', { headers:auth(testUser.cookie) });
    assert.equal(portariaUsers.response.status, 403);

    const bulkBackToUser = await request('/api/users/bulk/profile', {
      method:'POST',
      headers:auth(admin.cookie),
      body:{ userIds:[createdUserId], perfil:'usuario' }
    });
    assert.equal(bulkBackToUser.response.status, 200);
    assert.equal(bulkBackToUser.body.processed, 1);
    const usersAfterBulk = await request('/api/users', { headers:auth(admin.cookie) });
    const backToUser = usersAfterBulk.body.users.find(item => String(item.id) === String(createdUserId));
    assert.equal(backToUser.perfil, 'usuario');
    assert.equal(backToUser.permissions.checklist, false);
    const adminListed = usersAfterBulk.body.users.find(item => item.role === 'admin');
    assert.equal(adminListed.perfil, 'gestao');

    const deactivate = await request(`/api/users/${createdUserId}`, {
      method:'PATCH',
      headers:auth(admin.cookie),
      body:{
        nome:displayName,
        active:false,
        perfil:'usuario'
      }
    });
    assert.equal(deactivate.response.status, 200);
    const disabledLogin = await request('/api/auth/login', {
      method:'POST',
      body:{ username, password:temporaryUserPassword }
    });
    assert.equal(disabledLogin.response.status, 401);

    const userDeleteWithoutReason = await request(`/api/users/${createdUserId}`, {
      method:'DELETE',
      headers:auth(admin.cookie),
      body:{ justification:'' }
    });
    assert.equal(userDeleteWithoutReason.response.status, 400);

    const selfDelete = await request(`/api/users/${admin.user.id}`, {
      method:'DELETE',
      headers:auth(admin.cookie),
      body:{ justification:'Tentativa de excluir a própria conta administrativa.' }
    });
    assert.equal(selfDelete.response.status, 409);

    const permanentUserDelete = await request(`/api/users/${createdUserId}`, {
      method:'DELETE',
      headers:auth(admin.cookie),
      body:{ justification:'Conta criada exclusivamente para a auditoria automatizada.' }
    });
    assert.equal(permanentUserDelete.response.status, 200);

    const usersAfterDelete = await request('/api/users', { headers:auth(admin.cookie) });
    assert.equal(
      usersAfterDelete.body.users.some(item => String(item.id) === String(createdUserId)),
      false
    );
    const deletedUserLogin = await request('/api/auth/login', {
      method:'POST',
      body:{ username, password:temporaryUserPassword }
    });
    assert.equal(deletedUserLogin.response.status, 401);
    const auditAfterUserDelete = await request('/api/state/bootstrap', {
      headers:auth(admin.cookie)
    });
    assert.ok(auditAfterUserDelete.body.audit.some(item =>
      item.entityId === String(createdUserId) &&
      item.action === 'excluiu definitivamente' &&
      item.details.includes('Justificativa:')
    ));

    console.log('46 verificações integradas de API e segurança passaram.');
  }finally{
    await cleanup();
    await closePool();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
