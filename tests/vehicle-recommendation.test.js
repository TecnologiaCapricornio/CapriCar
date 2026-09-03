const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getRecommendedVehicleCodigo,
  compareVehicleRecommendation,
  vehicleRecommendationStats
} = require('../js/vehicle-recommendation');

const TODAY = '2026-09-02';

function baseContext(overrides){
  return {
    vehicles:[
      { codigo:'A', local:'São Paulo', ativo:true },
      { codigo:'B', local:'São Paulo', ativo:true }
    ],
    reservations:[],
    blocks:[],
    today:TODAY,
    isReservationCompleted:r => r.status === 'concluida',
    ...(overrides || {})
  };
}

test('sem pelo menos dois veículos ativos no local, não há recomendação', () => {
  assert.equal(getRecommendedVehicleCodigo('São Paulo', baseContext({
    vehicles:[{ codigo:'A', local:'São Paulo', ativo:true }]
  })), null);
  assert.equal(getRecommendedVehicleCodigo('', baseContext()), null);
  assert.equal(getRecommendedVehicleCodigo(null, baseContext()), null);
});

test('ignora veículos inativos ou de outro local na contagem de candidatos', () => {
  const context = baseContext({
    vehicles:[
      { codigo:'A', local:'São Paulo', ativo:true },
      { codigo:'B', local:'São Paulo', ativo:false },
      { codigo:'C', local:'São Carlos', ativo:true }
    ]
  });
  assert.equal(getRecommendedVehicleCodigo('São Paulo', context), null);
});

test('sem nenhum critério de desempate, o resultado é estável (primeiro da lista)', () => {
  assert.equal(getRecommendedVehicleCodigo('São Paulo', baseContext()), 'A');
});

test('prioriza veículo sem bloqueio ativo/próximo, mesmo com mais reservas', () => {
  const context = baseContext({
    reservations:[
      { partida:'São Paulo', carro:'B', dataIda:'2026-09-05', dataVolta:'2026-09-05', status:'confirmada' }
    ],
    blocks:[
      { local:'São Paulo', carro:'A', dataInicio:'2026-09-10', dataFim:'2026-09-12' }
    ]
  });
  assert.equal(getRecommendedVehicleCodigo('São Paulo', context), 'B');
});

test('bloqueio que já terminou não conta contra o veículo', () => {
  const context = baseContext({
    blocks:[
      { local:'São Paulo', carro:'A', dataInicio:'2026-08-01', dataFim:'2026-08-15' }
    ]
  });
  assert.equal(getRecommendedVehicleCodigo('São Paulo', context), 'A');
});

test('bloqueio de outro veículo ou outro local não afeta o candidato', () => {
  const context = baseContext({
    blocks:[
      { local:'São Paulo', carro:'B', dataInicio:'2026-09-10', dataFim:'2026-09-12' },
      { local:'São Carlos', carro:'A', dataInicio:'2026-09-10', dataFim:'2026-09-12' }
    ]
  });
  assert.equal(getRecommendedVehicleCodigo('São Paulo', context), 'A');
});

test('prioriza veículo sem avaria recente sobre menos reservas', () => {
  const context = baseContext({
    reservations:[
      {
        partida:'São Paulo', carro:'A', dataIda:'2026-08-20', dataVolta:'2026-08-20', status:'concluida',
        operacao:{
          retirada:{ quilometragem:1000, registradoEm:'2026-08-20T08:00:00Z' },
          devolucao:{ quilometragem:1050, avarias:'Risco na porta', registradoEm:'2026-08-20T18:00:00Z' }
        }
      },
      { partida:'São Paulo', carro:'B', dataIda:'2026-09-05', dataVolta:'2026-09-05', status:'confirmada' },
      { partida:'São Paulo', carro:'B', dataIda:'2026-09-06', dataVolta:'2026-09-06', status:'confirmada' }
    ]
  });
  // A tem avaria recente (13 dias atrás) mesmo tendo menos reservas ativas -
  // B ganha por não ter avaria, apesar de ter 2 reservas próximas contra 0 de A.
  assert.equal(getRecommendedVehicleCodigo('São Paulo', context), 'B');
});

test('avaria antiga (fora da janela de 60 dias) não conta como recente', () => {
  const context = baseContext({
    reservations:[
      {
        partida:'São Paulo', carro:'A', dataIda:'2026-01-10', dataVolta:'2026-01-10', status:'concluida',
        operacao:{
          retirada:{ quilometragem:1000, registradoEm:'2026-01-10T08:00:00Z' },
          devolucao:{ quilometragem:1050, avarias:'Amassado antigo', registradoEm:'2026-01-10T18:00:00Z' }
        }
      }
    ]
  });
  const stats = vehicleRecommendationStats('São Paulo', 'A', context);
  assert.equal(stats.temAvariaRecente, false);
});

