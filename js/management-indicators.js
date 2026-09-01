/* =========================================================
   Indicadores da frota (aba Relatórios)

   Tudo é calculado a partir do estado que já está carregado no cliente -
   reservas, veículos e usuários. Não há endpoint novo: as consultas
   equivalentes no ProjetoAPPCarro eram agregações sem índice que
   varriam a tabela inteira a cada abertura da tela.
   ========================================================= */

const indicatorsPanel = document.getElementById('indicatorsPanel');

// Reservas que contam para estatística: exclui as canceladas, que não
// representam uso real da frota. Concluídas contam - são justamente as
// viagens que aconteceram.
function indicatorReservations(){
  return getReservations().filter(
    r => normalizeReservationStatus(r.status) !== 'cancelada'
  );
}

function computeFleetIndicators(){
  const reservas = indicatorReservations();
  const veiculos = getVehicles().filter(v => v.ativo !== false);

  const totalReservas = reservas.length;
  const ocupantes = reservas.reduce((soma, r) => soma + getOcupantes(r), 0);
  const mediaOcupantes = totalReservas ? ocupantes / totalReservas : 0;

  // Lugares oferecidos x ocupados, só nas reservas que têm veículo resolvido.
  let lugaresOferecidos = 0;
  let lugaresOcupados = 0;
  reservas.forEach(r => {
    const capacidade = getVehicleCapacity(r);
    if(!capacidade) return;
    lugaresOferecidos += capacidade;
    lugaresOcupados += Math.min(capacidade, getOcupantes(r));
  });
  const aproveitamento = lugaresOferecidos ? (lugaresOcupados / lugaresOferecidos) * 100 : 0;

  const alugados = veiculos.filter(v => v.alugado === true).length;

  // Rotas mais frequentes.
  const rotas = new Map();
  reservas.forEach(r => {
    const chave = String(r.partida || '') + ' → ' + String(r.destino || '');
    rotas.set(chave, (rotas.get(chave) || 0) + 1);
  });
  const rotasTop = [...rotas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Veículos mais usados.
  const usoVeiculo = new Map();
  reservas.forEach(r => {
    const veiculo = getVehicle(r.partida, r.carro);
    if(!veiculo) return;
    const chave = String(veiculo.id);
    const atual = usoVeiculo.get(chave) || { veiculo:veiculo, total:0 };
    atual.total++;
    usoVeiculo.set(chave, atual);
  });
  const veiculosTop = [...usoVeiculo.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  // Carona: reservas em que alguém além do motorista viajou.
  const comCarona = reservas.filter(r => getOcupantes(r) > 1).length;

  return {
    totalReservas,
    mediaOcupantes,
    aproveitamento,
    comCarona,
    taxaCarona:totalReservas ? (comCarona / totalReservas) * 100 : 0,
    totalVeiculos:veiculos.length,
    alugados,
    proprios:veiculos.length - alugados,
    rotasTop,
    veiculosTop
  };
}

function indicatorCard(rotulo, valor, detalhe){
  return '<div class="indicator-card">' +
    '<span class="indicator-label">' + escapeHTML(rotulo) + '</span>' +
    '<strong class="indicator-value">' + escapeHTML(valor) + '</strong>' +
    (detalhe ? '<small class="indicator-detail">' + escapeHTML(detalhe) + '</small>' : '') +
    '</div>';
}

function indicatorList(titulo, itens, vazio){
  const linhas = itens.length
    ? itens.map(([rotulo, total]) =>
        '<li><span>' + escapeHTML(rotulo) + '</span><strong>' + total + '</strong></li>').join('')
    : '<li class="indicator-empty"><span>' + escapeHTML(vazio) + '</span></li>';
  return '<div class="indicator-list">' +
    '<h4>' + escapeHTML(titulo) + '</h4>' +
    '<ol>' + linhas + '</ol>' +
    '</div>';
}

function renderIndicators(){
  if(!indicatorsPanel || !canViewReports()) return;
  const d = computeFleetIndicators();
  const umDecimal = n => n.toFixed(1).replace('.', ',');

  indicatorsPanel.innerHTML =
    '<div class="indicator-grid">' +
      indicatorCard('Reservas', String(d.totalReservas), 'Não conta canceladas') +
      indicatorCard('Ocupantes por viagem', umDecimal(d.mediaOcupantes), 'Média, incluindo o motorista') +
      indicatorCard('Aproveitamento', umDecimal(d.aproveitamento) + '%', 'Lugares ocupados sobre oferecidos') +
      indicatorCard('Viagens com carona', umDecimal(d.taxaCarona) + '%', d.comCarona + ' de ' + d.totalReservas) +
      indicatorCard('Frota ativa', String(d.totalVeiculos), d.proprios + ' próprios · ' + d.alugados + ' alugados') +
    '</div>' +
    '<div class="indicator-lists">' +
      indicatorList('Rotas mais usadas', d.rotasTop, 'Nenhuma reserva registrada.') +
      indicatorList(
        'Veículos mais usados',
        d.veiculosTop.map(item => [
          getVehicleFullModel(item.veiculo) + (item.veiculo.placa ? ' · ' + item.veiculo.placa : ''),
          item.total
        ]),
        'Nenhum veículo utilizado.'
      ) +
    '</div>';
}
