// Metadados das categorias de CNH (Código de Trânsito Brasileiro) e a regra
// de categoria mínima por capacidade do veículo: até 8 passageiros exige ao
// menos B, acima de 8 exige D. Quem tem C, D ou E já preencheu o requisito
// de B para tirar essas categorias, então também dirige veículo de categoria
// B - por isso essas entram na lista "até 8 passageiros" também.
//
// Carregado tanto via <script> no navegador quanto via require() no servidor
// (module.exports no fim do arquivo) - mesmo padrão de
// js/reservation-defaults.js, para não duplicar essa regra dos dois lados.
const CNH_ATE_8_PASSAGEIROS = ['B', 'AB', 'C', 'AC', 'D', 'AD', 'E', 'AE'];
const CNH_MAIS_DE_8_PASSAGEIROS = ['D', 'AD', 'E', 'AE'];

// icones: chaves de CNH_VEICULO_ICONS (ver js/config.js), não o SVG em si -
// mantém esse arquivo livre de markup para poder rodar no servidor também.
// Categorias combinadas (AB/AC/AD/AE) mostram os dois ícones, moto + base.
const CNH_CATEGORIA_INFO = {
  A: { icones: ['moto'], veiculos: 'Motocicletas e motonetas' },
  B: { icones: ['carro'], veiculos: 'Carros e utilitários - até 8 passageiros' },
  AB: { icones: ['moto', 'carro'], veiculos: 'Motocicletas + carros e utilitários' },
  C: { icones: ['caminhao'], veiculos: 'Caminhões e veículos de carga' },
  AC: { icones: ['moto', 'caminhao'], veiculos: 'Motocicletas + caminhões' },
  D: { icones: ['onibus'], veiculos: 'Ônibus e vans - mais de 8 passageiros' },
  AD: { icones: ['moto', 'onibus'], veiculos: 'Motocicletas + ônibus e vans' },
  E: { icones: ['carreta'], veiculos: 'Veículos articulados - carretas com reboque' },
  AE: { icones: ['moto', 'carreta'], veiculos: 'Motocicletas + veículos articulados' }
};

function cnhCapacidadeMaximaAtendida(categoria){
  const cat = String(categoria || '').trim().toUpperCase();
  if(CNH_MAIS_DE_8_PASSAGEIROS.includes(cat)) return Infinity;
  if(CNH_ATE_8_PASSAGEIROS.includes(cat)) return 8;
  return 0;
}

// true quando a categoria habilita dirigir um veículo com essa capacidade.
function cnhAtendeCapacidade(categoria, capacidade){
  return Number(capacidade || 0) <= cnhCapacidadeMaximaAtendida(categoria);
}

// Categoria mínima exigida para um veículo com essa capacidade - só para
// mensagem de erro (a checagem de verdade é cnhAtendeCapacidade, que aceita
// qualquer categoria de nível igual ou superior).
function cnhCategoriaMinimaPara(capacidade){
  return Number(capacidade || 0) > 8 ? 'D' : 'B';
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    CNH_ATE_8_PASSAGEIROS,
    CNH_MAIS_DE_8_PASSAGEIROS,
    CNH_CATEGORIA_INFO,
    cnhCapacidadeMaximaAtendida,
    cnhAtendeCapacidade,
    cnhCategoriaMinimaPara
  };
}