test('entre veículos sem bloqueio e sem avaria recente, ganha quem tem menos reservas ativas/próximas', () => {
  const context = baseContext({
    reservations:[
      { partida:'São Paulo', carro:'A', dataIda:'2026-09-05', dataVolta:'2026-09-05', status:'confirmada' },
      { partida:'São Paulo', carro:'A', dataIda:'2026-09-10', dataVolta:'2026-09-10', status:'confirmada' },
      { partida:'São Paulo', carro:'B', dataIda:'2026-09-05', dataVolta:'2026-09-05', status:'confirmada' }
    ]
  });
  assert.equal(getRecommendedVehicleCodigo('São Paulo', context), 'B');
});

test('reserva já concluída, ou muito no futuro, não conta como "ativa ou próxima"', () => {
  const context = baseContext({
    reservations:[
      { partida:'São Paulo', carro:'A', dataIda:'2026-08-01', dataVolta:'2026-08-01', status:'concluida' },
      { partida:'São Paulo', carro:'A', dataIda:'2026-12-25', dataVolta:'2026-12-25', status:'confirmada' },
      { partida:'São Paulo', carro:'B', dataIda:'2026-09-05', dataVolta:'2026-09-05', status:'confirmada' }
    ]
  });
  // A não tem nenhuma reserva "ativa ou próxima" (uma já concluída, outra
  // longe demais no futuro) - fica na frente mesmo com mais linhas no histórico.
  assert.equal(getRecommendedVehicleCodigo('São Paulo', context), 'A');
});

test('em último critério, ganha quem tem a menor leitura de odômetro mais recente', () => {
  const context = baseContext({
    reservations:[
      {
        partida:'São Paulo', carro:'A', dataIda:'2026-08-01', dataVolta:'2026-08-01', status:'concluida',
        operacao:{
          retirada:{ quilometragem:1000, registradoEm:'2026-08-01T08:00:00Z' },
          devolucao:{ quilometragem:1200, registradoEm:'2026-08-01T18:00:00Z' }
        }
      },
      {
        partida:'São Paulo', carro:'B', dataIda:'2026-08-01', dataVolta:'2026-08-01', status:'concluida',
        operacao:{
          retirada:{ quilometragem:2000, registradoEm:'2026-08-01T08:00:00Z' },
          devolucao:{ quilometragem:2050, registradoEm:'2026-08-01T18:00:00Z' }
        }
      }
    ]
  });
  // A tem odômetro em 1200 na última devolução, B em 2050 - A ganha, mesmo
  // tendo rodado mais nessa viagem específica (200 x 50) - o critério é a
  // leitura absoluta do odômetro, não o quanto rodou dentro do sistema.
  assert.equal(getRecommendedVehicleCodigo('São Paulo', context), 'A');
});

test('usa a devolução mais recente (por registradoEm), não a soma das viagens', () => {
  const context = baseContext({
    reservations:[
      {
        partida:'São Paulo', carro:'A', dataIda:'2026-07-01', dataVolta:'2026-07-01', status:'concluida',
        operacao:{
          retirada:{ quilometragem:1000, registradoEm:'2026-07-01T08:00:00Z' },
          devolucao:{ quilometragem:1200, registradoEm:'2026-07-01T18:00:00Z' }
        }
      },
      {
        // Retirada em 1500 (200km rodados fora do sistema entre as duas
        // viagens) - o odômetro da devolução mais recente já reflete isso.
        partida:'São Paulo', carro:'A', dataIda:'2026-08-01', dataVolta:'2026-08-01', status:'concluida',
        operacao:{
          retirada:{ quilometragem:1500, registradoEm:'2026-08-01T08:00:00Z' },
          devolucao:{ quilometragem:1650, registradoEm:'2026-08-01T18:00:00Z' }
        }
      }
    ]
  });
  const stats = vehicleRecommendationStats('São Paulo', 'A', context);
  // Soma das viagens registradas seria 200 + 150 = 350; o odômetro real
  // (última devolução) é 1650 - é este valor que deve prevalecer.
  assert.equal(stats.kmTotal, 1650);
});

test('viagem sem devolução registrada não conta para a quilometragem', () => {
  const context = baseContext({
    reservations:[
      { partida:'São Paulo', carro:'A', dataIda:'2026-08-01', dataVolta:'2026-08-01', status:'confirmada' },
      {
        partida:'São Paulo', carro:'A', dataIda:'2026-07-01', dataVolta:'2026-07-01', status:'concluida',
        operacao:{ retirada:{ quilometragem:1000, registradoEm:'2026-07-01T08:00:00Z' } }
      }
    ]
  });
  const stats = vehicleRecommendationStats('São Paulo', 'A', context);
  assert.equal(stats.kmTotal, 0);
});

test('compareVehicleRecommendation é usável diretamente como comparador de sort', () => {
  const list = [
    { codigo:'X', temBloqueio:true, temAvariaRecente:false, reservasAtivasOuProximas:0, kmTotal:0 },
    { codigo:'Y', temBloqueio:false, temAvariaRecente:false, reservasAtivasOuProximas:3, kmTotal:500 },
    { codigo:'Z', temBloqueio:false, temAvariaRecente:false, reservasAtivasOuProximas:1, kmTotal:900 }
  ];
  list.sort(compareVehicleRecommendation);
  assert.deepEqual(list.map(item => item.codigo), ['Z', 'Y', 'X']);
});
