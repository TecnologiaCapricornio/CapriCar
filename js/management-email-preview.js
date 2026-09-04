/* =========================================================
   Pré-visualização dos e-mails de lembrete

   O corpo do e-mail é HTML cru numa textarea, então não dava para ver o
   efeito de uma alteração sem enviar o e-mail de verdade. Aqui o HTML é
   renderizado num <iframe> isolado, com os tokens já substituídos por
   dados de exemplo - ou seja, o e-mail como ele chega.

   Duas escolhas que importam:

   - <iframe sandbox> em vez de innerHTML na própria página: o HTML de
     e-mail traz tabela, fundo e fontes próprios, que brigariam com o CSS
     do portal e dariam uma previsão enganosa. O sandbox ainda impede que
     qualquer <script> coespaço no template rode no portal.

   - Renderiza o conteúdo ATUAL da textarea, não o valor salvo: o objetivo
     é justamente conferir a alteração antes de salvar.
   ========================================================= */

const emailPreviewModal = document.getElementById('emailPreviewModal');
const emailPreviewTitle = document.getElementById('emailPreviewTitle');
const emailPreviewSubject = document.getElementById('emailPreviewSubject');
const emailPreviewFrame = document.getElementById('emailPreviewFrame');
const emailPreviewCloseBtn = document.getElementById('emailPreviewCloseBtn');
const emailPreviewWidthBtns = document.querySelectorAll('[data-preview-width]');

// Rótulo legível de cada tipo, para o título da janela.
const REMINDER_LABELS = {
  reservationUpcoming:'Lembrete de reserva próxima',
  pickupOverdue:'Lembrete de retirada pendente',
  returnOverdue:'Lembrete de devolução pendente',
  passengerJoined:'Aviso ao motorista de passageiro na carona',
  rideWatchMatch:'Aviso de carona monitorada disponível',
  cnhExpiring:'Aviso de CNH vencendo ou vencida',
  maintenanceDue:'Aviso de manutenção da frota próxima',
  passengerRemoved:'Aviso a quem foi removido de uma carona',
  passengerLeft:'Aviso ao motorista quando alguém sai da carona'
};

// Réplica do badge de placa dos e-mails (server/reminders.js:
// plateBadgeEmailHTML). Duplicado de propósito: o portal não importa do
// servidor, e o token precisa render igual na prévia e no envio real.
function previewPlateBadge(placa){
  const value = String(placa || '').trim().toUpperCase();
  if(!value) return '';
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:88px;' +
      'background-color:#ffffff;border:1.5px solid #1a1a1a;border-radius:6px;">' +
    '<tr><td style="height:7px;background-color:#003699;border-radius:4px 4px 0 0;' +
      'font-size:1px;line-height:7px;">&nbsp;</td></tr>' +
    '<tr><td style="padding:4px 0 5px 0;text-align:center;' +
      'font-family:\'Arial Narrow\',Arial,Helvetica,sans-serif;font-weight:800;' +
      'font-size:14px;letter-spacing:1.2px;color:#1a1a1a;">' + value + '</td></tr>' +
    '</table>';
}

// Réplica de blocoMotivoHTML (server/reminders.js) para a prévia mostrar a
// citação da mensagem exatamente como ela sai no e-mail.
function previewMotivoBloco(motivo, autor){
  const texto = String(motivo || '').trim();
  if(!texto) return '';
  return '<tr><td style="padding:18px 32px 0 32px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="background-color:#f7f9fb;border-left:3px solid #c2cedb;' +
        'border-radius:4px;padding:14px 16px;">' +
        '<div style="font-size:12px;color:#8a95a3;margin-bottom:6px;">Mensagem de ' +
          escapeHTML(autor) + '</div>' +
        '<div style="font-size:14px;color:#3c4753;line-height:1.55;">' +
          escapeHTML(texto) + '</div>' +
      '</td>' +
    '</tr></table></td></tr>';
}

