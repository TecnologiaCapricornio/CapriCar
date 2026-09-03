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
// sempre a primeira posição da primeira fileira. capacidadeMaxima é o teto
// de cadastro (ver também VEHICLE_CAPACITY_LIMITS em server/validation.js,
// que precisa ser mantido igual a este).
const SEAT_LAYOUTS = {
  carro:{ porFileira:[2, 3], corredor:false, rotulo:'Carro', capacidadeMaxima:8 },
  van:{ porFileira:[2, 3], corredor:true, rotulo:'Van', capacidadeMaxima:20 },
  onibus:{ porFileira:[2, 4], corredor:true, rotulo:'Ônibus', capacidadeMaxima:48 }
};

function seatLayoutFor(tipo){
  return SEAT_LAYOUTS[String(tipo || 'carro')] || SEAT_LAYOUTS.carro;
}

// Distribui `capacidade` lugares em fileiras conforme o layout.
// A primeira fileira usa porFileira[0] (banco da frente); as demais usam
// porFileira[1]. Devolve um array de arrays com o índice de cada lugar.
function buildSeatRows(tipo, capacidade){
  const layout = seatLayoutFor(tipo);
  const total = Math.max(1, Math.min(layout.capacidadeMaxima, Number(capacidade) || 1));
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
  const layout = seatLayoutFor(tipo);
  const total = Math.max(1, Math.min(layout.capacidadeMaxima, Number(capacidade) || 1));
  const tomados = Math.max(0, Math.min(total, Number(ocupantes) || 0));
  return Array.from({ length:total }, (_, i) => {
    if(i === 0) return 'motorista';
    return i < tomados ? 'ocupado' : 'livre';
  });
}

/* =========================================================
   Desenho do veículo em SVG

   O contorno (corpo, rodas, para-brisa) é só decoração - a única coisa
   funcional são os <g class="seat ...">, que carregam as mesmas classes
   de estado (seat-motorista/seat-ocupado/seat-livre) que o resto do CSS
   e o widget interativo (js/rides.js) já esperam. Isso é o que permite
   trocar o desenho aqui sem tocar em quem consome renderSeatMapHTML.
   ========================================================= */
const SEAT_SVG_UNIT = 38, SEAT_SVG_GAP = 9, SEAT_SVG_ROW_GAP = 11, SEAT_SVG_PAD = 20,
  SEAT_SVG_AISLE = 20, SEAT_SVG_AISLE_INSET = 4, SEAT_SVG_WHEEL_W = 13, SEAT_SVG_WHEEL_H = 26,
  SEAT_SVG_NOSE = 30, SEAT_SVG_TAIL = 18, SEAT_SVG_MIRROR = 8;

// Posição x de cada COLUNA da fileira padrão (porFileira[1]), corredor
// incluso - fixa, não depende de quantos lugares a fileira atual realmente
// tem. É isso que faz uma fileira incompleta (a última, quando a capacidade
// não fecha a conta) preencher sempre o lado esquerdo primeiro, coluna a
// coluna, em vez de recalcular um corredor no meio dos lugares que sobraram.
// leftGroupSize é quantas colunas ficam antes do corredor (fileira de 4 ->
// 2+corredor+2; de 3 -> 1+corredor+2; de 2 -> 1+corredor+1).
function standardColumns(layout, bodyX){
  const total = layout.porFileira[1];
  const leftGroupSize = Math.floor(total / 2);
  const xs = [];
  let x = bodyX + SEAT_SVG_PAD;
  for(let col = 0; col < total; col++){
    xs.push(x);
    x += SEAT_SVG_UNIT;
    x += (layout.corredor && col === leftGroupSize - 1) ? SEAT_SVG_GAP + SEAT_SVG_AISLE : SEAT_SVG_GAP;
  }
  return { xs, leftGroupSize };
}

