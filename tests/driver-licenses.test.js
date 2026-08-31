const test = require('node:test');
const assert = require('node:assert/strict');

const {
  licenseStatus,
  licenseStatusMessage,
  canDrive,
  validateLicenseInput,
  DEFAULT_WARNING_DAYS
} = require('../server/driver-licenses');

const HOJE = '2026-08-31';
const cnh = validade => ({ numero:'12345678900', categoria:'AB', validade });

test('sem CNH cadastrada o estado é ausente', () => {
  assert.equal(licenseStatus(null, HOJE).estado, 'ausente');
  assert.equal(licenseStatus({}, HOJE).estado, 'ausente');
});

test('CNH sem número ou sem validade conta como ausente', () => {
  assert.equal(licenseStatus({ numero:'', validade:'2027-01-01' }, HOJE).estado, 'ausente');
  assert.equal(licenseStatus({ numero:'12345678900', validade:'' }, HOJE).estado, 'ausente');
});

test('validade folgada fica válida e não avisa', () => {
  const status = licenseStatus(cnh('2027-06-30'), HOJE);
  assert.equal(status.estado, 'valida');
  assert.equal(licenseStatusMessage(status), '');
});

test('exatamente na borda da janela de 60 dias já avisa', () => {
  const status = licenseStatus(cnh('2026-10-30'), HOJE); // 60 dias
  assert.equal(status.diasRestantes, DEFAULT_WARNING_DAYS);
  assert.equal(status.estado, 'vencendo');
});

test('um dia além da janela ainda não avisa', () => {
  const status = licenseStatus(cnh('2026-10-31'), HOJE); // 61 dias
  assert.equal(status.diasRestantes, DEFAULT_WARNING_DAYS + 1);
  assert.equal(status.estado, 'valida');
});

test('vencimento no próprio dia conta como vencendo, não vencida', () => {
  const status = licenseStatus(cnh(HOJE), HOJE);
  assert.equal(status.estado, 'vencendo');
  assert.equal(status.diasRestantes, 0);
  assert.match(licenseStatusMessage(status), /vence hoje/i);
});

test('data anterior a hoje fica vencida com dias negativos', () => {
  const status = licenseStatus(cnh('2026-08-30'), HOJE);
  assert.equal(status.estado, 'vencida');
  assert.equal(status.diasRestantes, -1);
  assert.match(licenseStatusMessage(status), /venceu ontem/i);
});

test('mensagem usa singular e plural corretamente', () => {
  assert.match(licenseStatusMessage(licenseStatus(cnh('2026-09-01'), HOJE)), /vence amanhã/i);
  assert.match(licenseStatusMessage(licenseStatus(cnh('2026-09-10'), HOJE)), /vence em 10 dias/i);
  assert.match(licenseStatusMessage(licenseStatus(cnh('2026-08-21'), HOJE)), /venceu há 10 dias/i);
});

test('a janela de aviso é configurável', () => {
  const status = licenseStatus(cnh('2026-09-20'), HOJE, 30); // 20 dias
  assert.equal(status.estado, 'vencendo');
  assert.equal(licenseStatus(cnh('2026-09-20'), HOJE, 10).estado, 'valida');
});

test('dirige quem tem CNH válida ou vencendo; não dirige sem CNH ou vencida', () => {
  assert.equal(canDrive(cnh('2027-06-30'), HOJE), true);
  assert.equal(canDrive(cnh('2026-09-10'), HOJE), true, 'vencendo é aviso, não bloqueio');
  assert.equal(canDrive(cnh(HOJE), HOJE), true, 'ainda vale no dia do vencimento');
  assert.equal(canDrive(cnh('2026-08-30'), HOJE), false);
  assert.equal(canDrive(null, HOJE), false);
});

test('a virada do mês e do ano não desloca a contagem', () => {
  assert.equal(licenseStatus(cnh('2026-09-01'), '2026-08-31').diasRestantes, 1);
  assert.equal(licenseStatus(cnh('2027-01-01'), '2026-12-31').diasRestantes, 1);
  assert.equal(licenseStatus(cnh('2028-03-01'), '2028-02-28').diasRestantes, 2, 'ano bissexto');
});

test('cadastro em branco é aceito e significa remover a CNH', () => {
  assert.equal(validateLicenseInput({ numero:'', categoria:'', validade:'' }), null);
});

test('número da CNH exige de 9 a 11 dígitos', () => {
  const base = { categoria:'AB', validade:'2027-01-01' };
  assert.throws(() => validateLicenseInput({ ...base, numero:'123' }), /9 a 11 dígitos/);
  assert.throws(() => validateLicenseInput({ ...base, numero:'123456789012' }), /9 a 11 dígitos/);
  assert.throws(() => validateLicenseInput({ ...base, numero:'ABCDEFGHI' }), /9 a 11 dígitos/);
  assert.equal(validateLicenseInput({ ...base, numero:'123456789' }).numero, '123456789');
});

test('categoria fora da lista é recusada e a válida é normalizada', () => {
  const base = { numero:'12345678900', validade:'2027-01-01' };
  assert.throws(() => validateLicenseInput({ ...base, categoria:'Z' }), /categoria/i);
  assert.equal(validateLicenseInput({ ...base, categoria:'ab' }).categoria, 'AB');
});

test('validade precisa ser uma data real', () => {
  const base = { numero:'12345678900', categoria:'AB' };
  assert.throws(() => validateLicenseInput({ ...base, validade:'31/12/2027' }), /validade/i);
  assert.throws(() => validateLicenseInput({ ...base, validade:'2027-02-30' }), /validade/i);
});
