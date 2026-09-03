const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// js/seat-map.js é carregado como <script> clássico, sem exports - o mesmo
// harness usado por tests/core.test.js.
const context = { escapeHTML:s => String(s) };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'seat-map.js'), 'utf8'),
  context
);
const { seatLayoutFor } = context;

// Arrays criados dentro do vm têm outro prototype de Array, e
// deepStrictEqual compara prototype - por isso o resultado é trazido para o
// realm do teste antes de comparar. Sem isso, valores idênticos falhariam.
const trazer = valor => JSON.parse(JSON.stringify(valor));
const buildSeatRows = (tipo, cap) => trazer(context.buildSeatRows(tipo, cap));
const seatStates = (tipo, cap, ocup) => trazer(context.seatStates(tipo, cap, ocup));

test('carro de 5 lugares fica em 2 + 3', () => {
  assert.deepEqual(buildSeatRows('carro', 5), [[0, 1], [2, 3, 4]]);
});

test('van de 15 lugares se distribui sem perder nem inventar lugar', () => {
  const rows = buildSeatRows('van', 15);
  assert.equal(rows.flat().length, 15);
  assert.deepEqual(rows[0], [0, 1], 'banco da frente tem 2');
  assert.deepEqual(rows.flat(), [...Array(15).keys()], 'índices contíguos');
});

test('ônibus usa fileiras de 4 (2+corredor+2) e a última fileira pode ficar incompleta', () => {
  const rows = buildSeatRows('onibus', 7);
  assert.equal(rows.flat().length, 7);
  assert.deepEqual(rows, [[0, 1], [2, 3, 4, 5], [6]]);
});

test('capacidade menor que a primeira fileira não estoura', () => {
  assert.deepEqual(buildSeatRows('carro', 1), [[0]]);
  assert.deepEqual(buildSeatRows('van', 2), [[0, 1]]);
});

test('capacidade é limitada ao teto de cada tipo (carro 8, van 20, ônibus 48)', () => {
  assert.equal(buildSeatRows('carro', 0).flat().length, 1);
  assert.equal(buildSeatRows('carro', 99).flat().length, 8);
  assert.equal(buildSeatRows('carro', -3).flat().length, 1);
  assert.equal(buildSeatRows('van', 99).flat().length, 20);
  assert.equal(buildSeatRows('onibus', 99).flat().length, 48);
});

test('tipo desconhecido cai no layout de carro em vez de quebrar', () => {
  assert.equal(seatLayoutFor('foguete').rotulo, 'Carro');
  assert.equal(seatLayoutFor(undefined).rotulo, 'Carro');
  assert.deepEqual(buildSeatRows('foguete', 5), buildSeatRows('carro', 5));
});

test('o primeiro lugar é sempre do motorista', () => {
  assert.equal(seatStates('carro', 5, 1)[0], 'motorista');
  assert.equal(seatStates('onibus', 20, 20)[0], 'motorista');
});

test('ocupação marca os lugares na ordem, e o resto fica livre', () => {
  assert.deepEqual(
    seatStates('carro', 5, 3),
    ['motorista', 'ocupado', 'ocupado', 'livre', 'livre']
  );
});

test('veículo lotado não deixa lugar livre; vazio deixa todos menos o motorista', () => {
  assert.equal(seatStates('carro', 5, 5).filter(e => e === 'livre').length, 0);
  assert.equal(seatStates('carro', 5, 1).filter(e => e === 'livre').length, 4);
});

test('ocupantes acima da capacidade não geram lugar fantasma', () => {
  const estados = seatStates('carro', 5, 99);
  assert.equal(estados.length, 5);
  assert.equal(estados.filter(e => e === 'livre').length, 0);
});