function seatIconSVG(estado){
  if(estado === 'motorista'){
    // Volante de 3 raios (aro + raios + cubo central) - um deles para
    // baixo, dois em diagonal para cima, como um volante de verdade.
    return '<g class="seat-icon icon-motorista" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
      '<circle r="9" fill="none"/>' +
      '<path d="M0,0 L0,9 M0,0 L7.8,-4.5 M0,0 L-7.8,-4.5"/>' +
      '<circle r="2.4" fill="currentColor" stroke="none"/></g>';
  }
  if(estado === 'ocupado'){
    return '<g class="seat-icon icon-ocupado" fill="currentColor">' +
      '<circle cx="0" cy="-6" r="5"/><path d="M-9,9 A9,8 0 0 1 9,9 Z"/></g>';
  }
  return '<g class="seat-icon icon-livre" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M0,-7 L0,7 M-7,0 L7,0"/></g>';
}

// Monta o SVG do veículo: contorno + rodas + para-brisa + corredor (quando
// há) + os lugares em si, posicionados fileira a fileira. A fileira do
// motorista (a primeira, com 2 lugares) é o único caso especial: o
// passageiro vai na ponta direita, não colado no motorista - é a posição
// real dos dois num carro/van/ônibus, com o painel/console no meio.
function renderVehicleSVG(tipo, capacidade, ocupantes){
  const layout = seatLayoutFor(tipo);
  const rows = buildSeatRows(tipo, capacidade);
  const estados = seatStates(tipo, capacidade, ocupantes);

  const rowContentWidth = n => n * SEAT_SVG_UNIT + (n - 1) * SEAT_SVG_GAP;
  const frontRowW = rowContentWidth(layout.porFileira[0]);
  const rearRowW = rowContentWidth(layout.porFileira[1]) + (layout.corredor && layout.porFileira[1] > 1 ? SEAT_SVG_AISLE : 0);
  const maxRowW = Math.max(frontRowW, rearRowW);
  const seatAreaH = rows.length * SEAT_SVG_UNIT + (rows.length - 1) * SEAT_SVG_ROW_GAP;

  const bodyW = maxRowW + SEAT_SVG_PAD * 2;
  const bodyH = seatAreaH + SEAT_SVG_PAD * 2 + SEAT_SVG_NOSE + SEAT_SVG_TAIL;
  const totalW = bodyW + SEAT_SVG_WHEEL_W * 2;
  const bodyX = SEAT_SVG_WHEEL_W;
  const rearColumns = standardColumns(layout, bodyX);

  let seatsSvg = '';
  let aisleSvg = '';
  rows.forEach((row, ri) => {
    const n = row.length;
    const y = SEAT_SVG_NOSE + SEAT_SVG_PAD + ri * (SEAT_SVG_UNIT + SEAT_SVG_ROW_GAP);
    const isDriverRow = ri === 0 && n === 2;
    let xs;
    if(isDriverRow){
      // Motorista na ponta esquerda, passageiro na ponta direita (posição
      // real - o vão do meio é painel/console, não corredor).
      xs = [bodyX + SEAT_SVG_PAD, bodyX + SEAT_SVG_PAD + maxRowW - SEAT_SVG_UNIT];
    } else {
      // Cada lugar usa a coluna fixa da fileira padrão - uma fileira mais
      // curta (a última, quando a capacidade não fecha a conta) só ocupa as
      // primeiras colunas do lado esquerdo, sem recalcular o corredor.
      xs = rearColumns.xs.slice(0, n);
    }
    row.forEach((indice, si) => {
      const x = xs[si];
      const estado = estados[indice];
      const titulo = estado === 'motorista' ? 'Motorista'
        : (estado === 'ocupado' ? 'Lugar ocupado' : 'Lugar livre');
      seatsSvg += '<g class="seat seat-' + estado + '" role="img" aria-label="' + escapeHTML(titulo) + '">' +
        '<title>' + escapeHTML(titulo) + '</title>' +
        '<rect x="' + x + '" y="' + y + '" width="' + SEAT_SVG_UNIT + '" height="' + SEAT_SVG_UNIT + '" rx="10"/>' +
        '<g transform="translate(' + (x + SEAT_SVG_UNIT / 2) + ',' + (y + SEAT_SVG_UNIT / 2) + ')">' + seatIconSVG(estado) + '</g>' +
        '</g>';
    });
    // O corredor dessa fileira só existe se ela realmente tem lugar dos dois
    // lados - uma fileira que só preencheu o lado esquerdo não desenha nada
    // à direita (ver standardColumns acima).
    if(!isDriverRow && layout.corredor && n > rearColumns.leftGroupSize){
      const gapLeft = xs[rearColumns.leftGroupSize - 1] + SEAT_SVG_UNIT + SEAT_SVG_AISLE_INSET;
      const gapRight = xs[rearColumns.leftGroupSize] - SEAT_SVG_AISLE_INSET;
      aisleSvg += '<rect class="car-aisle" x="' + gapLeft + '" y="' + (y - 5) + '" width="' + (gapRight - gapLeft) + '" height="' + (SEAT_SVG_UNIT + 10) + '" rx="5"/>';
    }
  });

  const glassW = maxRowW * 0.5;
  const glassX = bodyX + (bodyW - glassW) / 2;
  const wheelFrontY = SEAT_SVG_NOSE + SEAT_SVG_PAD + SEAT_SVG_UNIT * 0.15;
  const wheelBackY = bodyH - SEAT_SVG_TAIL - SEAT_SVG_PAD - SEAT_SVG_UNIT * 0.15 - SEAT_SVG_WHEEL_H;
  // As rodas ficam quase todas para fora do contorno - só uma borda fina
  // encosta no corpo, então o traço do contorno nunca corta a roda ao meio.
  const wheelOverlap = 2;
  const wheelsSvg =
    '<rect class="car-wheel" x="' + (bodyX - SEAT_SVG_WHEEL_W + wheelOverlap) + '" y="' + wheelFrontY + '" width="' + SEAT_SVG_WHEEL_W + '" height="' + SEAT_SVG_WHEEL_H + '" rx="4"/>' +
    '<rect class="car-wheel" x="' + (bodyX + bodyW - wheelOverlap) + '" y="' + wheelFrontY + '" width="' + SEAT_SVG_WHEEL_W + '" height="' + SEAT_SVG_WHEEL_H + '" rx="4"/>' +
    '<rect class="car-wheel" x="' + (bodyX - SEAT_SVG_WHEEL_W + wheelOverlap) + '" y="' + wheelBackY + '" width="' + SEAT_SVG_WHEEL_W + '" height="' + SEAT_SVG_WHEEL_H + '" rx="4"/>' +
    '<rect class="car-wheel" x="' + (bodyX + bodyW - wheelOverlap) + '" y="' + wheelBackY + '" width="' + SEAT_SVG_WHEEL_W + '" height="' + SEAT_SVG_WHEEL_H + '" rx="4"/>';
  const mirrorsSvg =
    '<rect class="car-mirror" x="' + (bodyX - SEAT_SVG_MIRROR * 0.9) + '" y="' + (SEAT_SVG_NOSE + 6) + '" width="' + SEAT_SVG_MIRROR + '" height="' + (SEAT_SVG_MIRROR * 0.6) + '" rx="2"/>' +
    '<rect class="car-mirror" x="' + (bodyX + bodyW - SEAT_SVG_MIRROR * 0.1) + '" y="' + (SEAT_SVG_NOSE + 6) + '" width="' + SEAT_SVG_MIRROR + '" height="' + (SEAT_SVG_MIRROR * 0.6) + '" rx="2"/>';

  return '<svg width="' + totalW + '" height="' + bodyH + '" viewBox="0 0 ' + totalW + ' ' + bodyH + '" aria-hidden="true" focusable="false">' +
    '<rect class="car-body" x="' + bodyX + '" y="0" width="' + bodyW + '" height="' + bodyH + '" rx="26"/>' +
    wheelsSvg + mirrorsSvg +
    '<rect class="car-glass" x="' + glassX + '" y="' + (SEAT_SVG_NOSE * 0.35) + '" width="' + glassW + '" height="' + (SEAT_SVG_NOSE * 0.5) + '" rx="8"/>' +
    aisleSvg + seatsSvg +
    '</svg>';
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

  // O cabeçalho traz só o tipo do veículo. A contagem de lugares livres fica
  // na etiqueta de vagas que acompanha o mapa (ver renderOccupancyHTML em
  // js/rides.js) - repetir aqui era a redundância que a tela tinha.
  return '<div class="seat-map" aria-label="Mapa de lugares do veículo">' +
    '<div class="seat-map-head"><strong>' + escapeHTML(layout.rotulo) + '</strong></div>' +
    renderVehicleSVG(tipo, capacidade, ocupantes) +
    '</div>';
}
