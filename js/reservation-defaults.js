// Valores padrão das regras de reserva, usados como fallback antes de as
// regras configuradas carregarem (cliente) ou quando o registro em
// application_state.rules ainda não existe (servidor). O PostgreSQL
// (reservation_rules / application_state) continua sendo a fonte real das
// regras em uso; este arquivo existe só para não duplicar os mesmos 5
// números em server/validation.js, server/routes/state.js e js/storage.js.
//
// Carregado tanto via <script> no navegador (declara o global abaixo) quanto
// via require() no servidor (module.exports no fim do arquivo).
const DEFAULT_RESERVATION_RULES = {
  maxConsecutiveDays:10,
  maxAdvanceDays:30,
  maxReservationsInWindow:2,
  reservationBufferMinutes:60,
  pickupAdvanceMinutes:15
};

if(typeof module !== 'undefined' && module.exports){
  module.exports = { DEFAULT_RESERVATION_RULES };
}