// Dados de exemplo cobrindo todos os tokens de todos os tipos. Um só
// conjunto: assim a prévia mostra os tokens de outro tipo como texto
// literal, deixando visível quando um token foi usado no template errado.
const PREVIEW_TOKENS = {
  nome:'Renan Guedes',
  numeroReserva:'1042',
  origem:'São Paulo',
  destino:'São Carlos',
  dataIda:'02/09/2026',
  horarioRetirada:'08:00',
  dataVolta:'03/09/2026',
  horarioDevolucao:'17:30',
  veiculo:'Volkswagen Polo',
  placaBadge:previewPlateBadge('GJF5D45'),
  passageiros:'Ana Souza, Carlos Lima',
  mensagem:'Sua CNH vence em 30 dias. Providencie a renovação.',
  situacaoCurta:'está próxima do vencimento',
  validade:'30/09/2026',
  categoria:'AB',
  diasRestantes:'30',
  outraParte:'Renan Guedes',
  motivo:'Preciso do lugar para levar equipamento.',
  blocoMotivo:previewMotivoBloco('Preciso do lugar para levar equipamento.', 'Renan Guedes'),
  tipoManutencao:'Troca de óleo',
  proximaKm:'50.000',
  proximaData:'15/09/2026'
};

// Mesma substituição de server/reminders.js:renderTemplate - token
// desconhecido fica visível como {{token}} em vez de sumir, que é o que
// permite flagrar um nome digitado errado.
function renderPreviewTemplate(template){
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(PREVIEW_TOKENS, key) ? String(PREVIEW_TOKENS[key]) : match
  );
}

function setPreviewWidth(largura){
  if(!emailPreviewFrame) return;
  emailPreviewFrame.style.width = largura === 'mobile' ? '390px' : '100%';
  emailPreviewWidthBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-preview-width') === largura);
  });
}

function openEmailPreview(tipo){
  const campos = REMINDER_FIELDS[tipo];
  if(!campos || !emailPreviewModal) return;

  emailPreviewTitle.textContent = REMINDER_LABELS[tipo] || 'Pré-visualização';

  const assunto = renderPreviewTemplate(campos.subject.value);
  emailPreviewSubject.textContent = assunto || '(assunto em branco)';

  const corpo = renderPreviewTemplate(campos.body.value.trim());
  const documento = corpo
    ? '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '</head><body style="margin:0;">' + corpo + '</body></html>'
    : '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head>' +
      '<body style="margin:0;font-family:Arial,sans-serif;color:#6b7280;padding:28px;">' +
      'O corpo deste e-mail está em branco.</body></html>';

  // Atribuir por propriedade (e não montar o atributo srcdoc como string)
  // evita ter que escapar aspas do HTML do template.
  emailPreviewFrame.srcdoc = documento;

  setPreviewWidth('desktop');
  emailPreviewModal.classList.remove('hidden');
}

function closeEmailPreview(){
  if(!emailPreviewModal) return;
  emailPreviewModal.classList.add('hidden');
  // Descarrega o conteúdo para não deixar o iframe ativo em segundo plano.
  emailPreviewFrame.srcdoc = '';
}

// Cria um botão "Visualizar" para cada tipo declarado em REMINDER_FIELDS.
// Gerar a partir do mapa (em vez de repetir markup no index.html) faz um
// tipo novo ganhar o botão sozinho.
function setupEmailPreviewButtons(){
  if(typeof REMINDER_FIELDS === 'undefined') return;
  Object.keys(REMINDER_FIELDS).forEach(tipo => {
    const campos = REMINDER_FIELDS[tipo];
    if(!campos || !campos.body || campos.body.dataset.previewReady) return;

    const acoes = document.createElement('div');
    acoes.className = 'email-preview-actions';

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'secondary-btn email-preview-btn';
    botao.textContent = 'Visualizar e-mail';
    botao.addEventListener('click', () => openEmailPreview(tipo));

    acoes.appendChild(botao);
    campos.body.insertAdjacentElement('afterend', acoes);
    campos.body.dataset.previewReady = '1';
  });
}

if(emailPreviewCloseBtn){
  emailPreviewCloseBtn.addEventListener('click', closeEmailPreview);
}

if(emailPreviewModal){
  emailPreviewModal.addEventListener('click', function(event){
    if(event.target === emailPreviewModal) closeEmailPreview();
  });
}

emailPreviewWidthBtns.forEach(btn => {
  btn.addEventListener('click', function(){
    setPreviewWidth(this.getAttribute('data-preview-width'));
  });
});

document.addEventListener('keydown', function(event){
  if(event.key === 'Escape' && emailPreviewModal && !emailPreviewModal.classList.contains('hidden')){
    closeEmailPreview();
  }
});
