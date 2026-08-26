// Normaliza o status de uma reserva (remove acentos, minúsculas) para
// comparação - usado por server/branch-deletion.js e server/routes/state.js.
function normalizedStatus(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .trim()
    .toLowerCase();
}

module.exports = {
  normalizedStatus
};
