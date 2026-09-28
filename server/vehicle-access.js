// A regra de acesso a veículos restritos por grupo é compartilhada com o
// navegador - ver js/vehicle-access.js.
const shared = require('../js/vehicle-access');

module.exports = {
  ...shared,
  vehicleKey:shared.vehicleAccessKey
};
