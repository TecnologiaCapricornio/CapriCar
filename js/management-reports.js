/* Gestão — auditoria e relatórios */

/* =========================================================
   Auditoria
   ========================================================= */
const auditList = document.getElementById('auditList');
const auditUserFilter = document.getElementById('auditUserFilter');
const auditActionFilter = document.getElementById('auditActionFilter');
const auditStartDate = document.getElementById('auditStart');
const auditEndDate = document.getElementById('auditEnd');
const auditStartTime = document.getElementById('auditStartTime');
const auditEndTime = document.getElementById('auditEndTime');

function formatDateTime(iso){
  if(!iso) return '';
  const date = new Date(iso);
  return date.toLocaleString('pt-BR');
}

// Compara no fuso do navegador, igual ao resto da interface (ver
// formatDateTime acima) - o servidor grava created_at em UTC, então essa
// conversão é a mesma que toLocaleString já faz para exibir a data.
function auditEntryWithinPeriod(entry){
  const startDate = auditStartDate.value;
  const endDate = auditEndDate.value;
  const startTime = auditStartTime.value;
  const endTime = auditEndTime.value;
  if(!startDate && !endDate && !startTime && !endTime) return true;
  const entryDate = new Date(entry.timestamp);
  if(Number.isNaN(entryDate.getTime())) return true;
  const entryISO = isoFromParts(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
  if(startDate && entryISO < startDate) return false;
  if(endDate && entryISO > endDate) return false;
  const entryMinutes = entryDate.getHours() * 60 + entryDate.getMinutes();
  if(startTime){
    const [h, m] = startTime.split(':').map(Number);
    if(entryMinutes < h * 60 + m) return false;
  }
  if(endTime){
    const [h, m] = endTime.split(':').map(Number);
    if(entryMinutes > h * 60 + m) return false;
  }
  return true;
}

function auditFilterText(){
  const parts = [];
  const userFilter = auditUserFilter.value.trim();
  const actionFilter = auditActionFilter.value;
  if(userFilter) parts.push('usuário contém "' + userFilter + '"');
  if(actionFilter) parts.push('ação: ' + auditActionFilter.selectedOptions[0].textContent);
  if(auditStartDate.value || auditEndDate.value){
    parts.push('período: ' + (auditStartDate.value ? formatDate(auditStartDate.value) : 'início') +
      ' até ' + (auditEndDate.value ? formatDate(auditEndDate.value) : 'hoje'));
  }
  if(auditStartTime.value || auditEndTime.value){
    parts.push('horário: ' + (auditStartTime.value || '00:00') + ' às ' + (auditEndTime.value || '23:59'));
  }
  return parts.length ? parts.join(' · ') : 'nenhum filtro aplicado';
}

function getFilteredAuditEntries(){
  const userFilter = auditUserFilter.value.trim().toLowerCase();
  const actionFilter = auditActionFilter.value;
  return getAuditLog().filter(entry => {
    if(userFilter && !String(entry.user).toLowerCase().includes(userFilter)) return false;
    if(actionFilter && entry.action !== actionFilter) return false;
    if(!auditEntryWithinPeriod(entry)) return false;
    return true;
  });
}

function renderAuditLog(){
  if(!canViewAudit()) return;
  const list = getFilteredAuditEntries();
  auditList.innerHTML = list.length ? list.slice(0, 500).map(entry =>
    '<div class="audit-entry">' +
      '<div class="audit-marker"></div>' +
      '<div><strong>' + escapeHTML(entry.user) + ' ' + escapeHTML(entry.action) + ' ' + escapeHTML(entry.entity) + '</strong>' +
      '<small>' + escapeHTML(formatDateTime(entry.timestamp)) + ' · ' + escapeHTML(entry.details || '') + '</small></div>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum evento encontrado.</div>';
}

[auditUserFilter, auditActionFilter, auditStartTime, auditEndTime].forEach(el => {
  el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderAuditLog);
});
[auditStartDate, auditEndDate].forEach(el => {
  el.addEventListener('change', renderAuditLog);
});

function printableAuditCell(value){
  return escapeHTML(value == null || value === '' ? '—' : String(value));
}

function buildPrintableAuditReport(list){
  const generatedAt = new Date().toLocaleString('pt-BR');
  const rows = list.map(entry =>
    '<tr>' +
      '<td>' + printableAuditCell(formatDateTime(entry.timestamp)) + '</td>' +
      '<td>' + printableAuditCell(entry.user) + '</td>' +
      '<td>' + printableAuditCell(entry.action) + '</td>' +
      '<td>' + printableAuditCell(entry.entity) + '</td>' +
      '<td>' + printableAuditCell(entry.details) + '</td>' +
    '</tr>'
  ).join('');
  const emptyRow = '<tr><td colspan="5" class="empty">Nenhum evento encontrado para os filtros selecionados.</td></tr>';

  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<title>Auditoria CapriCar - ' + printableAuditCell(todayISO()) + '</title>' +
    '<style>' +
      '@page{size:A4 landscape;margin:12mm}' +
      '*{box-sizing:border-box}' +
      'body{margin:0;color:#172b3d;background:#fff;font:11px Arial,sans-serif}' +
      '.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:3px solid #3a6a95}' +
      '.brand{display:flex;align-items:center;gap:10px}.mark{width:38px;height:38px;border-radius:11px;background:#1e3a5a;color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px}' +
      'h1{margin:0;color:#1e3a5a;font-size:21px}' +
      '.subtitle,.meta{color:#62778a}.meta{text-align:right;line-height:1.5}' +
      '.filters{margin:10px 0;padding:8px 10px;border-radius:7px;background:#edf3f8;color:#3e566b}' +
      'table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:10px}' +
      'thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}' +
      'th{padding:8px 7px;background:#1e3a5a;color:#fff;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.25px}' +
      'td{padding:7px;border:1px solid #dbe5ed;vertical-align:top;line-height:1.35;overflow-wrap:anywhere}' +
      'tbody tr:nth-child(even){background:#f5f9fc}.empty{text-align:center;padding:22px;color:#62778a}' +
      'th:nth-child(1){width:16%}th:nth-child(2){width:16%}th:nth-child(3){width:14%}th:nth-child(4){width:14%}th:nth-child(5){width:40%}' +
      '.footer{margin-top:12px;padding-top:7px;border-top:1px solid #dbe5ed;color:#7b8d9c;text-align:right;font-size:9px}' +
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
    '</style></head><body>' +
      '<header class="header"><div class="brand"><div class="mark">CC</div><div><h1>Auditoria</h1>' +
        '<div class="subtitle">CapriCar · Gestão de veículos e reservas</div></div></div>' +
        '<div class="meta"><strong>Emitido em</strong><br>' + printableAuditCell(generatedAt) + '</div></header>' +
      '<div class="filters"><strong>Filtros:</strong> ' + printableAuditCell(auditFilterText()) + '</div>' +
      '<table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead>' +
        '<tbody>' + (rows || emptyRow) + '</tbody></table>' +
      '<div class="footer">Auditoria gerada pelo CapriCar · ' + printableAuditCell(generatedAt) + '</div>' +
    '</body></html>';
}

document.getElementById('exportAuditPdfBtn').addEventListener('click', async function(){
  if(!canViewAudit()) return;
  const auditWindow = window.open('', '_blank');
  if(!auditWindow){
    await showSiteAlert('Permita a abertura de pop-ups para exportar a auditoria em PDF.', {
      title:'Pop-up bloqueado',
      type:'warning'
    });
    return;
  }
  const list = getFilteredAuditEntries();
  auditWindow.document.open();
  auditWindow.document.write(buildPrintableAuditReport(list));
  auditWindow.document.close();
  auditWindow.opener = null;
  logAudit('exportou', 'auditoria PDF', todayISO(), list.length + ' eventos exportados');
  auditWindow.setTimeout(function(){
    auditWindow.focus();
    auditWindow.print();
  }, 350);
});

/* =========================================================
   Relatórios e CSV
   ========================================================= */
const reportInputs = [
  document.getElementById('reportBranch'),
  document.getElementById('reportVehicle'),
  document.getElementById('reportUser'),
  document.getElementById('reportStart'),
  document.getElementById('reportEnd')
];

function getFilteredReportReservations(){
  const filial = document.getElementById('reportBranch').value;
  const vehicleKey = document.getElementById('reportVehicle').value;
  const user = document.getElementById('reportUser').value.trim().toLowerCase();
  const start = document.getElementById('reportStart').value;
  const end = document.getElementById('reportEnd').value;
  return getReservations().filter(r => {
    if(filial && r.partida !== filial) return false;
    if(vehicleKey && carKey(r.partida, r.carro) !== vehicleKey) return false;
    if(user && !String(r.nome).toLowerCase().includes(user)) return false;
    if(start && r.dataVolta < start) return false;
    if(end && r.dataIda > end) return false;
    return true;
  });
}

function reservationKm(reserva){
  const op = reserva.operacao || {};
  if(!op.retirada || !op.devolucao) return 0;
  return Math.max(0, Number(op.devolucao.quilometragem || 0) - Number(op.retirada.quilometragem || 0));
}

function renderReports(){
  if(!canViewReports()) return;
  refreshBranchSelectors();
  const list = getFilteredReportReservations();
  const totalKm = list.reduce((sum, r) => sum + reservationKm(r), 0);
  const completed = list.filter(r => r.operacao && r.operacao.devolucao).length;
  const users = new Set(list.map(r => r.nome)).size;
  document.getElementById('reportSummary').innerHTML =
    '<div><strong>' + list.length + '</strong><span>reservas</span></div>' +
    '<div><strong>' + completed + '</strong><span>concluídas</span></div>' +
    '<div><strong>' + totalKm.toLocaleString('pt-BR') + '</strong><span>quilômetros</span></div>' +
    '<div><strong>' + users + '</strong><span>usuários</span></div>';
  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = list.length ? list.map(r =>
    '<tr>' +
      '<td><strong>' + escapeHTML(getReservationNumberLabel(r)) + '</strong></td>' +
      '<td>' + formatDate(r.dataIda) + ' – ' + formatDate(r.dataVolta) + '</td>' +
      '<td>' + escapeHTML(r.partida) + '</td>' +
      '<td>' + escapeHTML(getVehicleDisplayName(r)) + '</td>' +
      '<td>' + escapeHTML(r.nome) + '</td>' +
      '<td>' + escapeHTML(r.motivo || '') + '</td>' +
      '<td>' + reservationKm(r).toLocaleString('pt-BR') + '</td>' +
      '<td>' + escapeHTML(r.status || 'confirmada') + '</td>' +
    '</tr>'
  ).join('') : '<tr><td colspan="8">Nenhuma reserva encontrada.</td></tr>';
}

reportInputs.forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderReports));

