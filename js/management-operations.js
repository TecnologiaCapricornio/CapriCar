/* Gestão — retirada, devolução e fotos de operação */

/* Gestão de frota, bloqueios, operação, auditoria e relatórios */

/* =========================================================
   Checklist de avaria (retirada/devolução)

   Ativado por um checkbox opcional no formulário de retirada/devolução -
   só aparece quando marcado "houve avaria". Guarda os pontos marcados no
   diagrama do veículo (vista de cima) e o status de cada item da lista de
   componentes (C = conforme, A = avaria com uso possível, X = avaria que
   impossibilita o uso), igual ao formulário em papel usado hoje.

   Os dados estruturados ficam em operacao[fase].checklist, mas um resumo em
   texto também é anexado ao campo "avarias" (já existente) - assim tudo que
   já reage a esse campo (relatórios, notificação ao responsável pela frota,
   recomendação de veículo) continua funcionando sem precisar saber que o
   checklist existe. Ver reservationHasOperationReport em js/utils.js e
   notifyOperationReport em server/notifications.js, que também passaram a
   considerar a presença do checklist diretamente (ver ids ali).
   ========================================================= */
// O diagrama é dividido em 4 vistas separadas (frente, traseira, lateral
// esquerda e lateral direita), igual ao checklist de papel usado hoje - bem
// mais fácil de identificar cada parte do que um único desenho de cima.
// Cada vista tem sua própria imagem (assets/checklist-car-*.png) e um
// sistema de coordenadas próprio (w x h); os pontos abaixo usam essas
// coordenadas para se posicionar em cima da imagem (ver renderChecklistDiagram).
const CHECKLIST_DIAGRAM_VIEWS = [
  { id:'frontal', label:'Frente', img:'assets/checklist-car-front.png', w:492, h:234 },
  { id:'traseira', label:'Traseira', img:'assets/checklist-car-rear.png', w:492, h:234 },
  { id:'lateral-esquerda', label:'Lateral esquerda', img:'assets/checklist-car-side-left.png', w:492, h:230 },
  { id:'lateral-direita', label:'Lateral direita', img:'assets/checklist-car-side-right.png', w:492, h:230 }
];

// A ordem da lista é a numeração mostrada em cada ponto e na legenda (ver
// renderChecklistDiagram/renderChecklistDiagramLegend) - mantida igual à
// versão anterior (vista única) para não mudar a numeração que já apareceu
// em relatórios/observações registrados. Coordenadas casadas com as fotos
// em assets/checklist-car-*.png (ver CHECKLIST_DIAGRAM_VIEWS acima).
const CHECKLIST_DIAGRAM_POINTS = [
  { id:'paraChoqueDianteiro', label:'Para-choque dianteiro', view:'frontal', x:240, y:195 },
  { id:'faroEsquerdo', label:'Farol esquerdo', view:'frontal', x:155, y:113 },
  { id:'faroDireito', label:'Farol direito', view:'frontal', x:328, y:113 },
  { id:'capo', label:'Capô', view:'frontal', x:240, y:80 },
  { id:'paraBrisa', label:'Para-brisa', view:'frontal', x:240, y:25 },
  // Retrovisor é um alvo pequeno demais para tocar direto - a bolinha fica
  // fora do carro (no fundo) e uma linha aponta para o retrovisor de
  // verdade (tx/ty), igual ao checklist de papel.
  { id:'retrovisorEsquerdo', label:'Retrovisor esquerdo', view:'lateral-esquerda', x:430, y:14, tx:305, ty:70 },
  { id:'retrovisorDireito', label:'Retrovisor direito', view:'lateral-direita', x:62, y:14, tx:181, ty:68 },
  { id:'rodaDianteiraEsquerda', label:'Roda dianteira esquerda', view:'lateral-esquerda', x:400, y:148 },
  { id:'rodaDianteiraDireita', label:'Roda dianteira direita', view:'lateral-direita', x:92, y:148 },
  { id:'portaDianteiraEsquerda', label:'Porta dianteira esquerda', view:'lateral-esquerda', x:330, y:105 },
  { id:'portaDianteiraDireita', label:'Porta dianteira direita', view:'lateral-direita', x:162, y:105 },
  { id:'teto', label:'Teto', view:'lateral-esquerda', x:230, y:18 },
  { id:'portaTraseiraEsquerda', label:'Porta traseira esquerda', view:'lateral-esquerda', x:150, y:105 },
  { id:'portaTraseiraDireita', label:'Porta traseira direita', view:'lateral-direita', x:342, y:105 },
  { id:'rodaTraseiraEsquerda', label:'Roda traseira esquerda', view:'lateral-esquerda', x:105, y:148 },
  { id:'rodaTraseiraDireita', label:'Roda traseira direita', view:'lateral-direita', x:398, y:148 },
  { id:'vidroTraseiro', label:'Vidro traseiro', view:'traseira', x:240, y:25 },
  { id:'portaMalas', label:'Porta-malas', view:'traseira', x:240, y:115 },
  { id:'lanternaEsquerda', label:'Lanterna esquerda', view:'traseira', x:155, y:83 },
  { id:'lanternaDireita', label:'Lanterna direita', view:'traseira', x:325, y:83 },
  { id:'paraChoqueTraseiro', label:'Para-choque traseiro', view:'traseira', x:240, y:195 }
];

const CHECKLIST_COMPONENTS = [
  { key:'farois_lanternas_setas', label:'Faróis, lanternas e setas' },
  { key:'cinto_seguranca', label:'Cinto de segurança' },
  { key:'estepe_chave_roda', label:'Estepe / chave de roda' },
  { key:'indicadores_painel', label:'Indicadores de painel' },
  { key:'macaco_triangulo', label:'Macaco / triângulo' },
  { key:'pintura_sem_avarias', label:'Pintura sem avarias' },
  { key:'limpador_lavador_parabrisa', label:'Limpador e lavador de para-brisa' },
  { key:'vidros_retrovisores', label:'Vidros e retrovisores' },
  { key:'extintor', label:'Extintor' },
  { key:'documento_crlv', label:'Documento CRLV' },
  { key:'buzina', label:'Buzina' },
  { key:'quebra_sol', label:'Quebra-sol' },
  { key:'pneus_dianteiros', label:'Pneus dianteiros' },
  { key:'porta_malas', label:'Porta-malas' },
  { key:'pneus_traseiros', label:'Pneus traseiros' },
  { key:'limpeza_interior', label:'Limpeza interior' },
  { key:'calotas_rodas', label:'Calotas / rodas' },
  { key:'tapetes', label:'Tapetes' },
  { key:'freios', label:'Freios (pé e mão)' }
];

const CHECKLIST_STATUS_LABELS = {
  C:'conforme',
  A:'avaria - uso possível',
  X:'avaria - impossibilita o uso'
};

// Estado do checklist aberto no momento (reconstruído do zero cada vez que o
// modal de retirada/devolução abre - ver resetChecklistState abaixo).
let checklistState = { areas:[], componentes:{} };

function resetChecklistState() {
  checklistState = { areas:[], componentes:{} };
  CHECKLIST_COMPONENTS.forEach(item => { checklistState.componentes[item.key] = 'C'; });
}

// Índice global (1-based) de cada ponto, igual à ordem/numeração de
// CHECKLIST_DIAGRAM_POINTS - usado tanto dentro de cada vista quanto na
// legenda, para o número bater nas duas listas.
function checklistPointIndex(pointId) {
  return CHECKLIST_DIAGRAM_POINTS.findIndex(p => p.id === pointId);
}

// Em vez de mostrar as 4 vistas juntas (ficavam pequenas e apertadas), o
// usuário escolhe uma aba (Frente / Traseira / Lateral esquerda / Lateral
// direita) e vê só aquela vista, bem maior. O estado é reiniciado em
// "frontal" toda vez que o checklist abre (ver resetChecklistUI).
let checklistActiveView = 'frontal';

function checklistViewMarkedCount(viewId) {
  return CHECKLIST_DIAGRAM_POINTS.filter(p => p.view === viewId && checklistState.areas.includes(p.id)).length;
}

function renderChecklistDiagram() {
  const wrap = document.getElementById('operationChecklistDiagram');
  if (!wrap) return;
  // 4 vistas separadas (frente, traseira, lateral esquerda, lateral
  // direita), igual ao checklist de papel - cada uma com sua própria
  // imagem e pontos posicionados via left/top em porcentagem, calculados
  // a partir das coordenadas x,y de CHECKLIST_DIAGRAM_POINTS no plano
  // próprio de cada vista (view.w x view.h). Cada ponto mostra o próprio
  // número (não só ao passar o mouse) - a identificação completa acontece
  // pelo número + a legenda logo abaixo (ver renderChecklistDiagramLegend).
  const tabsHTML = CHECKLIST_DIAGRAM_VIEWS.map(view => {
    const count = checklistViewMarkedCount(view.id);
    const badge = count ? ' <span class="checklist-diagram-tab-count">' + count + '</span>' : '';
    return '<button type="button" class="checklist-diagram-tab' +
      (view.id === checklistActiveView ? ' is-active' : '') + '" data-view="' + view.id + '" ' +
      'role="tab" aria-selected="' + (view.id === checklistActiveView ? 'true' : 'false') + '">' +
      escapeHTML(view.label) + badge + '</button>';
  }).join('');

  const panelsHTML = CHECKLIST_DIAGRAM_VIEWS.map(view => {
    const points = CHECKLIST_DIAGRAM_POINTS
      .map((point, index) => ({ point, index }))
      .filter(item => item.point.view === view.id);
    const pointsHTML = points.map(({ point, index }) => {
      const left = (point.x / view.w * 100).toFixed(2);
      const top = (point.y / view.h * 100).toFixed(2);
      const marked = checklistState.areas.includes(point.id);
      return '<button type="button" class="checklist-point' + (marked ? ' is-marked' : '') + '" data-point="' + point.id + '" ' +
        'style="left:' + left + '%;top:' + top + '%" aria-pressed="' + (marked ? 'true' : 'false') + '" ' +
        'aria-label="' + (index + 1) + '. ' + escapeHTML(point.label) + '" ' +
        'title="' + (index + 1) + '. ' + escapeHTML(point.label) + '">' + (index + 1) + '</button>';
    }).join('');
    // Pontos com tx/ty (ex: retrovisor) ficam com a bolinha fora do carro e
    // uma linha/seta apontando para o local exato, porque o alvo real é
    // pequeno demais para tocar direto - igual ao checklist de papel.
    const leaderPoints = points.filter(item => item.point.tx != null && item.point.ty != null);
    const leadersSVG = leaderPoints.length ? (
      '<svg class="checklist-leader-lines" viewBox="0 0 ' + view.w + ' ' + view.h + '" preserveAspectRatio="none">' +
      '<defs><marker id="checklistArrow-' + view.id + '" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L8,4 L0,8 Z" fill="var(--danger)"></path></marker></defs>' +
      leaderPoints.map(({ point }) =>
        '<line x1="' + point.x + '" y1="' + point.y + '" x2="' + point.tx + '" y2="' + point.ty + '" ' +
        'marker-end="url(#checklistArrow-' + view.id + ')"></line>'
      ).join('') + '</svg>'
    ) : '';
    return '<div class="checklist-diagram-view' + (view.id === checklistActiveView ? ' is-active' : '') + '" data-view="' + view.id + '">' +
      '<div class="checklist-diagram" style="aspect-ratio:' + view.w + '/' + view.h + '">' +
      '<img class="checklist-diagram-img" src="' + view.img + '" alt="Diagrama do veículo - ' + escapeHTML(view.label) + '">' +
      leadersSVG +
      '<div class="checklist-points">' + pointsHTML + '</div>' +
      '</div>' +
      '</div>';
  }).join('');

  wrap.innerHTML = '<div class="checklist-diagram-tabs" role="tablist">' + tabsHTML + '</div>' +
    '<div class="checklist-diagram-views">' + panelsHTML + '</div>';
}

