const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CNH_CATEGORIA_INFO,
  cnhAtendeCapacidade,
  cnhCategoriaMinimaPara
} = require('../js/cnh-categorias');

test('categoria B atende veículo de até 8 passageiros', () => {
  assert.equal(cnhAtendeCapacidade('B', 1), true);
  assert.equal(cnhAtendeCapacidade('B', 8), true);
});

test('categoria B não atende veículo de mais de 8 passageiros', () => {
  assert.equal(cnhAtendeCapacidade('B', 9), false);
  assert.equal(cnhAtendeCapacidade('B', 48), false);
});

test('categoria D atende veículo de qualquer capacidade', () => {
  assert.equal(cnhAtendeCapacidade('D', 8), true);
  assert.equal(cnhAtendeCapacidade('D', 9), true);
  assert.equal(cnhAtendeCapacidade('D', 48), true);
});

test('quem tem C, D ou E também atende veículo de até 8 - já tinha B para tirar essas', () => {
  ['C', 'AC', 'D', 'AD', 'E', 'AE'].forEach(categoria => {
    assert.equal(cnhAtendeCapacidade(categoria, 5), true, categoria);
  });
});

test('categoria A (só moto) não atende nenhum veículo de passageiros', () => {
  assert.equal(cnhAtendeCapacidade('A', 1), false);
  assert.equal(cnhAtendeCapacidade('A', 9), false);
});

test('categoria C não atende veículo de mais de 8 passageiros - exige D', () => {
  assert.equal(cnhAtendeCapacidade('C', 9), false);
});

test('categoria ausente, vazia ou desconhecida não atende nenhum veículo', () => {
  assert.equal(cnhAtendeCapacidade('', 1), false);
  assert.equal(cnhAtendeCapacidade(null, 1), false);
  assert.equal(cnhAtendeCapacidade('X', 1), false);
});

test('categoria é lida sem diferenciar maiúsculas/minúsculas', () => {
  assert.equal(cnhAtendeCapacidade('b', 5), true);
  assert.equal(cnhAtendeCapacidade('d', 20), true);
});

test('cnhCategoriaMinimaPara aponta B até 8 e D acima disso', () => {
  assert.equal(cnhCategoriaMinimaPara(8), 'B');
  assert.equal(cnhCategoriaMinimaPara(9), 'D');
  assert.equal(cnhCategoriaMinimaPara(48), 'D');
});

test('toda categoria de CNH_CATEGORIA_INFO tem ao menos um ícone e uma descrição', () => {
  Object.entries(CNH_CATEGORIA_INFO).forEach(([categoria, info]) => {
    assert.ok(Array.isArray(info.icones) && info.icones.length > 0, categoria);
    assert.ok(String(info.veiculos || '').length > 0, categoria);
  });
});
