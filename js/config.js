/* Configuração e constantes globais */
const STORAGE_KEY = 'capricar_reservas';
const USER_KEY = 'capricar_user';

const CARROS_POR_FILIAL = {
  'São Paulo': ['89','45'],
  'São Carlos': ['78','32'],
  'Bragança Paulista': ['67','54']
};

const CIDADES = Object.keys(CARROS_POR_FILIAL);

const CAPACIDADE_MAXIMA = 5; // vagas totais por carro, incluindo quem reservou

const PEOPLE_ICON_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M2.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '<circle cx="17" cy="8" r="2.6" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M14.8 13.7c2.6.3 4.7 2.5 4.7 5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '</svg>';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