function switchChecklistView(viewId) {
  if (!CHECKLIST_DIAGRAM_VIEWS.some(v => v.id === viewId) || viewId === checklistActiveView) return;
  checklistActiveView = viewId;
  const wrap = document.getElementById('operationChecklistDiagram');
  if (!wrap) return;
  wrap.querySelectorAll('.checklist-diagram-tab').forEach(tab => {
    const active = tab.dataset.view === viewId;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  wrap.querySelectorAll('.checklist-diagram-view').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.view === viewId);
  });
  // A legenda numerada também só mostra os itens da vista aberta no momento
  // - antes listava os 21 pontos juntos, o que não fazia sentido com só uma
  // vista visível por vez.
  renderChecklistDiagramLegend();
}

function renderChecklistDiagramLegend() {
  const el = document.getElementById('operationChecklistDiagramLegend');
  if (!el) return;
  // Só os pontos da vista aberta no momento (Frente/Traseira/Lateral...) -
  // a numeração mostrada é a global (a mesma do botão no diagrama).
  el.innerHTML = CHECKLIST_DIAGRAM_POINTS.map((point, index) => ({ point, index }))
    .filter(item => item.point.view === checklistActiveView)
    .map(({ point, index }) =>
      '<span class="checklist-diagram-legend-item"><b>' + (index + 1) + '</b> ' + escapeHTML(point.label) + '</span>'
    ).join('');
}

function renderChecklistDiagramSelected() {
  const el = document.getElementById('operationChecklistDiagramSelected');
  if (!el) return;
  if (!checklistState.areas.length) {
    el.textContent = 'Nenhum ponto marcado.';
    return;
  }
  const labels = checklistState.areas.map(id => {
    const index = CHECKLIST_DIAGRAM_POINTS.findIndex(p => p.id === id);
    const point = CHECKLIST_DIAGRAM_POINTS[index];
    return point ? (index + 1) + '. ' + point.label : id;
  });
  el.textContent = 'Pontos marcados: ' + labels.join(', ') + '.';
}

function toggleChecklistPoint(pointId) {
  const idx = checklistState.areas.indexOf(pointId);
  if (idx === -1) checklistState.areas.push(pointId);
  else checklistState.areas.splice(idx, 1);
  const g = document.querySelector('#operationChecklistDiagram [data-point="' + pointId + '"]');
  if (g) {
    const marked = idx === -1;
    g.classList.toggle('is-marked', marked);
    g.setAttribute('aria-pressed', marked ? 'true' : 'false');
  }
  // Atualiza o contador na aba da vista desse ponto, já que a vista pode
  // não estar visível no momento (usuário pode marcar em uma aba e querer
  // ver de relance quantas avarias tem em cada uma sem trocar de aba).
  const point = CHECKLIST_DIAGRAM_POINTS.find(p => p.id === pointId);
  if (point) {
    const tab = document.querySelector('#operationChecklistDiagram .checklist-diagram-tab[data-view="' + point.view + '"]');
    if (tab) {
      const count = checklistViewMarkedCount(point.view);
      let badge = tab.querySelector('.checklist-diagram-tab-count');
      if (count) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'checklist-diagram-tab-count';
          tab.appendChild(badge);
        }
        badge.textContent = String(count);
      } else if (badge) {
        badge.remove();
      }
    }
  }
  renderChecklistDiagramSelected();
}

// Delegação no container único (abas + 4 vistas) - o conteúdo é
// reconstruído a cada renderChecklistDiagram, então um listener por
// elemento individual se perderia. <button> já ativa no Enter/Espaço
// nativamente, então um único listener de click cobre clique e teclado.
document.getElementById('operationChecklistDiagram').addEventListener('click', function (e) {
  const tab = e.target.closest('.checklist-diagram-tab');
  if (tab) {
    switchChecklistView(tab.dataset.view);
    return;
  }
  const point = e.target.closest('.checklist-point');
  if (point) toggleChecklistPoint(point.dataset.point);
});

function renderChecklistComponents() {
  const wrap = document.getElementById('operationChecklistComponents');
  if (!wrap) return;
  wrap.innerHTML = CHECKLIST_COMPONENTS.map(item => {
    const current = checklistState.componentes[item.key] || 'C';
    const buttons = ['C', 'A', 'X'].map(status =>
      '<button type="button" class="checklist-component-btn' +
      (status === current ? ' is-active' : '') + '" data-key="' + item.key +
      '" data-status="' + status + '">' + status + '</button>'
    ).join('');
    return '<div class="checklist-component-row">' +
      '<span class="checklist-component-label">' + escapeHTML(item.label) + '</span>' +
      '<span class="checklist-component-options">' + buttons + '</span>' +
      '</div>';
  }).join('');
}

document.getElementById('operationChecklistComponents').addEventListener('click', function (e) {
  const btn = e.target.closest('.checklist-component-btn');
  if (!btn) return;
  checklistState.componentes[btn.dataset.key] = btn.dataset.status;
  updateComponentRowUI(btn.dataset.key);
});

function updateComponentRowUI(key) {
  const status = checklistState.componentes[key];
  document.querySelectorAll('.checklist-component-btn[data-key="' + key + '"]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.status === status);
  });
}

document.getElementById('operationHasAvaria').addEventListener('change', function () {
  const section = document.getElementById('operationChecklistSection');
  if (this.checked) {
    section.classList.remove('hidden');
  } else {
    section.classList.add('hidden');
  }
});

// Reconstrói o diagrama e a lista de componentes do zero cada vez que o
// modal de retirada/devolução abre, com tudo desmarcado (componentes = "C").
function resetChecklistUI() {
  resetChecklistState();
  checklistActiveView = 'frontal';
  document.getElementById('operationHasAvaria').checked = false;
  document.getElementById('operationChecklistSection').classList.add('hidden');
  document.getElementById('operationChecklistObs').value = '';
  renderChecklistDiagram();
  renderChecklistDiagramLegend();
  renderChecklistDiagramSelected();
  renderChecklistComponents();
}

// Resumo em texto pra anexar ao campo "Avarias e observações" - é isso que
// alimenta relatórios, notificação ao responsável e recomendação de veículo,
// que já reagem a esse campo hoje (ver comentário no topo do arquivo).
function buildChecklistSummaryText() {
  const parts = [];
  if (checklistState.areas.length) {
    const labels = checklistState.areas.map(id => {
      const point = CHECKLIST_DIAGRAM_POINTS.find(p => p.id === id);
      return point ? point.label : id;
    });
    parts.push('Pontos marcados no diagrama: ' + labels.join(', ') + '.');
  }
  const problemas = CHECKLIST_COMPONENTS
    .filter(item => checklistState.componentes[item.key] && checklistState.componentes[item.key] !== 'C')
    .map(item => item.label + ' (' + CHECKLIST_STATUS_LABELS[checklistState.componentes[item.key]] + ')');
  if (problemas.length) {
    parts.push('Itens do checklist com avaria: ' + problemas.join('; ') + '.');
  }
  const obs = document.getElementById('operationChecklistObs').value.trim();
  if (obs) parts.push(obs);
  return parts.join(' ');
}

function operationPhotoFilename(photo, index, phaseLabel) {
  const original = String(photo && photo.nome || '').trim();
  const fallbackExtension = String(photo && photo.tipo || '').includes('png') ? '.png' : '.jpg';
  const fallback = 'foto-' + String(phaseLabel || 'veiculo').toLowerCase() + '-' +
    (index + 1) + fallbackExtension;
  return (original || fallback)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function renderOperationPhoto(photo, index, phaseLabel) {
  const dataUrl = String(photo && photo.dados || '');
  const protectedUrl = String(photo && photo.url || '');
  const source = dataUrl.startsWith('data:image/')
    ? dataUrl
    : (protectedUrl.startsWith('/api/reservations/') ? protectedUrl : '');
  if (!source) return '';
  const filename = operationPhotoFilename(photo, index, phaseLabel);
  const safeSource = escapeHTML(source);
  const downloadSource = escapeHTML(protectedUrl
    ? protectedUrl + (protectedUrl.includes('?') ? '&' : '?') + 'download=1'
    : source);
  const safeFilename = escapeHTML(filename);
  return '<div class="operation-photo-card">' +
    '<a class="operation-photo-preview" href="' + safeSource + '" target="_blank" rel="noopener" ' +
    'aria-label="Abrir ' + safeFilename + '">' +
    '<img src="' + safeSource + '" alt="' + safeFilename + '">' +
    '</a>' +
    '<a class="operation-photo-download" href="' + downloadSource + '" download="' + safeFilename + '">' +
    '&#8595; Baixar imagem' +
    '</a>' +
    '</div>';
}

function operationPhotoBlob(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;

  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  } catch (error) {
    console.error('Nao foi possivel processar a foto.', error);
    return null;
  }
}