function csvCell(value){
  return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

function exportDateTime(dateISO, time){
  if(!dateISO) return '';
  return formatDate(dateISO) + (time ? ' ' + time : '');
}

function operationDateTime(iso){
  if(!iso) return '';
  const date = new Date(iso);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR') + ' ' +
    date.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

function getReportExportData(){
  const headers = [
    'ID da reserva',
    'Retirada prevista','Devolução prevista',
    'Retirada realizada','Devolução realizada',
    'Filial','Carro','Usuário','Motivo','Ocupantes',
    'Km inicial','Km final','Km rodados',
    'Combustível retirada','Combustível devolução',
    'Avarias retirada','Avarias devolução','Status'
  ];
  const rows = getFilteredReportReservations().map(r => {
    const op = r.operacao || {};
    const retirada = op.retirada || {};
    const devolucao = op.devolucao || {};
    return [
      getReservationNumberLabel(r),
      exportDateTime(r.dataIda, r.horarioRetirada),
      exportDateTime(r.dataVolta, r.horarioDevolucao),
      operationDateTime(retirada.registradoEm),
      operationDateTime(devolucao.registradoEm),
      r.partida, getVehicleDisplayName(r), r.nome, r.motivo || '', getOcupantes(r),
      retirada.quilometragem ?? '', devolucao.quilometragem ?? '', reservationKm(r),
      retirada.combustivel || '', devolucao.combustivel || '', retirada.avarias || '',
      devolucao.avarias || '', r.status || 'confirmada'
    ];
  });
  return { headers, rows };
}

function downloadReportFile(content, type, extension){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'capricar-relatorio-' + todayISO() + extension;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function encodeUtf16LE(text){
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xFF;
  bytes[1] = 0xFE;
  for(let i = 0; i < text.length; i++){
    const code = text.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xFF;
    bytes[3 + i * 2] = code >> 8;
  }
  return bytes;
}

document.getElementById('exportExcelBtn').addEventListener('click', function(){
  if(!canViewReports()) return;
  const data = getReportExportData();
  const widths = [10,22,22,22,22,16,12,18,20,12,14,14,14,19,19,30,30,16];
  const workbook = buildXlsxWorkbook(data.headers, data.rows, widths);
  downloadReportFile(
    workbook,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xlsx'
  );
  logAudit('exportou', 'relatório Excel', todayISO(), data.rows.length + ' reservas exportadas');
});

function reportFilterText(){
  const branch = document.getElementById('reportBranch');
  const vehicle = document.getElementById('reportVehicle');
  const user = document.getElementById('reportUser').value.trim();
  const start = document.getElementById('reportStart').value;
  const end = document.getElementById('reportEnd').value;
  const parts = [];
  if(branch.value) parts.push('Filial: ' + branch.options[branch.selectedIndex].text);
  if(vehicle.value) parts.push('Veículo: ' + vehicle.options[vehicle.selectedIndex].text);
  if(user) parts.push('Usuário: ' + user);
  if(start) parts.push('Desde: ' + formatDate(start));
  if(end) parts.push('Até: ' + formatDate(end));
  return parts.length ? parts.join(' | ') : 'Todas as filiais, veículos, períodos e usuários';
}

function printableCell(value){
  return escapeHTML(value == null || value === '' ? '—' : String(value));
}

function buildPrintableReport(list){
  const totalKm = list.reduce((sum, item) => sum + reservationKm(item), 0);
  const completed = list.filter(item => item.operacao && item.operacao.devolucao).length;
  const users = new Set(list.map(item => item.nome)).size;
  const generatedAt = new Date().toLocaleString('pt-BR');

  const overviewRows = list.map(item => {
    return '<tr>' +
      '<td><strong>' + printableCell(getReservationNumberLabel(item)) + '</strong></td>' +
      '<td>' + printableCell(exportDateTime(item.dataIda, item.horarioRetirada)) + '<br><small>até ' +
        printableCell(exportDateTime(item.dataVolta, item.horarioDevolucao)) + '</small></td>' +
      '<td><strong>' + printableCell(item.partida) + ' → ' + printableCell(item.destino) + '</strong></td>' +
      '<td>' + printableCell(getVehicleDisplayName(item)) + '</td>' +
      '<td>' + printableCell(item.nome) + '</td>' +
      '<td class="center">' + printableCell(getOcupantes(item)) + '</td>' +
      '<td class="right">' + printableCell(reservationKm(item).toLocaleString('pt-BR')) + '</td>' +
      '<td><span class="status">' + printableCell(item.status || 'confirmada') + '</span></td>' +
    '</tr>';
  }).join('');

  const operationRows = list.map(item => {
    const operation = item.operacao || {};
    const pickup = operation.retirada || {};
    const returnData = operation.devolucao || {};
    const pickupDetails = operation.retirada
      ? '<strong>' + printableCell(operationDateTime(pickup.registradoEm)) + '</strong><br>' +
        printableCell(pickup.quilometragem) + ' km · ' + printableCell(pickup.combustivel)
      : '<span class="pending">Não registrada</span>';
    const returnDetails = operation.devolucao
      ? '<strong>' + printableCell(operationDateTime(returnData.registradoEm)) + '</strong><br>' +
        printableCell(returnData.quilometragem) + ' km · ' + printableCell(returnData.combustivel)
      : '<span class="pending">Não registrada</span>';
    const damages = [
      pickup.avarias ? 'Retirada: ' + pickup.avarias : '',
      returnData.avarias ? 'Devolução: ' + returnData.avarias : ''
    ].filter(Boolean).join(' | ');
    return '<tr>' +
      '<td><strong>' + printableCell(getReservationNumberLabel(item) + ' · ' + item.partida + ' · ' + getVehicleDisplayName(item)) + '</strong><br><small>' +
        printableCell(item.nome) + '</small></td>' +
      '<td>' + pickupDetails + '</td>' +
      '<td>' + returnDetails + '</td>' +
      '<td>' + printableCell(item.motivo || 'Não informado') + '</td>' +
      '<td>' + printableCell(damages || 'Nenhuma avaria informada') + '</td>' +
    '</tr>';
  }).join('');

  const emptyRow = '<tr><td colspan="8" class="empty">Nenhuma reserva encontrada para os filtros selecionados.</td></tr>';
  const emptyOperationRow = '<tr><td colspan="5" class="empty">Nenhum registro operacional encontrado.</td></tr>';

  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<title>Relatório CapriCar - ' + printableCell(todayISO()) + '</title>' +
    '<style>' +
      '@page{size:A4 landscape;margin:12mm}' +
      '*{box-sizing:border-box}' +
      'body{margin:0;color:#172b3d;background:#fff;font:11px Arial,sans-serif}' +
      '.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:3px solid #3a6a95}' +
      '.brand{display:flex;align-items:center;gap:10px}.mark{width:38px;height:38px;border-radius:11px;background:#1e3a5a;color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px}' +
      'h1{margin:0;color:#1e3a5a;font-size:21px}h2{margin:22px 0 9px;color:#1e3a5a;font-size:14px}' +
      '.subtitle,.meta,small{color:#62778a}.meta{text-align:right;line-height:1.5}' +
      '.filters{margin:10px 0;padding:8px 10px;border-radius:7px;background:#edf3f8;color:#3e566b}' +
      '.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:13px 0}' +
      '.summary div{padding:10px;border:1px solid #d8e4ed;border-radius:8px;background:#f8fbfd}' +
      '.summary strong{display:block;color:#1e3a5a;font-size:18px}.summary span{color:#62778a}' +
      'table{width:100%;border-collapse:collapse;table-layout:fixed}' +
      'thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}' +
      'th{padding:8px 7px;background:#1e3a5a;color:#fff;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.25px}' +
      'td{padding:7px;border:1px solid #dbe5ed;vertical-align:top;line-height:1.35;overflow-wrap:anywhere}' +
      'tbody tr:nth-child(even){background:#f5f9fc}.center{text-align:center}.right{text-align:right}' +
      '.status{display:inline-block;padding:3px 6px;border-radius:9px;background:#dceaf5;color:#244d70;font-weight:700}' +
      '.pending{color:#9a5d25;font-style:italic}.empty{text-align:center;padding:22px;color:#62778a}' +
      '.overview th:nth-child(1){width:6%}.overview th:nth-child(2){width:15%}.overview th:nth-child(3){width:15%}.overview th:nth-child(4){width:13%}' +
      '.overview th:nth-child(5){width:15%}.overview th:nth-child(6){width:8%}.overview th:nth-child(7){width:9%}.overview th:nth-child(8){width:11%}' +
      '.operations th:nth-child(1){width:15%}.operations th:nth-child(2),.operations th:nth-child(3){width:19%}' +
      '.operations th:nth-child(4){width:21%}.operations th:nth-child(5){width:26%}' +
      '.footer{margin-top:12px;padding-top:7px;border-top:1px solid #dbe5ed;color:#7b8d9c;text-align:right;font-size:9px}' +
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
    '</style></head><body>' +
      '<header class="header"><div class="brand"><div class="mark">CC</div><div><h1>Relatório de utilização</h1>' +
        '<div class="subtitle">CapriCar · Gestão de veículos e reservas</div></div></div>' +
        '<div class="meta"><strong>Emitido em</strong><br>' + printableCell(generatedAt) + '</div></header>' +
      '<div class="filters"><strong>Filtros:</strong> ' + printableCell(reportFilterText()) + '</div>' +
      '<section class="summary">' +
        '<div><strong>' + list.length + '</strong><span>Reservas</span></div>' +
        '<div><strong>' + completed + '</strong><span>Concluídas</span></div>' +
        '<div><strong>' + printableCell(totalKm.toLocaleString('pt-BR')) + '</strong><span>Quilômetros rodados</span></div>' +
        '<div><strong>' + users + '</strong><span>Usuários</span></div>' +
      '</section>' +
      '<h2>Visão geral das reservas</h2>' +
      '<table class="overview"><thead><tr><th>ID</th><th>Período previsto</th><th>Rota</th><th>Veículo</th><th>Usuário</th>' +
        '<th>Ocupantes</th><th>Km rodados</th><th>Status</th></tr></thead><tbody>' + (overviewRows || emptyRow) + '</tbody></table>' +
      '<h2>Retirada, devolução e condições do veículo</h2>' +
      '<table class="operations"><thead><tr><th>Veículo / usuário</th><th>Retirada realizada</th><th>Devolução realizada</th>' +
        '<th>Motivo</th><th>Avarias e observações</th></tr></thead><tbody>' + (operationRows || emptyOperationRow) + '</tbody></table>' +
      '<div class="footer">Relatório gerado pelo CapriCar · ' + printableCell(generatedAt) + '</div>' +
    '</body></html>';
}

document.getElementById('exportPdfBtn').addEventListener('click', async function(){
  if(!canViewReports()) return;
  const reportWindow = window.open('', '_blank');
  if(!reportWindow){
    await showSiteAlert('Permita a abertura de pop-ups para exportar o relatório em PDF.', {
      title:'Pop-up bloqueado',
      type:'warning'
    });
    return;
  }
  const list = getFilteredReportReservations();
  reportWindow.document.open();
  reportWindow.document.write(buildPrintableReport(list));
  reportWindow.document.close();
  reportWindow.opener = null;
  logAudit('exportou', 'relatório PDF', todayISO(), list.length + ' reservas exportadas');
  reportWindow.setTimeout(function(){
    reportWindow.focus();
    reportWindow.print();
  }, 350);
});
