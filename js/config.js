/* Configuração e constantes globais */
const STORAGE_KEY = 'capricar_reservas';
const USER_KEY = 'capricar_user';
const USERS_KEY = 'capricar_usuarios';
const USER_DIRECTORY_KEY = 'capricar_diretorio_usuarios';
const BRANCHES_KEY = 'capricar_locais';
const VEHICLES_KEY = 'capricar_veiculos';
const BLOCKS_KEY = 'capricar_bloqueios';
const AUDIT_KEY = 'capricar_auditoria';
const RULES_KEY = 'capricar_regras_reserva';

const CARROS_POR_LOCAL = {
  'São Paulo': ['89','45'],
  'São Carlos': ['78','32'],
  'Bragança Paulista': ['67','54']
};

let CIDADES = Object.keys(CARROS_POR_LOCAL);

const CAPACIDADE_MAXIMA = 5; // vagas totais por carro, incluindo quem reservou

const PEOPLE_ICON_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M2.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '<circle cx="17" cy="8" r="2.6" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M14.8 13.7c2.6.3 4.7 2.5 4.7 5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '</svg>';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

/* Ícones das "Regras Básicas da Viagem" (modal de aceite ao reservar).
   Sem cor fixa - cada .trip-rule-icon define a cor via currentColor,
   mesmo padrão de SITE_DIALOG_ICONS em js/dialogs.js. */
const TRIP_RULE_ICONS = {
  alcohol:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z"></path><path d="M9 12l2 2 4-4"></path></svg>',
  smoking:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M6 13h8v3H6z"></path><path d="M14 13v3"></path><path d="M5.5 5.5l13 13"></path></svg>',
  fuel:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.5 4 6 7.5 6 10.5A6 6 0 0 1 6 13.5C6 10.5 8.5 7 12 3Z"></path></svg>',
  respect:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M8.5 10h.01M15.5 10h.01"></path><path d="M8 14.5c1.2 1.3 2.6 2 4 2s2.8-.7 4-2"></path></svg>',
  seatbelt:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2.2"></circle><path d="M7 20c0-5 2-8 5-9"></path><path d="M17 20c0-5-2-8-5-9"></path><path d="M6.5 8.5l8 9"></path><rect x="12.7" y="16" width="3" height="4" rx="0.8"></rect></svg>'
};

/* Ícones dos tipos de veículo por categoria de CNH (ver js/cnh-categorias.js
   para a regra de qual categoria habilita qual veículo). Mesmo padrão sem
   cor fixa de TRIP_RULE_ICONS acima. */
const CNH_VEICULO_ICONS = {
  moto:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="2.3"></circle><circle cx="18" cy="17" r="2.3"></circle><path d="M6 17l3.5-6h4l1.5 3"></path><path d="M11.5 8h3l1 2"></path><path d="M13.5 11l4.5 6"></path><path d="M9.5 11H7"></path></svg>',
  carro:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="17" r="2"></circle><circle cx="16.5" cy="17" r="2"></circle><path d="M3 17v-3.3c0-.5.3-.9.8-1.1l2.7-1.1 1.7-3A2 2 0 0 1 10 7.5h3.6a2 2 0 0 1 1.7 1l2 3.5h.7a2 2 0 0 1 2 2V17"></path><path d="M3 17h1.5M15 17h5.5M9.5 17h5"></path></svg>',
  caminhao:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="17.5" r="2"></circle><circle cx="17" cy="17.5" r="2"></circle><path d="M2.5 17.5V8h9v9.5"></path><path d="M11.5 11.5h4.5l3.5 3.5v2.5h-2"></path><path d="M4.5 17.5h5M17 17.5h1.5"></path></svg>',
  onibus:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="11.5" rx="2"></rect><path d="M3 11h18"></path><path d="M7 5.5v5.5M12 5.5v5.5M17 5.5v5.5"></path><circle cx="7" cy="19" r="1.6"></circle><circle cx="17" cy="19" r="1.6"></circle></svg>',
  carreta:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="4.5" cy="17.5" r="1.6"></circle><circle cx="11" cy="17.5" r="1.6"></circle><circle cx="19" cy="17.5" r="1.6"></circle><path d="M1 17.5v-4.2h4.5l1.8-3.3h2.7v7.5"></path><path d="M10.5 17.5h11v-5.5h-11"></path></svg>'
};

// CNH_CATEGORIA_INFO vem de js/cnh-categorias.js (carregado à parte porque o
// servidor também usa esse arquivo, sem os ícones). Usa escapeHTML de
// js/utils.js - como as duas são só chamadas depois que a página carrega,
// a ordem dos <script> entre eles não importa.
function cnhCategoriaIconesHTML(categoria){
  const info = CNH_CATEGORIA_INFO[String(categoria || '').trim().toUpperCase()];
  if(!info) return '';
  return info.icones.map(chave =>
    '<span class="cnh-veiculo-icon">' + (CNH_VEICULO_ICONS[chave] || '') + '</span>'
  ).join('');
}

function cnhCategoriaPreviewHTML(categoria){
  const info = CNH_CATEGORIA_INFO[String(categoria || '').trim().toUpperCase()];
  if(!info) return '';
  return '<div class="cnh-categoria-preview">' + cnhCategoriaIconesHTML(categoria) +
    '<span>' + escapeHTML(info.veiculos) + '</span></div>';
}

function cnhCategoriaLegendHTML(){
  return '<div class="cnh-categoria-legend">' +
    Object.keys(CNH_CATEGORIA_INFO).map(categoria => {
      const info = CNH_CATEGORIA_INFO[categoria];
      return '<div class="cnh-categoria-card">' +
        '<div class="cnh-categoria-card-head">' +
          '<span class="cnh-categoria-code">' + escapeHTML(categoria) + '</span>' +
          cnhCategoriaIconesHTML(categoria) +
        '</div>' +
        '<p>' + escapeHTML(info.veiculos) + '</p>' +
      '</div>';
    }).join('') +
  '</div>';
}
