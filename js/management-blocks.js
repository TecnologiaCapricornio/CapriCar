/* Gestão — bloqueios da frota */

/* =========================================================
   Bloqueios da frota
   ========================================================= */
const blockForm = document.getElementById('blockForm');
const blocksList = document.getElementById('blocksList');

function renderBlocksManagement(){
  if(!canManageBlocks()) return;
  populateManagementVehicleSelectors();
  const blocks = getVehicleBlocks().slice().sort((a,b) => a.dataInicio.localeCompare(b.dataInicio));
  blocksList.innerHTML = blocks.length ? blocks.map(block =>
    '<div class="management-item block-item">' +
      '<div><strong>' + escapeHTML(block.tipo) + ' · ' + escapeHTML(block.filial) + ' · ' +
        escapeHTML(getVehicleDisplayName({ partida:block.filial, carro:block.carro })) + '</strong>' +
      '<small>' + formatDate(block.dataInicio) + ' até ' + formatDate(block.dataFim) + (block.observacoes ? ' · ' + escapeHTML(block.observacoes) : '') + '</small></div>' +
      '<button type="button" class="delete-btn block-delete-btn" data-id="' + escapeHTML(block.id) + '">Remover</button>' +
    '</div>'
  ).join('') : '<div class="empty-state">Nenhum bloqueio cadastrado.</div>';

  blocksList.querySelectorAll('.block-delete-btn').forEach(btn => {
    btn.addEventListener('click', function(){
      if(!canManageBlocks()) return;
      const id = this.getAttribute('data-id');
      const old = getVehicleBlocks().find(b => String(b.id) === String(id));
      saveVehicleBlocks(getVehicleBlocks().filter(b => String(b.id) !== String(id)));
      logAudit('removeu', 'bloqueio', id, old ? old.tipo + ' · ' + old.filial + ' · ' + old.carro : '');
      renderBlocksManagement();
      refreshDatePickers();
    });
  });
}

if(blockForm){
  blockForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageBlocks()) return;
    const key = document.getElementById('blockVehicle').value;
    const dataInicio = document.getElementById('blockStart').value;
    const dataFim = document.getElementById('blockEnd').value;
    if(!key || !dataInicio || !dataFim || dataFim < dataInicio){
      await showSiteAlert('Selecione o veículo e informe um período válido.', {
        title:'Revise os dados do bloqueio',
        type:'warning'
      });
      return;
    }
    const splitAt = key.lastIndexOf('|');
    const block = {
      id: 'bloqueio-' + Date.now(),
      filial: key.slice(0, splitAt),
      carro: key.slice(splitAt + 1),
      tipo: document.getElementById('blockType').value,
      dataInicio: dataInicio,
      dataFim: dataFim,
      observacoes: document.getElementById('blockNotes').value.trim(),
      criadoEm: new Date().toISOString()
    };
    const reservations = getReservations().filter(r =>
      !isReservationCompleted(r) &&
      r.partida === block.filial && String(r.carro) === String(block.carro) &&
      !(r.dataVolta < dataInicio || r.dataIda > dataFim)
    );
    if(reservations.length && !await showSiteConfirm(
      (reservations.length === 1
        ? 'Existe 1 reserva no período.'
        : 'Existem ' + reservations.length + ' reservas no período.') +
      ' Deseja criar o bloqueio mesmo assim?',
      {
        title:'Reservas no período',
        confirmText:'Criar bloqueio',
        type:'warning'
      }
    )) return;
    const list = getVehicleBlocks();
    list.push(block);
    try{
      await saveVehicleBlocks(list);
    }catch(error){
      await hydrateDatabaseState();
      await showSiteAlert(error.message, {
        title:'Não foi possível criar o bloqueio',
        type:'danger'
      });
      renderBlocksManagement();
      return;
    }
    logAudit('bloqueou', 'veículo', block.id, block.tipo + ' · ' + block.filial + ' · ' + block.carro);
    blockForm.reset();
    renderBlocksManagement();
    refreshDatePickers();
  });
}

