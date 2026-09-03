/* Motor de recomendação de veículo - usado no campo "Veículo" da tela de
   Nova Reserva para sugerir, por local, o veículo mais "livre" da frota
   naquele momento.

   Critérios, em ordem de prioridade (do que mais compromete a
   disponibilidade/confiabilidade do veículo para o que só ajuda a
   equilibrar o uso entre a frota):
   1. Sem bloqueio ativo ou próximo, por qualquer motivo - um veículo
      prestes a ficar indisponível não deveria ser o sugerido, mesmo que
      esteja com pouco uso.
   2. Sem avaria registrada recentemente (retirada/devolução) - reflete o
      estado/confiabilidade atual do veículo.
   3. Menos reservas ativas ou próximas - equilibra a demanda entre a frota.
   4. Menor quilometragem total do veículo - equilibra o desgaste entre a
      frota. Usa a leitura do odômetro registrada na devolução mais recente,
      não a soma das viagens (devolução - retirada) feitas pelo sistema: o
      odômetro do carro é cumulativo e reflete qualquer km rodado entre
      reservas mesmo sem passar pelo sistema (ex.: uso interno sem reserva
      formal), o que a soma das viagens registradas não capturaria.

   Recebe os dados já carregados via `context` (em vez de ler
   getReservations()/getVehicles()/getVehicleBlocks() diretamente) para
   funcionar tanto no navegador quanto em testes puros com node:test.
   ========================================================= */
const VEHICLE_RECOMMENDATION_UPCOMING_DAYS = 30;
const VEHICLE_RECOMMENDATION_RECENT_DAMAGE_DAYS = 60;

function addDaysToISODate(iso, days){
  const parts = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return date.toISOString().slice(0, 10);
}

function reservationHasDamageReport(reservation){
  const operacao = reservation.operacao || {};
  return ['retirada', 'devolucao'].some(phase => {
    const record = operacao[phase];
    return !!(record && String(record.avarias || '').trim());
  });
}

// Estatísticas de um veículo específico dentro do local - quanto "melhor"
// (mais recomendável) em cada critério, menor/falso o valor correspondente.
function vehicleRecommendationStats(local, codigo, context){
  const today = context.today;
  const upcomingEnd = addDaysToISODate(today, VEHICLE_RECOMMENDATION_UPCOMING_DAYS);
  const damageThreshold = new Date(today + 'T00:00:00Z');
  damageThreshold.setUTCDate(damageThreshold.getUTCDate() - VEHICLE_RECOMMENDATION_RECENT_DAMAGE_DAYS);

  const reservas = (context.reservations || []).filter(r =>
    r.partida === local && String(r.carro) === String(codigo)
  );

  const reservasAtivasOuProximas = reservas.filter(r =>
    !context.isReservationCompleted(r) && r.dataVolta >= today && r.dataIda <= upcomingEnd
  ).length;

  const temBloqueio = (context.blocks || []).some(b =>
    b.local === local && String(b.carro) === String(codigo) && b.dataFim >= today
  );

  // Maior leitura de odômetro já registrada numa devolução deste veículo -
  // não a soma das viagens: ver comentário no topo do arquivo.
  let kmTotal = 0;
  let kmTotalRegistradoEm = null;
  let temAvariaRecente = false;
  reservas.forEach(r => {
    const operacao = r.operacao || {};
    const devolucao = operacao.devolucao;
    if(devolucao && devolucao.registradoEm && Number.isFinite(Number(devolucao.quilometragem))){
      const registradoEm = new Date(devolucao.registradoEm);
      if(!isNaN(registradoEm) && (!kmTotalRegistradoEm || registradoEm > kmTotalRegistradoEm)){
        kmTotalRegistradoEm = registradoEm;
        kmTotal = Number(devolucao.quilometragem);
      }
    }
    if(reservationHasDamageReport(r)){
      ['retirada', 'devolucao'].forEach(phase => {
        const record = operacao[phase];
        if(!record || !String(record.avarias || '').trim() || !record.registradoEm) return;
        const registradoEm = new Date(record.registradoEm);
        if(!isNaN(registradoEm) && registradoEm >= damageThreshold) temAvariaRecente = true;
      });
    }
  });

  return { codigo, temBloqueio, temAvariaRecente, reservasAtivasOuProximas, kmTotal };
}

// Ordena do mais para o menos recomendado - negativo quando "a" deve vir
// antes de "b" (ou seja, "a" é a melhor recomendação das duas).
function compareVehicleRecommendation(a, b){
  if(a.temBloqueio !== b.temBloqueio) return a.temBloqueio ? 1 : -1;
  if(a.temAvariaRecente !== b.temAvariaRecente) return a.temAvariaRecente ? 1 : -1;
  if(a.reservasAtivasOuProximas !== b.reservasAtivasOuProximas){
    return a.reservasAtivasOuProximas - b.reservasAtivasOuProximas;
  }
  return a.kmTotal - b.kmTotal;
}

// Código do veículo recomendado para o local, ou null se não houver pelo
// menos dois veículos ativos ali (sem escolha real a fazer) ou nenhum
// dado suficiente. `context`: { vehicles, reservations, blocks, today,
// isReservationCompleted }.
function getRecommendedVehicleCodigo(local, context){
  if(!local) return null;
  const vehicles = (context.vehicles || []).filter(v => v.ativo !== false && v.local === local);
  if(vehicles.length < 2) return null;
  const stats = vehicles.map(v => vehicleRecommendationStats(local, v.codigo, context));
  stats.sort(compareVehicleRecommendation);
  return stats[0].codigo;
}

// Cache em memória do veículo recomendado por local - recalcular a cada
// tecla/seleção no formulário de reserva era o que deixava o campo "Veículo"
// (e, em cadeia, a seção de caronas compatíveis, que roda logo depois no
// mesmo evento) visivelmente lentos para aparecer. Só é limpo quando algo
// que entra na conta muda de verdade: reserva ou bloqueio salvos
// (invalidateVehicleRecommendationCache, chamada por js/storage.js dentro
// de saveReservations/saveVehicleBlocks) - e, naturalmente, a cada
// carregamento da página.
const vehicleRecommendationCache = new Map();

function invalidateVehicleRecommendationCache(local){
  if(local){
    vehicleRecommendationCache.delete(local);
  } else {
    vehicleRecommendationCache.clear();
  }
}

// No navegador, monta o context a partir dos dados já carregados
// (getReservations/getVehicles/getVehicleBlocks/isReservationCompleted,
// todas globais definidas em js/storage.js e js/utils.js).
function getRecommendedVehicleCodigoForBranch(local){
  if(typeof getVehicles !== 'function' || !local) return null;
  if(vehicleRecommendationCache.has(local)){
    return vehicleRecommendationCache.get(local);
  }
  const codigo = getRecommendedVehicleCodigo(local, {
    vehicles: getVehicles(),
    reservations: getReservations(),
    blocks: getVehicleBlocks(),
    today: todayISO(),
    isReservationCompleted: isReservationCompleted
  });
  vehicleRecommendationCache.set(local, codigo);
  return codigo;
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    getRecommendedVehicleCodigo,
    compareVehicleRecommendation,
    vehicleRecommendationStats
  };
}
