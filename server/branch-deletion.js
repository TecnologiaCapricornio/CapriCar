function normalizedStatus(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getBranchDeletionBlockers(branch, vehicles, reservations){
  const branchName = String(branch && branch.nome || '');
  const linkedVehicles = (vehicles || []).filter(vehicle =>
    String(vehicle && vehicle.filial || '') === branchName
  );
  const activeReservations = (reservations || []).filter(reservation => {
    if(
      String(reservation && reservation.partida || '') !== branchName &&
      String(reservation && reservation.destino || '') !== branchName
    ) return false;
    const status = normalizedStatus(reservation && reservation.status);
    const completed = !!(reservation && reservation.operacao && reservation.operacao.devolucao);
    return !completed && !['concluida', 'cancelada', 'encerrada_administrativamente'].includes(status);
  });
  return { linkedVehicles, activeReservations };
}

module.exports = { getBranchDeletionBlockers };