function downloadOperationPhoto(link) {
  const blob = operationPhotoBlob(String(link.getAttribute('href') || ''));
  if (!blob) return false;

  try {
    const objectUrl = URL.createObjectURL(blob);
    const temporaryLink = document.createElement('a');
    temporaryLink.href = objectUrl;
    temporaryLink.download = link.getAttribute('download') || 'foto-veiculo.jpg';
    temporaryLink.hidden = true;
    document.body.appendChild(temporaryLink);
    temporaryLink.click();
    temporaryLink.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch (error) {
    console.error('Nao foi possivel baixar a foto.', error);
    return false;
  }
}

function openOperationPhoto(link) {
  const blob = operationPhotoBlob(String(link.getAttribute('href') || ''));
  if (!blob) return false;
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  return true;
}

document.addEventListener('click', function (event) {
  const downloadLink = event.target.closest('.operation-photo-download');
  if (downloadLink) {
    if (!String(downloadLink.getAttribute('href') || '').startsWith('data:image/')) return;
    event.preventDefault();
    downloadOperationPhoto(downloadLink);
    return;
  }

  const previewLink = event.target.closest('.operation-photo-preview');
  if (previewLink) {
    if (!String(previewLink.getAttribute('href') || '').startsWith('data:image/')) return;
    event.preventDefault();
    openOperationPhoto(previewLink);
  }
});

const OPERATION_CLEANLINESS_LABELS = {
  limpo: 'Agradável (limpo)',
  sujeira_interna: 'Excesso de sujeira interna',
  sujeira_externa: 'Excesso de sujeira externa'
};

function renderOperationDetails(reserva) {
  const operacao = reserva.operacao || {};
  const encerramento = reserva.encerramentoAdministrativo;
  if (!operacao.retirada && !operacao.devolucao && !encerramento) return '';
  const renderPhase = (label, data) => {
    if (!data) return '';
    const photos = Array.isArray(data.fotos) ? data.fotos : [];
    const cleanlinessLabel = OPERATION_CLEANLINESS_LABELS[data.condicaoLimpeza];
    return '<div class="operation-record">' +
      '<strong>' + label + '</strong>' +
      '<span>Km ' + Number(data.quilometragem || 0).toLocaleString('pt-BR') + ' · Combustível: ' + escapeHTML(data.combustivel || '—') + '</span>' +
      (data.quilometragemDivergente ? '<span>⚠️ Quilometragem informada abaixo do esperado - verificar odômetro in loco</span>' : '') +
      (cleanlinessLabel ? '<span>Condição de limpeza: ' + escapeHTML(cleanlinessLabel) + '</span>' : '') +
      (data.avarias ? '<span>Avarias/observações: ' + escapeHTML(data.avarias) + '</span>' : '') +
      '<span>Registrado por ' + escapeHTML(data.registradoPor || '—') + ' em ' + escapeHTML(formatDateTime(data.registradoEm)) + '</span>' +
      (photos.length ? '<div class="operation-photos">' +
        photos.map((photo, index) => renderOperationPhoto(photo, index, label)).join('') +
        '</div>' : '') +
      '</div>';
  };
  const summaryText = reservationHasOperationReport(reserva)
    ? '⚠️ Ver avarias, fotos ou limpeza registradas'
    : 'Ver retirada e devolução';
  return '<details class="operation-details"><summary>' + summaryText + '</summary>' +
    renderPhase('Retirada', operacao.retirada) +
    renderPhase('Devolução', operacao.devolucao) +
    (encerramento ? '<div class="operation-record operation-record-administrative">' +
      '<strong>Encerramento administrativo</strong>' +
      '<span>Justificativa: ' + escapeHTML(encerramento.justificativa || '—') + '</span>' +
      '<span>Registrado por ' + escapeHTML(encerramento.registradoPor || '—') + ' em ' +
      escapeHTML(formatDateTime(encerramento.registradoEm)) + '</span>' +
      '</div>' : '') +
    '</details>';
}

function bindReservationFeatureButtons(container) {
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      openSelfEditReservation(this.getAttribute('data-id'));
    });
  });
  container.querySelectorAll('.operation-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      // Só o botão "Checklist" da aba de gestão (checklistPendingOperationCardHTML)
      // tem esse atributo - o de "Minhas Reservas" (js/reservations.js), não. É o
      // que diferencia "a própria pessoa registrando" de "a gestão registrando em
      // nome de outra pessoa" pra mostrar o campo "Vistoriador" (ver openOperationModal),
      // já que quem tem a permissão "Checklist" pode inclusive estar registrando a
      // própria reserva por ali (isOwner sozinho não bastava pra distinguir isso).
      const fromManagement = this.getAttribute('data-management') === 'true';
      if (this.getAttribute('data-pickup-info') === 'true') {
        const reservationId = this.getAttribute('data-id');
        const reservation = getReservations().find(item => String(item.id) === String(reservationId));
        if (reservation && canRegisterPickupNow(reservation)) {
          openOperationModal(reservationId, 'retirada', fromManagement);
        } else {
          openPickupAvailabilityModal(reservationId);
        }
        return;
      }
      openOperationModal(this.getAttribute('data-id'), this.getAttribute('data-phase'), fromManagement);
    });
  });
}

const pickupAvailabilityModal = document.getElementById('pickupAvailabilityModal');
const pickupAvailabilityDate = document.getElementById('pickupAvailabilityDate');
const pickupAvailabilitySummary = document.getElementById('pickupAvailabilitySummary');

function openPickupAvailabilityModal(reservationId) {
  const reservation = getReservations().find(item => String(item.id) === String(reservationId));
  if (!reservation) return;
  pickupAvailabilityDate.textContent = formatPickupAvailableFrom(reservation);
  pickupAvailabilitySummary.innerHTML = escapeHTML(reservation.partida + ' → ' + reservation.destino) +
    '<br>' + getVehicleDisplayHTML(reservation);
  pickupAvailabilityModal.classList.remove('hidden');
}

function closePickupAvailabilityModal() {
  pickupAvailabilityModal.classList.add('hidden');
}

document.getElementById('pickupAvailabilityCloseBtn').addEventListener('click', closePickupAvailabilityModal);
document.getElementById('pickupAvailabilityOkBtn').addEventListener('click', closePickupAvailabilityModal);
pickupAvailabilityModal.addEventListener('click', event => {
  if (event.target === pickupAvailabilityModal) closePickupAvailabilityModal();
});


// Quilometragem da devolução mais recente já registrada para um veículo
// (mesmo local + código), em qualquer reserva - não só a reserva atual.
// Usado para pré-preencher a retirada com o odômetro real deixado pela
// última pessoa que devolveu o carro. Ordena por "registradoEm" (o
// timestamp do próprio registro) em vez de data/horário da reserva, porque
// é o que reflete quando a devolução de fato aconteceu.
function lastVehicleDevolucaoKm(partida, carro, excludeReservationId){
  const candidatos = getReservations().filter(r =>
    String(r.id) !== String(excludeReservationId) &&
    r.partida === partida && String(r.carro) === String(carro) &&
    r.operacao && r.operacao.devolucao && r.operacao.devolucao.registradoEm
  );
  if (!candidatos.length) return null;
  candidatos.sort((a, b) =>
    new Date(b.operacao.devolucao.registradoEm) - new Date(a.operacao.devolucao.registradoEm));
  const km = Number(candidatos[0].operacao.devolucao.quilometragem);
  return Number.isFinite(km) ? km : null;
}

/* =========================================================
   Retirada e devolução
   ========================================================= */
const operationModal = document.getElementById('operationModal');
const operationForm = document.getElementById('operationForm');
const operationTitle = document.getElementById('operationTitle');
const operationSummary = document.getElementById('operationSummary');
const operationError = document.getElementById('operationError');
let operationReservationId = null;
let operationPhase = null;
bindKmInputMask(document.getElementById('operationKm'));

async function openOperationModal(reservationId, phase, fromManagement) {
  const reserva = getReservations().find(r => String(r.id) === String(reservationId));
  const currentUser = getCurrentUser();
  const isOwner = reserva && currentUser && reserva.nome === currentUser.nome;
  if (!reserva || !currentUser || (!isOwner && !isAdmin() && !canRegisterOperations())) return;
  const operacao = reserva.operacao || {};
  if ((phase === 'retirada' && operacao.retirada) || (phase === 'devolucao' && (!operacao.retirada || operacao.devolucao))) return;
  if (phase === 'retirada' && !canRegisterPickupNow(reserva)) {
    await showSiteAlert(
      'A retirada só pode ser registrada a partir de ' +
      formatPickupAvailableFrom(reserva) + '.',
      {
        title: 'Retirada ainda indisponível',
        type: 'info'
      }
    );
    return;
  }
  operationReservationId = reservationId;
  operationPhase = phase;
  operationForm.reset();
  resetChecklistUI();
  operationError.textContent = '';
  document.getElementById('operationPhotoHint').textContent = '';
  operationTitle.textContent = phase === 'retirada' ? 'Registrar retirada' : 'Registrar devolução';
  operationSummary.innerHTML = escapeHTML(reserva.partida + ' → ' + reserva.destino) +
    '<br>' + getVehicleDisplayHTML(reserva);
  // Condição de limpeza é perguntada nas duas fases (retirada e devolução) -
  // o campo em si é sempre o mesmo select, então só falta garantir que ele
  // esteja visível e obrigatório de novo (reset() já limpa a seleção
  // anterior). O form usa "novalidate" porque a validação de verdade já é
  // feita manualmente no submit abaixo.
  document.getElementById('operationCleanlinessField').classList.remove('hidden');
  document.getElementById('operationCleanliness').required = true;
  document.getElementById('error-operationCleanliness').textContent = '';
  // "Vistoriador": só aparece quando o modal foi aberto a partir da aba
  // Checklist do painel de gestão (fromManagement) - não em "Minhas
  // Reservas". isOwner sozinho não bastava, porque quem tem a permissão
  // "Checklist" pode registrar a própria reserva por ali também.
  document.getElementById('operationInspectorField').classList.toggle('hidden', !fromManagement);
  document.getElementById('operationInspector').value = '';
  // Só um lembrete visual do valor esperado agora - não trava mais o campo
  // (min dinâmico), porque um dígito a mais digitado por engano deixava a
  // pessoa impedida de registrar a operação. Ver a confirmação de divergência
  // no submit, abaixo.
  const kmInput = document.getElementById('operationKm');
  const kmHint = document.getElementById('operationKmHint');
  if (phase === 'devolucao' && operacao.retirada) {
    kmHint.textContent = 'Quilometragem na retirada: ' + Number(operacao.retirada.quilometragem || 0).toLocaleString('pt-BR') + ' km.';
  } else {
    // Retirada: pré-preenche com a quilometragem da última devolução
    // registrada para este mesmo veículo (de qualquer reserva anterior) -
    // é o valor mais confiável disponível, porque reflete o odômetro real na
    // última vez que alguém devolveu o carro. "operationKm.value" continua
    // editável normalmente; isto é só um ponto de partida, não uma trava.
    const ultimaDevolucaoKm = lastVehicleDevolucaoKm(reserva.partida, reserva.carro, reservationId);
    if (ultimaDevolucaoKm != null) {
      kmInput.value = formatKmDigits(ultimaDevolucaoKm);
      kmHint.textContent = 'Preenchido com a quilometragem da última devolução deste veículo (' +
        ultimaDevolucaoKm.toLocaleString('pt-BR') + ' km) - confira antes de confirmar.';
    } else {
      const vehicle = getVehicle(reserva.partida, reserva.carro);
      kmHint.textContent = vehicle && vehicle.odometroAtual != null && vehicle.odometroAtual !== ''
        ? 'Odômetro atual do veículo: ' + Number(vehicle.odometroAtual).toLocaleString('pt-BR') + ' km.'
        : '';
    }
  }
  operationModal.classList.remove('hidden');
}

