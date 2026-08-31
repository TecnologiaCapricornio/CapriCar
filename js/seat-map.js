/* =========================================================
   Mapa de lugares

   O ProjetoAPPCarro tinha um seletor de assentos com a lista fixa em 5
   posições, o que inviabilizava van e ônibus. Aqui o desenho é DERIVADO
   do tipo e da capacidade cadastrados no veículo, então uma van de 15
   lugares funciona sem tocar em código.

   Escopo deliberado: este mapa mostra OCUPAÇÃO (quantos lugares existem e
   quantos estão tomados), não escolha de assento. O CapriCar não guarda
   assento por passageiro, e inventar essa coluna só para desenhar a tela
   seria mudança de modelo sem pedido - quando/se a escolha de assento
   entrar, é aqui que ela se encaixa.
   ========================================================= */

// Quantos lugares por fileira, por tipo de veículo. O motorista ocupa
// sempre a primeira posição da primeira fileira.
const SEAT_LAYOUTS = {
  carro:{ porFileira:[2, 3], corredor:false, rotulo:'Carro' },
  van:{ porFileira:[2, 3], corredor:true, rotulo:'Van' },
  onibus:{ porFileira:[2, 2], corredor:true, rotulo:'Ônibus' }
};

function seatLayoutFor(tipo){
  return SEAT_LAYOUTS[String(tipo || 'carro')] || SEAT_LAYOUTS.carro;
}

// Distribui `capacidade` lugares em fileiras conforme o layout.
// A primeira fileira usa porFileira[0] (banco da frente); as demais usam
// porFileira[1]. Devolve um array de arrays com o índice de cada lugar.
function buildSeatRows(tipo, capacidade){
  const layout = seatLayoutFor(tipo);
  const total = Math.max(1, Math.min(20, Number(capacidade) || 1));
  const rows = [];
  let indice = 0;

  const primeira = Math.min(layout.porFileira[0], total);
  rows.push(Array.from({ length:primeira }, () => indice++));

  while(indice < total){
    const restante = total - indice;
    const nesta = Math.min(layout.porFileira[1], restante);
    rows.push(Array.from({ length:nesta }, () => indice++));
  }
  return rows;
}

// Estado de cada lugar: 'motorista' (índice 0), 'ocupado' ou 'livre'.
function seatStates(tipo, capacidade, ocupantes){
  const total = Math.max(1, Math.min(20, Number(capacidade) || 1));
  const tomados = Math.max(0, Math.min(total, Number(ocupantes) || 0));
  return Array.from({ length:total }, (_, i) => {
    if(i === 0) return 'motorista';
    return i < tomados ? 'ocupado' : 'livre';
  });
}

function renderSeatMapHTML(reserva){
  if(typeof getVehicle !== 'function') return '';
  const veiculo = getVehicle(reserva.partida, reserva.carro);
  const tipo = (veiculo && veiculo.tipo) || 'carro';
  const capacidade = typeof getVehicleCapacity === 'function'
    ? getVehicleCapacity(reserva)
    : (veiculo && veiculo.capacidade) || 5;
  const ocupantes = typeof getOcupantes === 'function' ? getOcupantes(reserva) : 1;

  const layout = seatLayoutFor(tipo);
  const estados = seatStates(tipo, capacidade, ocupantes);
  const rows = buildSeatRows(tipo, capacidade);
  const livres = estados.filter(e => e === 'livre').length;

  const fileiras = rows.map(fileira => {
    const lugares = fileira.map(indice => {
      const estado = estados[indice];
      const titulo = estado === 'motorista' ? 'Motorista'
        : (estado === 'ocupado' ? 'Lugar ocupado' : 'Lugar livre');
      const simbolo = estado === 'motorista' ? '🚘' : (estado === 'ocupado' ? '•' : '');
      return '<span class="seat seat-' + estado + '" role="img" aria-label="' +
        escapeHTML(titulo) + '" title="' + escapeHTML(titulo) + '">' + simbolo + '</span>';
    }).join('');
    return '<div class="seat-row' + (layout.corredor ? ' seat-row-aisle' : '') + '">' + lugares + '</div>';
  }).join('');

  return '<div class="seat-map" aria-label="Mapa de lugares do veículo">' +
    '<div class="seat-map-head">' +
      '<strong>' + escapeHTML(layout.rotulo) + '</strong>' +
      '<small>' + livres + (livres === 1 ? ' lugar livre' : ' lugares livres') +
        ' de ' + (capacidade - 1) + '</small>' +
    '</div>' +
    fileiras +
    '</div>';
}
