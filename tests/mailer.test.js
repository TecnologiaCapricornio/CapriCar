const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGraphMailPayload } = require('../server/mailer');

test('buildGraphMailPayload monta o corpo esperado pelo endpoint sendMail do Graph', () => {
  const payload = buildGraphMailPayload({
    to:'destinatario@empresa.com',
    subject:'Assunto de teste',
    html:'<p>Corpo</p>'
  });
  assert.deepEqual(payload, {
    message:{
      subject:'Assunto de teste',
      body:{ contentType:'HTML', content:'<p>Corpo</p>' },
      toRecipients:[{ emailAddress:{ address:'destinatario@empresa.com' } }]
    },
    saveToSentItems:false
  });
});

test('buildGraphMailPayload não copia a mensagem para "Itens Enviados" da caixa usada', () => {
  const payload = buildGraphMailPayload({ to:'a@b.com', subject:'x', html:'y' });
  assert.equal(payload.saveToSentItems, false);
});