function closeOperationModal() {
  operationModal.classList.add('hidden');
  operationReservationId = null;
  operationPhase = null;
}

document.getElementById('operationCloseBtn').addEventListener('click', closeOperationModal);
operationModal.addEventListener('click', e => {
  if (e.target === operationModal) closeOperationModal();
});

document.getElementById('operationPhotos').addEventListener('change', function () {
  const count = Math.min(this.files.length, 3);
  document.getElementById('operationPhotoHint').textContent = count
    ? count + (count === 1 ? ' foto selecionada.' : ' fotos selecionadas.')
    : '';
});

function filesToDataUrls(files) {
  const selected = Array.from(files || []).slice(0, 3);
  return Promise.all(selected.map(file => new Promise((resolve, reject) => {
    if (file.size > 1024 * 1024) {
      reject(new Error('Cada foto deve ter no máximo 1 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ nome: file.name, tipo: file.type, dados: reader.result });
    reader.onerror = () => reject(new Error('Não foi possível ler uma das fotos.'));
    reader.readAsDataURL(file);
  })));
}

operationForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  // Busca bloqueios/reservas frescos antes de validar - mesmo raciocínio do
  // envio da reserva (ver js/reservations.js): sem isso, o odômetro atual do
  // veículo usado na comparação abaixo poderia estar desatualizado. Se a
  // atualização falhar, segue com os dados que já tinha - o servidor ainda é
  // quem valida de verdade no envio.
  try {
    await hydrateDatabaseState();
  } catch (error) {
    console.error('Falha ao atualizar dados antes de validar a operação:', error);
  }
  const list = getReservations();
  const idx = list.findIndex(r => String(r.id) === String(operationReservationId));
  if (idx === -1) return;
  const reserva = list[idx];
  if (operationPhase === 'retirada' && !canRegisterPickupNow(reserva)) {
    operationError.textContent =
      'A retirada só pode ser registrada a partir de ' +
      formatPickupAvailableFrom(reserva) + '.';
    return;
  }
  const km = kmInputValue(document.getElementById('operationKm'));
  const fuel = document.getElementById('operationFuel').value;
  if (!Number.isFinite(km) || km < 0 || !fuel) {
    operationError.textContent = 'Informe quilometragem e combustível.';
    return;
  }
  const cleanlinessValue = document.getElementById('operationCleanliness').value;
  if (!cleanlinessValue) {
    document.getElementById('error-operationCleanliness').textContent = 'Selecione a condição de limpeza do veículo.';
    return;
  }
  document.getElementById('error-operationCleanliness').textContent = '';

  // Marcar "Avaria no veículo" sem preencher nada do checklist deixava a
  // avaria registrada sem nenhum detalhe - agora, se o checkbox está
  // marcado, precisa ter pelo menos um ponto marcado no diagrama ou um
  // componente com status diferente de "Conforme".
  if (document.getElementById('operationHasAvaria').checked) {
    const hasMarkedArea = checklistState.areas.length > 0;
    const hasMarkedComponent = CHECKLIST_COMPONENTS.some(item =>
      checklistState.componentes[item.key] && checklistState.componentes[item.key] !== 'C');
    if (!hasMarkedArea && !hasMarkedComponent) {
      operationError.textContent = 'Marque pelo menos um ponto no diagrama ou um componente com avaria.';
      return;
    }
  }

  // Quilometragem menor que o esperado não bloqueia mais o registro (um
  // dígito a mais digitado por engano deixava a pessoa impedida de concluir a
  // retirada/devolução) - em vez disso, confirma com quem está preenchendo e,
  // se confirmado, avisa quem cuida da frota pra verificar o odômetro in loco
  // (ver server/notifications.js e server/validation.js).
  let quilometragemDivergente = false;
  if (operationPhase === 'devolucao' && reserva.operacao && reserva.operacao.retirada &&
    km < Number(reserva.operacao.retirada.quilometragem || 0)) {
    const confirmado = await showSiteConfirm(
      'A quilometragem informada · ' + km.toLocaleString('pt-BR') + ' km · é menor que a registrada na retirada: ' +
      Number(reserva.operacao.retirada.quilometragem).toLocaleString('pt-BR') + ' km. Confirma mesmo assim?',
      { title: 'Quilometragem menor que a retirada', confirmText: 'Confirmar' }
    );
    if (!confirmado) return;
    quilometragemDivergente = true;
  }
  if (operationPhase === 'retirada') {
    const vehicle = getVehicle(reserva.partida, reserva.carro);
    const odometroAtual = vehicle && vehicle.odometroAtual != null && vehicle.odometroAtual !== ''
      ? Number(vehicle.odometroAtual)
      : null;
    if (odometroAtual != null && km < odometroAtual) {
      const confirmado = await showSiteConfirm(
        'A quilometragem informada · ' + km.toLocaleString('pt-BR') + ' km · é menor que o odômetro atual do veículo: ' +
        odometroAtual.toLocaleString('pt-BR') + ' km. Confirma mesmo assim?',
        { title: 'Quilometragem menor que o odômetro do veículo', confirmText: 'Confirmar' }
      );
      if (!confirmado) return;
      quilometragemDivergente = true;
    }
  }

  try {
    const photos = await filesToDataUrls(document.getElementById('operationPhotos').files);
    // O campo livre de "avarias e observações" foi substituído pelo checklist
    // (diagrama + componentes + observações do checklist) - o resumo dele
    // continua alimentando o campo "avarias" internamente, porque é isso que
    // já move relatórios, notificação ao responsável e recomendação de
    // veículo (ver comentário no topo do arquivo, junto da definição de
    // CHECKLIST_DIAGRAM_POINTS).
    const hasAvaria = document.getElementById('operationHasAvaria').checked;
    const avariasText = hasAvaria ? buildChecklistSummaryText() : '';
    reserva.operacao = reserva.operacao || {};
    reserva.operacao[operationPhase] = {
      quilometragem: km,
      combustivel: fuel,
      avarias: avariasText,
      checklist: hasAvaria ? {
        areas: checklistState.areas.slice(),
        componentes: { ...checklistState.componentes },
        observacoes: document.getElementById('operationChecklistObs').value.trim()
      } : undefined,
      // Perguntado nas duas fases (ver openOperationModal). "Excesso de
      // sujeira" conta como avaria/observação pra tudo que já reage a
      // avarias/fotos (filtro "Somente com registro", notificação ao
      // responsável) - ver reservationHasOperationReport em js/utils.js e
      // notifyOperationReport em server/notifications.js.
      condicaoLimpeza: cleanlinessValue || undefined,
      quilometragemDivergente: quilometragemDivergente || undefined,
      vistoriador: document.getElementById('operationInspector').value.trim() || undefined,
      fotos: photos,
      registradoPor: getCurrentUser().nome,
      registradoEm: new Date().toISOString()
    };
    reserva.status = operationPhase === 'retirada' ? 'em uso' : 'concluída';
    list[idx] = reserva;
    await saveReservations(list);
    closeOperationModal();
    renderMyReservations();
    if (canManageReservations()) renderAdminTab();
    // Os indicadores da frota aparecem na mesma aba "Reservas" - sem isto,
    // km/concluídas ficavam desatualizados na tela até trocar de aba e voltar.
    if (typeof canViewReports === 'function' && canViewReports() && typeof renderIndicators === 'function') renderIndicators();
    // Idem para a aba "Checklist" - sem isto, quem acabou de registrar a
    // retirada/devolução (a própria pessoa ou quem tem a permissão
    // "Checklist" registrando por outra) só via a reserva sair de
    // "Registrar retirada/devolução" e entrar em "Pendentes" depois de um F5.
    if (typeof canManageChecklist === 'function' && canManageChecklist() &&
      typeof renderChecklistManagement === 'function') renderChecklistManagement();
  } catch (error) {
    operationError.textContent = error.message;
  }
});

/* =========================================================
   Aba "Checklist" do painel de gestão

   Lista todo checklist preenchido numa retirada ou devolução (de qualquer
   reserva, não só as da própria pessoa) para quem tem a permissão
   "Checklist". Aprovar só marca o checklist como revisado (quem/quando, sem
   travar nada); editar sobrescreve os campos preenchidos pelo usuário e
   registra só quem editou por último (sem manter o valor original visível).
   Ver PATCH /api/reservations/:id/operacao/:fase/checklist no servidor -
   passa por fora do POST /sync normal, que trava qualquer alteração numa
   retirada/devolução já registrada mesmo para quem gerencia reservas.
   ========================================================= */
let checklistReviewState = { areas:[], componentes:{} };
let checklistReviewActiveView = 'frontal';
bindKmInputMask(document.getElementById('checklistReviewOdometer'));
// { legacyId, phase, reserva } da retirada/devolução aberta no momento no
// modal de revisão - null quando o modal está fechado.
let checklistReviewContext = null;

/* =========================================================
   Registrar retirada/devolução em nome de outra pessoa
   (mesma permissão "checklist" que revisa/aprova/edita)
   ========================================================= */

// Reservas ainda sem retirada, ou já retiradas mas sem devolução - mesma
// regra que decide o botão "Registrar retirada/devolução" em Minhas
// Reservas (ver renderReservationItem em js/reservations.js), só que aqui
// pra QUALQUER reserva, não só as do usuário logado.
// Um item arquivado (botão "Arquivar" na aba Checklist) some da lista
// normal de pendências, seja ela ainda sem registro ou já registrada
// aguardando revisão - só volta a aparecer na aba discreta de arquivados.
function isChecklistPhaseArchived(reserva, phase){
  return !!(reserva.checklistArquivado && reserva.checklistArquivado[phase]);
}

function checklistPendingOperationEntries(){
  return getReservations()
    .filter(reserva => !isReservationCompleted(reserva) &&
      normalizeReservationStatus(reserva.status) !== 'encerrada_administrativamente')
    .map(reserva => {
      const operacao = reserva.operacao || {};
      if(!operacao.retirada){
        return isChecklistPhaseArchived(reserva, 'retirada') ? null : { reserva, phase:'retirada' };
      }
      if(!operacao.devolucao){
        return isChecklistPhaseArchived(reserva, 'devolucao') ? null : { reserva, phase:'devolucao' };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aKey = String(a.reserva.dataIda || '') + 'T' + String(a.reserva.horarioRetirada || '');
      const bKey = String(b.reserva.dataIda || '') + 'T' + String(b.reserva.horarioRetirada || '');
      return aKey.localeCompare(bKey);
    });
}

function checklistPendingOperationMatchesSearch(entry, search){
  if(!search) return true;
  const haystack = [
    entry.reserva.numeroReserva, entry.reserva.nome, entry.reserva.carro, entry.reserva.partida, entry.reserva.destino
  ].map(value => String(value || '').toLocaleLowerCase('pt-BR')).join(' ');
  return haystack.includes(search);
}

function checklistPendingOperationCardHTML(entry){
  const phaseLabel = entry.phase === 'retirada' ? 'Retirada' : 'Devolução';
  const pickupAvailable = entry.phase !== 'retirada' || canRegisterPickupNow(entry.reserva);
  // A origem já aparece no título (#X · origem → destino) - aqui embaixo,
  // no lugar dela, mostra a placa completa do veículo em vez do código
  // curto (entry.reserva.carro, que é só o final da placa).
  const vehicleForPlate = getVehicle(entry.reserva.partida, entry.reserva.carro);
  const plate = vehicleForPlate && vehicleForPlate.placa ? String(vehicleForPlate.placa).toUpperCase() : '';
  const checklistBtnHTML = '<button type="button" class="operation-btn" data-phase="' + entry.phase + '" data-id="' +
    escapeHTML(entry.reserva.id) + '" data-management="true"' +
    (pickupAvailable ? '' : ' data-pickup-info="true" title="Consultar quando a retirada será liberada"') +
    '>Checklist</button>';
  const archiveBtnHTML = '<button type="button" class="delete-btn checklist-archive-btn" data-id="' +
    escapeHTML(entry.reserva.id) + '" data-phase="' + entry.phase + '">Arquivar</button>';
  const key = checklistEntryKey(entry);
  const checkboxHTML = '<label class="management-item-select">' +
    '<input type="checkbox" class="checklist-select-checkbox" data-key="' + escapeHTML(key) + '"' +
    (checklistSelectedKeys.has(key) ? ' checked' : '') + '></label>';
  return '<div class="management-item">' +
    checkboxHTML +
    '<div class="management-item-info">' +
      '<strong>#' + escapeHTML(entry.reserva.numeroReserva) + ' · ' + escapeHTML(entry.reserva.partida) +
        ' → ' + escapeHTML(entry.reserva.destino) + ' <span class="tag tag-info">' +
        escapeHTML(phaseLabel) + '</span></strong>' +
      '<small>' + escapeHTML(entry.reserva.nome) + ' · ' + escapeHTML(plate || entry.reserva.carro) + '</small>' +
      '<small>' + escapeHTML(entry.reserva.dataIda) + ' ' + escapeHTML(entry.reserva.horarioRetirada || '') + '</small>' +
    '</div>' +
    '<div class="management-actions">' + checklistBtnHTML + archiveBtnHTML + '</div>' +
  '</div>';
}

// Mesmo padrão visual do toggle "Ativas/Histórico" de Minhas Reservas e da
// aba Reservas da gestão (.reservation-view-tabs/.reservation-view-btn) -
// "Pendente" junta tanto reservas ainda sem retirada/devolução registrada
// quanto checklists já enviados aguardando revisão; "Arquivados" junta os já
// aprovados com os arquivados manualmente (botão "Arquivar"). Uma única
// lista/busca serve os dois.
let checklistReviewView = 'pendente';
const checklistReviewViewButtons = document.querySelectorAll('[data-checklist-review-view]');

// Seleção múltipla pra arquivar vários de uma vez (checkbox em cada card da
// aba Pendente + barra de ações em massa). A chave junta reserva+fase
// porque um mesmo card de revisão é sempre de uma fase só, mas a mesma
// reserva pode ter retirada E devolução pendentes ao mesmo tempo.
const checklistSelectedKeys = new Set();
let checklistCurrentSelectableKeys = [];

function checklistEntryKey(entry){
  return entry.reserva.id + '::' + entry.phase;
}

function parseChecklistEntryKey(key){
  const idx = key.lastIndexOf('::');
  return { id:key.slice(0, idx), phase:key.slice(idx + 2) };
}

function checklistReviewEntries(){
  const entries = [];
  getReservations().forEach(reserva => {
    ['retirada', 'devolucao'].forEach(phase => {
      const record = reserva.operacao && reserva.operacao[phase];
      if(record && !isChecklistPhaseArchived(reserva, phase)) entries.push({ reserva, phase, record });
    });
  });
  // Mais recente primeiro (registradoEm) - é o que interessa revisar antes.
  entries.sort((a, b) => new Date(b.record.registradoEm || 0) - new Date(a.record.registradoEm || 0));
  return entries;
}

// Tudo que foi arquivado (botão "Arquivar"), registrado ou não - some da
// lista normal de Pendente e passa a aparecer na aba "Arquivados".
function checklistArchivedEntries(){
  const entries = [];
  getReservations().forEach(reserva => {
    ['retirada', 'devolucao'].forEach(phase => {
      const arquivado = reserva.checklistArquivado && reserva.checklistArquivado[phase];
      if(!arquivado) return;
      entries.push({ reserva, phase, arquivado, record:(reserva.operacao && reserva.operacao[phase]) || null });
    });
  });
  entries.sort((a, b) => new Date(b.arquivado.registradoEm || 0) - new Date(a.arquivado.registradoEm || 0));
  return entries;
}

function checklistArchivedMatchesSearch(entry, search){
  if(!search) return true;
  const haystack = [
    entry.reserva.numeroReserva, entry.reserva.nome, entry.reserva.carro, entry.reserva.partida, entry.reserva.destino
  ].map(value => String(value || '').toLocaleLowerCase('pt-BR')).join(' ');
  return haystack.includes(search);
}

function checklistArchivedCardHTML(entry){
  const phaseLabel = entry.phase === 'retirada' ? 'Retirada' : 'Devolução';
  // Mesmo formato de título e mesma troca do código curto do veículo pela
  // placa completa usados no grupo "Checklist" - ver
  // checklistPendingOperationCardHTML.
  const vehicleForPlate = getVehicle(entry.reserva.partida, entry.reserva.carro);
  const plate = vehicleForPlate && vehicleForPlate.placa ? String(vehicleForPlate.placa).toUpperCase() : '';
  return '<div class="management-item">' +
    '<div>' +
      '<strong>#' + escapeHTML(entry.reserva.numeroReserva) + ' · ' + escapeHTML(entry.reserva.partida) +
        ' → ' + escapeHTML(entry.reserva.destino) + ' <span class="tag tag-info">' + escapeHTML(phaseLabel) +
        '</span> <span class="tag">Arquivada</span></strong>' +
      '<small>' + escapeHTML(entry.reserva.nome) + ' · ' + escapeHTML(plate || entry.reserva.carro) + '</small>' +
      '<small>Arquivado por ' + escapeHTML(entry.arquivado.registradoPor || '') + ' em ' +
        escapeHTML(formatDateTime(entry.arquivado.registradoEm)) + '</small>' +
    '</div>' +
    '<div class="management-actions">' +
      '<button type="button" class="secondary-btn checklist-unarchive-btn" data-id="' + escapeHTML(entry.reserva.id) +
        '" data-phase="' + entry.phase + '">Desarquivar</button>' +
    '</div>' +
  '</div>';
}

function checklistReviewMatchesSearch(entry, search){
  if(!search) return true;
  const haystack = [
    entry.reserva.numeroReserva, entry.reserva.nome, entry.reserva.carro, entry.reserva.partida, entry.reserva.destino
  ].map(value => String(value || '').toLocaleLowerCase('pt-BR')).join(' ');
  return haystack.includes(search);
}

// options.archivable=false esconde o botão "Arquivar" e o checkbox de
// seleção - usado só no grupo "Aprovados" da aba Arquivados, onde arquivar
// não faz sentido (já não está mais pendente de nada); nos grupos "Revisar
// retirada/devolução" da aba Pendente eles aparecem junto do botão
// "Checklist" (mesma ação de sempre, só o nome mudou).
// options.showPhase=false esconde o rótulo "Retirada"/"Devolução" antes da
// tag de status - usado nos grupos "Revisar retirada/devolução", onde o
// título do grupo já diz a fase, então o card mostra só a tag "Pendente".
// No grupo "Aprovados" (uma lista só, sem separar por fase) a fase continua
// aparecendo, senão não dava pra saber qual é qual.
function checklistReviewCardHTML(entry, options){
  const archivable = !options || options.archivable !== false;
  const showPhase = !options || options.showPhase !== false;
  const phaseLabel = entry.phase === 'retirada' ? 'Retirada' : 'Devolução';
  const statusHTML = entry.record.aprovado
    ? '<span class="tag tag-success">Aprovado</span>'
    : '<span class="tag tag-warning">Pendente</span>';
  const editedHTML = entry.record.editadoPor
    ? '<small>Editado por último por ' + escapeHTML(entry.record.editadoPor) + '</small>' : '';
  const archiveBtnHTML = archivable
    ? '<button type="button" class="delete-btn checklist-archive-btn" data-id="' + escapeHTML(entry.reserva.id) +
        '" data-phase="' + entry.phase + '">Arquivar</button>'
    : '';
  const key = checklistEntryKey(entry);
  const checkboxHTML = archivable
    ? '<label class="management-item-select">' +
      '<input type="checkbox" class="checklist-select-checkbox" data-key="' + escapeHTML(key) + '"' +
      (checklistSelectedKeys.has(key) ? ' checked' : '') + '></label>'
    : '';
  // Mesmo formato de título do grupo "Checklist" (#X · origem → destino) e
  // mesma troca do código curto do veículo pela placa completa embaixo -
  // ver checklistPendingOperationCardHTML, que introduziu os dois.
  const vehicleForPlate = getVehicle(entry.reserva.partida, entry.reserva.carro);
  const plate = vehicleForPlate && vehicleForPlate.placa ? String(vehicleForPlate.placa).toUpperCase() : '';
  return '<div class="management-item">' +
    checkboxHTML +
    '<div class="management-item-info">' +
      '<strong>#' + escapeHTML(entry.reserva.numeroReserva) + ' · ' + escapeHTML(entry.reserva.partida) +
        ' → ' + escapeHTML(entry.reserva.destino) +
        (showPhase ? ' <span class="tag tag-info">' + escapeHTML(phaseLabel) + '</span>' : '') +
        ' ' + statusHTML + '</strong>' +
      '<small>' + escapeHTML(entry.reserva.nome) + ' · ' + escapeHTML(plate || entry.reserva.carro) + '</small>' +
      '<small>Registrado por ' + escapeHTML(entry.record.registradoPor || '') + ' em ' +
        escapeHTML(formatDateTime(entry.record.registradoEm)) + '</small>' +
      editedHTML +
    '</div>' +
    '<div class="management-actions">' +
      '<button type="button" class="secondary-btn checklist-review-open-btn" data-id="' + escapeHTML(entry.reserva.id) +
        '" data-phase="' + entry.phase + '">Checklist</button>' +
      archiveBtnHTML +
    '</div>' +
  '</div>';
}

// Uma lista só, alternando pelo toggle "Pendente/Arquivados". "Pendente"
// junta os dois tipos de pendência num grupo cada (registrar retirada,
// registrar devolução, revisar retirada, revisar devolução - só os grupos
// não vazios aparecem); "Arquivados" junta os já aprovados com os
// arquivados manualmente (botão "Arquivar") num grupo cada. A busca
// (checklistReviewSearch) vale pros dois.
// Filtro por filial/veículo da aba Checklist - mesmo padrão dos filtros
// "Local"/"Veículo" da aba Reservas da gestão (ver populateAdminFilters em
// js/admin.js): duas listas fixas (CIDADES/CARROS_POR_LOCAL), sem depender
// uma da outra, combinadas em "E" com a busca livre do campo "Outra busca".
const checklistFiltroLocal = document.getElementById('checklistFiltroLocal');
const checklistFiltroCarro = document.getElementById('checklistFiltroCarro');

function populateChecklistFilters(){
  if(!checklistFiltroLocal || !checklistFiltroCarro) return;
  const locais = CIDADES;
  const currentLocal = checklistFiltroLocal.value;
  checklistFiltroLocal.innerHTML = '<option value="">Todas</option>' +
    locais.map(f => '<option value="' + escapeHTML(f) + '">' + escapeHTML(f) + '</option>').join('');
  if(locais.includes(currentLocal)) checklistFiltroLocal.value = currentLocal;

  const todosCarros = [];
  locais.forEach(f => (CARROS_POR_LOCAL[f] || []).forEach(c => {
    if(!todosCarros.some(item => String(item.codigo) === String(c))){
      todosCarros.push({ local:f, codigo:c });
    }
  }));
  const currentCarro = checklistFiltroCarro.value;
  checklistFiltroCarro.innerHTML = '<option value="">Todos</option>' +
    todosCarros.map(item => '<option value="' + escapeHTML(item.codigo) + '">' +
      escapeHTML(getVehicleDisplayName({ partida:item.local, carro:item.codigo })) + '</option>').join('');
  if(todosCarros.some(item => String(item.codigo) === currentCarro)) checklistFiltroCarro.value = currentCarro;
}
populateChecklistFilters();

if(checklistFiltroLocal) checklistFiltroLocal.addEventListener('change', renderChecklistManagement);
if(checklistFiltroCarro) checklistFiltroCarro.addEventListener('change', renderChecklistManagement);

function renderChecklistManagement(){
  const list = document.getElementById('checklistReviewList');
  if(!list) return;

  const search = String(document.getElementById('checklistReviewSearch').value || '')
    .trim().toLocaleLowerCase('pt-BR');
  const filtroLocal = checklistFiltroLocal ? checklistFiltroLocal.value : '';
  const filtroCarro = checklistFiltroCarro ? checklistFiltroCarro.value : '';
  const matchesChecklistFilters = entry =>
    (!filtroLocal || entry.reserva.partida === filtroLocal) &&
    (!filtroCarro || entry.reserva.carro === filtroCarro);

  const pendingOperationEntries = checklistPendingOperationEntries()
    .filter(entry => checklistPendingOperationMatchesSearch(entry, search) && matchesChecklistFilters(entry));
  const reviewEntries = checklistReviewEntries()
    .filter(entry => checklistReviewMatchesSearch(entry, search) && matchesChecklistFilters(entry));
  const pendingReviewEntries = reviewEntries.filter(entry => !entry.record.aprovado);
  const approvedEntries = reviewEntries.filter(entry => entry.record.aprovado);
  const archivedEntries = checklistArchivedEntries()
    .filter(entry => checklistArchivedMatchesSearch(entry, search) && matchesChecklistFilters(entry));

  document.getElementById('checklistPendingCount').textContent =
    String(pendingOperationEntries.length + pendingReviewEntries.length);
  document.getElementById('checklistArchivedTabCount').textContent =
    String(approvedEntries.length + archivedEntries.length);
  checklistReviewViewButtons.forEach(button => {
    button.classList.toggle('active', button.getAttribute('data-checklist-review-view') === checklistReviewView);
  });

  // Barra de seleção em massa - só existe dentro da visão "Pendente" (não
  // na aba Arquivados), sobre o conjunto de itens atualmente visíveis (já
  // filtrado pela busca). Itens que saíram da lista (foram registrados,
  // arquivados por outra pessoa etc.) somem da seleção sozinhos, porque não
  // entram mais em checklistCurrentSelectableKeys.
  checklistCurrentSelectableKeys = checklistReviewView === 'pendente'
    ? pendingOperationEntries.map(checklistEntryKey).concat(pendingReviewEntries.map(checklistEntryKey))
    : [];
  const validKeys = new Set(checklistCurrentSelectableKeys);
  [...checklistSelectedKeys].forEach(key => { if(!validKeys.has(key)) checklistSelectedKeys.delete(key); });

  const bulkBar = document.getElementById('checklistBulkActions');
  if(bulkBar){
    bulkBar.classList.toggle('hidden', !checklistCurrentSelectableKeys.length);
    const selectAllCheckbox = document.getElementById('checklistSelectAllCheckbox');
    if(selectAllCheckbox){
      const allSelected = checklistCurrentSelectableKeys.length > 0 &&
        checklistCurrentSelectableKeys.every(key => checklistSelectedKeys.has(key));
      const someSelected = checklistCurrentSelectableKeys.some(key => checklistSelectedKeys.has(key));
      selectAllCheckbox.checked = allSelected;
      selectAllCheckbox.indeterminate = someSelected && !allSelected;
    }
    const bulkRight = document.getElementById('checklistBulkActionsRight');
    if(bulkRight) bulkRight.classList.toggle('hidden', !checklistSelectedKeys.size);
    const bulkCountEl = document.getElementById('checklistBulkCount');
    if(bulkCountEl){
      bulkCountEl.textContent = checklistSelectedKeys.size +
        (checklistSelectedKeys.size === 1 ? ' selecionado' : ' selecionados');
    }
  }

  if(checklistReviewView === 'arquivados'){
    const archivedGroups = [
      { title:'Aprovados', entries:approvedEntries, cardHTML:entry => checklistReviewCardHTML(entry, { archivable:false }) },
      { title:'Arquivados', entries:archivedEntries, cardHTML:checklistArchivedCardHTML }
    ].filter(group => group.entries.length);

    list.innerHTML = archivedGroups.length
      ? archivedGroups.map(group =>
          '<div class="checklist-review-group">' +
            '<h4 class="checklist-review-group-title">' + escapeHTML(group.title) +
              ' <span class="tag">' + group.entries.length + '</span></h4>' +
            '<div class="management-list">' + group.entries.map(group.cardHTML).join('') + '</div>' +
          '</div>'
        ).join('')
      : '<p class="empty-state">Nenhum checklist arquivado ou aprovado encontrado.</p>';
    bindReservationFeatureButtons(list);
    return;
  }

  const groups = [
    // Retirada e devolução ainda não preenchidas pelo usuário caem juntas
    // no mesmo grupo "Checklist" - cada card mostra uma tag "Retirada"/
    // "Devolução" (sem "Pendente" junto - aqui pendente é o grupo inteiro).
    { title:'Checklist', entries:pendingOperationEntries, cardHTML:entry => checklistPendingOperationCardHTML(entry) },
    // Nestes dois o título do grupo já diz a fase, então o card mostra só a
    // tag de status "Pendente" (showPhase:false), sem repetir "Retirada"/
    // "Devolução".
    { title:'Revisar retirada', entries:pendingReviewEntries.filter(entry => entry.phase === 'retirada'),
      cardHTML:entry => checklistReviewCardHTML(entry, { showPhase:false }) },
    { title:'Revisar devolução', entries:pendingReviewEntries.filter(entry => entry.phase === 'devolucao'),
      cardHTML:entry => checklistReviewCardHTML(entry, { showPhase:false }) }
  ].filter(group => group.entries.length);

  list.innerHTML = groups.length
    ? groups.map(group =>
        '<div class="checklist-review-group">' +
          '<h4 class="checklist-review-group-title">' + escapeHTML(group.title) +
            ' <span class="tag">' + group.entries.length + '</span></h4>' +
          '<div class="management-list">' + group.entries.map(group.cardHTML).join('') + '</div>' +
        '</div>'
      ).join('')
    : '<p class="empty-state">Nenhum checklist pendente encontrado.</p>';
  bindReservationFeatureButtons(list);
}

const checklistReviewSearchInput = document.getElementById('checklistReviewSearch');
if(checklistReviewSearchInput) checklistReviewSearchInput.addEventListener('input', renderChecklistManagement);
checklistReviewViewButtons.forEach(button => {
  button.addEventListener('click', function(){
    checklistReviewView = button.getAttribute('data-checklist-review-view') === 'arquivados' ? 'arquivados' : 'pendente';
    renderChecklistManagement();
  });
});

// "Selecionar todos" marca/desmarca todo mundo que está visível na hora
// (respeita a busca) - não os que estão escondidos por causa de um filtro.
const checklistSelectAllCheckbox = document.getElementById('checklistSelectAllCheckbox');
if(checklistSelectAllCheckbox){
  checklistSelectAllCheckbox.addEventListener('change', function(){
    if(checklistSelectAllCheckbox.checked){
      checklistCurrentSelectableKeys.forEach(key => checklistSelectedKeys.add(key));
    }else{
      checklistCurrentSelectableKeys.forEach(key => checklistSelectedKeys.delete(key));
    }
    renderChecklistManagement();
  });
}

const checklistBulkClearBtn = document.getElementById('checklistBulkClearBtn');
if(checklistBulkClearBtn){
  checklistBulkClearBtn.addEventListener('click', function(){
    checklistSelectedKeys.clear();
    renderChecklistManagement();
  });
}

const checklistBulkArchiveBtn = document.getElementById('checklistBulkArchiveBtn');
if(checklistBulkArchiveBtn){
  checklistBulkArchiveBtn.addEventListener('click', function(){
    if(checklistSelectedKeys.size) submitChecklistArchiveMany([...checklistSelectedKeys]);
  });
}

// Registro por trás do botão "Arquivar"/"Desarquivar" da aba Checklist -
// mesmo endpoint pra arquivar (a partir de um card pendente ou de revisão,
// um por um ou vários de uma vez pela seleção) e pra desarquivar (a partir
// da lista discreta de arquivados).
async function submitChecklistArchive(id, phase, archived){
  try{
    const result = await apiRequest(
      '/api/reservations/' + encodeURIComponent(id) + '/operacao/' + phase + '/archive',
      { method:'PATCH', body:{ arquivado:archived } }
    );
    applyUpdatedReservationToCache(result.reservation);
    renderChecklistManagement();
  }catch(error){
    await hydrateDatabaseState();
    await showSiteAlert(error.message, {
      title: archived ? 'Não foi possível arquivar' : 'Não foi possível desarquivar',
      type:'danger'
    });
  }
}

// Arquiva vários itens selecionados de uma vez (botão "Arquivar
// selecionados" da barra de seleção em massa). Vai um por um - se algum
// falhar (ex.: outra pessoa já registrou/arquivou nesse meio tempo), os
// outros continuam e só no final aparece um aviso resumindo o que não deu.
async function submitChecklistArchiveMany(keys){
  const failures = [];
  for(const key of keys){
    const { id, phase } = parseChecklistEntryKey(key);
    try{
      const result = await apiRequest(
        '/api/reservations/' + encodeURIComponent(id) + '/operacao/' + phase + '/archive',
        { method:'PATCH', body:{ arquivado:true } }
      );
      applyUpdatedReservationToCache(result.reservation);
      checklistSelectedKeys.delete(key);
    }catch(error){
      failures.push(error && error.message ? error.message : 'Falha desconhecida');
    }
  }
  renderChecklistManagement();
  if(failures.length){
    await hydrateDatabaseState();
    renderChecklistManagement();
    await showSiteAlert(
      failures.length === keys.length
        ? 'Não foi possível arquivar os itens selecionados.'
        : failures.length + ' de ' + keys.length + ' itens selecionados não puderam ser arquivados.',
      { title:'Não foi possível arquivar tudo', type:'danger' }
    );
  }
}

const checklistReviewListEl = document.getElementById('checklistReviewList');
if(checklistReviewListEl){
  checklistReviewListEl.addEventListener('click', function(e){
    const openBtn = e.target.closest('.checklist-review-open-btn');
    if(openBtn){
      openChecklistReviewModal(openBtn.dataset.id, openBtn.dataset.phase);
      return;
    }
    const archiveBtn = e.target.closest('.checklist-archive-btn');
    if(archiveBtn){
      submitChecklistArchive(archiveBtn.dataset.id, archiveBtn.dataset.phase, true);
      return;
    }
    const unarchiveBtn = e.target.closest('.checklist-unarchive-btn');
    if(unarchiveBtn){
      submitChecklistArchive(unarchiveBtn.dataset.id, unarchiveBtn.dataset.phase, false);
    }
  });
  checklistReviewListEl.addEventListener('change', function(e){
    const checkbox = e.target.closest('.checklist-select-checkbox');
    if(!checkbox) return;
    const key = checkbox.dataset.key;
    if(checkbox.checked) checklistSelectedKeys.add(key);
    else checklistSelectedKeys.delete(key);
    renderChecklistManagement();
  });
}

function checklistReviewViewMarkedCount(viewId){
  return CHECKLIST_DIAGRAM_POINTS.filter(p => p.view === viewId && checklistReviewState.areas.includes(p.id)).length;
}

// Mesma lógica de renderChecklistDiagram/switchChecklistView/toggleChecklistPoint
// (ver início do arquivo), só que contra checklistReviewState/checklistReviewActiveView
// e os elementos do modal de revisão (#checklistReview*) em vez do formulário de
// retirada/devolução - são duas instâncias independentes do mesmo diagrama.
function renderChecklistReviewDiagram(){
  const wrap = document.getElementById('checklistReviewDiagram');
  if(!wrap) return;
  const tabsHTML = CHECKLIST_DIAGRAM_VIEWS.map(view => {
    const count = checklistReviewViewMarkedCount(view.id);
    const badge = count ? ' <span class="checklist-diagram-tab-count">' + count + '</span>' : '';
    return '<button type="button" class="checklist-diagram-tab' +
      (view.id === checklistReviewActiveView ? ' is-active' : '') + '" data-view="' + view.id + '" ' +
      'role="tab" aria-selected="' + (view.id === checklistReviewActiveView ? 'true' : 'false') + '">' +
      escapeHTML(view.label) + badge + '</button>';
  }).join('');

  const panelsHTML = CHECKLIST_DIAGRAM_VIEWS.map(view => {
    const points = CHECKLIST_DIAGRAM_POINTS
      .map((point, index) => ({ point, index }))
      .filter(item => item.point.view === view.id);
    const pointsHTML = points.map(({ point, index }) => {
      const left = (point.x / view.w * 100).toFixed(2);
      const top = (point.y / view.h * 100).toFixed(2);
      const marked = checklistReviewState.areas.includes(point.id);
      return '<button type="button" class="checklist-point' + (marked ? ' is-marked' : '') + '" data-point="' + point.id + '" ' +
        'style="left:' + left + '%;top:' + top + '%" aria-pressed="' + (marked ? 'true' : 'false') + '" ' +
        'aria-label="' + (index + 1) + '. ' + escapeHTML(point.label) + '" ' +
        'title="' + (index + 1) + '. ' + escapeHTML(point.label) + '">' + (index + 1) + '</button>';
    }).join('');
    const leaderPoints = points.filter(item => item.point.tx != null && item.point.ty != null);
    const leadersSVG = leaderPoints.length ? (
      '<svg class="checklist-leader-lines" viewBox="0 0 ' + view.w + ' ' + view.h + '" preserveAspectRatio="none">' +
      '<defs><marker id="checklistReviewArrow-' + view.id + '" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L8,4 L0,8 Z" fill="var(--danger)"></path></marker></defs>' +
      leaderPoints.map(({ point }) =>
        '<line x1="' + point.x + '" y1="' + point.y + '" x2="' + point.tx + '" y2="' + point.ty + '" ' +
        'marker-end="url(#checklistReviewArrow-' + view.id + ')"></line>'
      ).join('') + '</svg>'
    ) : '';
    return '<div class="checklist-diagram-view' + (view.id === checklistReviewActiveView ? ' is-active' : '') + '" data-view="' + view.id + '">' +
      '<div class="checklist-diagram" style="aspect-ratio:' + view.w + '/' + view.h + '">' +
      '<img class="checklist-diagram-img" src="' + view.img + '" alt="Diagrama do veículo - ' + escapeHTML(view.label) + '">' +
      leadersSVG +
      '<div class="checklist-points">' + pointsHTML + '</div>' +
      '</div>' +
      '</div>';
  }).join('');

  wrap.innerHTML = '<div class="checklist-diagram-tabs" role="tablist">' + tabsHTML + '</div>' +
    '<div class="checklist-diagram-views">' + panelsHTML + '</div>';
}

function switchChecklistReviewView(viewId){
  if(!CHECKLIST_DIAGRAM_VIEWS.some(v => v.id === viewId) || viewId === checklistReviewActiveView) return;
  checklistReviewActiveView = viewId;
  const wrap = document.getElementById('checklistReviewDiagram');
  if(!wrap) return;
  wrap.querySelectorAll('.checklist-diagram-tab').forEach(tab => {
    const active = tab.dataset.view === viewId;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  wrap.querySelectorAll('.checklist-diagram-view').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.view === viewId);
  });
  renderChecklistReviewLegend();
}

function renderChecklistReviewLegend(){
  const el = document.getElementById('checklistReviewDiagramLegend');
  if(!el) return;
  el.innerHTML = CHECKLIST_DIAGRAM_POINTS.map((point, index) => ({ point, index }))
    .filter(item => item.point.view === checklistReviewActiveView)
    .map(({ point, index }) =>
      '<span class="checklist-diagram-legend-item"><b>' + (index + 1) + '</b> ' + escapeHTML(point.label) + '</span>'
    ).join('');
}

function toggleChecklistReviewPoint(pointId){
  const idx = checklistReviewState.areas.indexOf(pointId);
  if(idx === -1) checklistReviewState.areas.push(pointId);
  else checklistReviewState.areas.splice(idx, 1);
  const g = document.querySelector('#checklistReviewDiagram [data-point="' + pointId + '"]');
  if(g){
    const marked = idx === -1;
    g.classList.toggle('is-marked', marked);
    g.setAttribute('aria-pressed', marked ? 'true' : 'false');
  }
  const point = CHECKLIST_DIAGRAM_POINTS.find(p => p.id === pointId);
  if(point){
    const tab = document.querySelector('#checklistReviewDiagram .checklist-diagram-tab[data-view="' + point.view + '"]');
    if(tab){
      const count = checklistReviewViewMarkedCount(point.view);
      let badge = tab.querySelector('.checklist-diagram-tab-count');
      if(count){
        if(!badge){
          badge = document.createElement('span');
          badge.className = 'checklist-diagram-tab-count';
          tab.appendChild(badge);
        }
        badge.textContent = String(count);
      }else if(badge){
        badge.remove();
      }
    }
  }
}

const checklistReviewDiagramEl = document.getElementById('checklistReviewDiagram');
if(checklistReviewDiagramEl){
  checklistReviewDiagramEl.addEventListener('click', function(e){
    const tab = e.target.closest('.checklist-diagram-tab');
    if(tab){
      switchChecklistReviewView(tab.dataset.view);
      return;
    }
    const point = e.target.closest('.checklist-point');
    if(point) toggleChecklistReviewPoint(point.dataset.point);
  });
}

function renderChecklistReviewComponents(){
  const wrap = document.getElementById('checklistReviewComponents');
  if(!wrap) return;
  wrap.innerHTML = CHECKLIST_COMPONENTS.map(item => {
    const current = checklistReviewState.componentes[item.key] || 'C';
    const buttons = ['C', 'A', 'X'].map(status =>
      '<button type="button" class="checklist-component-btn' +
      (status === current ? ' is-active' : '') + '" data-key="' + item.key +
      '" data-status="' + status + '">' + status + '</button>'
    ).join('');
    return '<div class="checklist-component-row">' +
      '<span class="checklist-component-label">' + escapeHTML(item.label) + '</span>' +
      '<span class="checklist-component-options">' + buttons + '</span>' +
      '</div>';
  }).join('');
}

const checklistReviewComponentsEl = document.getElementById('checklistReviewComponents');
if(checklistReviewComponentsEl){
  checklistReviewComponentsEl.addEventListener('click', function(e){
    const btn = e.target.closest('.checklist-component-btn');
    if(!btn) return;
    checklistReviewState.componentes[btn.dataset.key] = btn.dataset.status;
    document.querySelectorAll('#checklistReviewComponents .checklist-component-btn[data-key="' + btn.dataset.key + '"]')
      .forEach(b => b.classList.toggle('is-active', b.dataset.status === checklistReviewState.componentes[btn.dataset.key]));
  });
}

function openChecklistReviewModal(legacyId, phase){
  const reserva = getReservations().find(r => String(r.id) === String(legacyId));
  const record = reserva && reserva.operacao && reserva.operacao[phase];
  if(!reserva || !record) return;
  checklistReviewContext = { legacyId:String(legacyId), phase, reserva };
  const checklist = record.checklist || { areas:[], componentes:{}, observacoes:'' };
  checklistReviewState = {
    areas:Array.isArray(checklist.areas) ? checklist.areas.slice() : [],
    componentes:{ ...(checklist.componentes || {}) }
  };
  CHECKLIST_COMPONENTS.forEach(item => {
    if(!checklistReviewState.componentes[item.key]) checklistReviewState.componentes[item.key] = 'C';
  });
  checklistReviewActiveView = 'frontal';

  const phaseLabel = phase === 'retirada' ? 'Retirada' : 'Devolução';
  document.getElementById('checklistReviewTitle').textContent =
    'Checklist · Reserva #' + reserva.numeroReserva + ' · ' + phaseLabel;
  document.getElementById('checklistReviewSubtitle').textContent =
    reserva.nome + ' · ' + reserva.carro + ' · ' + reserva.partida +
    ' · registrado por ' + (record.registradoPor || '') +
    (record.registradoEm ? ' em ' + formatDateTime(record.registradoEm) : '');
  const statusBadge = document.getElementById('checklistReviewStatusBadge');
  statusBadge.innerHTML = record.aprovado
    ? '<span class="tag tag-success">Aprovado por ' + escapeHTML(record.aprovadoPor || '') + '</span>'
    : '<span class="tag tag-warning">Pendente de aprovação</span>';
  if(record.editadoPor){
    statusBadge.innerHTML += ' <span class="tag tag-info">Editado por último por ' + escapeHTML(record.editadoPor) + '</span>';
  }

  document.getElementById('checklistReviewOdometer').value = record.quilometragem != null ? formatKmDigits(record.quilometragem) : '';
  document.getElementById('checklistReviewFuel').value = record.combustivel || '';
  document.getElementById('checklistReviewCleanliness').value = record.condicaoLimpeza || '';
  document.getElementById('checklistReviewInspector').value = record.vistoriador || '';
  document.getElementById('checklistReviewAvarias').value = record.avarias || '';
  document.getElementById('checklistReviewObs').value = checklist.observacoes || '';
  document.getElementById('checklistReviewError').textContent = '';

  // Mesmas fotos anexadas na retirada/devolução (ver renderOperationPhoto,
  // já usado no card da reserva em "Minhas Reservas"/"Reservas") - agora
  // também aparecem aqui, pra quem revisa não precisar abrir a reserva em
  // outra aba só pra ver o que foi fotografado.
  const reviewPhotosEl = document.getElementById('checklistReviewPhotos');
  if(reviewPhotosEl){
    const photos = Array.isArray(record.fotos) ? record.fotos : [];
    reviewPhotosEl.innerHTML = photos.length
      ? photos.map((photo, index) => renderOperationPhoto(photo, index, phaseLabel)).join('')
      : '<p class="empty-state">Nenhuma foto anexada.</p>';
  }

  renderChecklistReviewDiagram();
  renderChecklistReviewLegend();
  renderChecklistReviewComponents();

  const approveBtn = document.getElementById('checklistReviewApproveBtn');
  approveBtn.disabled = !!record.aprovado;
  approveBtn.textContent = record.aprovado ? 'Já aprovado' : 'Aprovar';

  document.getElementById('checklistReviewModal').classList.remove('hidden');
}

function closeChecklistReviewModal(){
  checklistReviewContext = null;
  document.getElementById('checklistReviewModal').classList.add('hidden');
}

const checklistReviewCloseBtn = document.getElementById('checklistReviewCloseBtn');
if(checklistReviewCloseBtn) checklistReviewCloseBtn.addEventListener('click', closeChecklistReviewModal);
const checklistReviewModalEl = document.getElementById('checklistReviewModal');
if(checklistReviewModalEl){
  checklistReviewModalEl.addEventListener('click', function(e){
    if(e.target === checklistReviewModalEl) closeChecklistReviewModal();
  });
}

// Aplica a reserva atualizada devolvida pelo servidor (PATCH .../checklist) ao
// cache local, igual ao que syncReservations faz numa sincronização normal -
// assim a lista e o modal refletem o que acabou de ser aprovado/editado sem
// precisar recarregar a página.
function applyUpdatedReservationToCache(updatedReservation){
  if(!updatedReservation) return;
  const list = getReservations();
  const idx = list.findIndex(r => String(r.id) === String(updatedReservation.id));
  if(idx === -1) list.push(updatedReservation);
  else list[idx] = updatedReservation;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

async function submitChecklistReview(action, body){
  if(!checklistReviewContext) return;
  const { legacyId, phase } = checklistReviewContext;
  const errorEl = document.getElementById('checklistReviewError');
  errorEl.textContent = '';
  try{
    const result = await apiRequest(
      '/api/reservations/' + encodeURIComponent(legacyId) + '/operacao/' + phase + '/checklist',
      { method:'PATCH', body:{ action, ...body } }
    );
    applyUpdatedReservationToCache(result.reservation);
    renderChecklistManagement();
    openChecklistReviewModal(legacyId, phase);
  }catch(error){
    errorEl.textContent = error.message;
  }
}

const checklistReviewApproveBtn = document.getElementById('checklistReviewApproveBtn');
if(checklistReviewApproveBtn){
  checklistReviewApproveBtn.addEventListener('click', function(){
    submitChecklistReview('approve', {});
  });
}

const checklistReviewForm = document.getElementById('checklistReviewForm');
if(checklistReviewForm){
  checklistReviewForm.addEventListener('submit', function(e){
    e.preventDefault();
    const km = kmInputValue(document.getElementById('checklistReviewOdometer'));
    if(!Number.isInteger(km) || km < 0){
      document.getElementById('checklistReviewError').textContent = 'Informe uma quilometragem válida.';
      return;
    }
    const record = {
      quilometragem:km,
      combustivel:document.getElementById('checklistReviewFuel').value.trim(),
      avarias:document.getElementById('checklistReviewAvarias').value.trim(),
      condicaoLimpeza:document.getElementById('checklistReviewCleanliness').value || undefined,
      vistoriador:document.getElementById('checklistReviewInspector').value.trim() || undefined,
      checklist:{
        areas:checklistReviewState.areas.slice(),
        componentes:{ ...checklistReviewState.componentes },
        observacoes:document.getElementById('checklistReviewObs').value.trim()
      }
    };
    submitChecklistReview('edit', { record });
  });
}

