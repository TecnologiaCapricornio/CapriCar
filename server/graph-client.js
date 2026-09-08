const { getGraphAppToken } = require('./sso');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Ponto único de chamada ao Microsoft Graph (fluxo app-only, via
// getGraphAppToken em server/sso.js) - usado tanto pela sincronização de
// calendário (server/calendar-sync.js) quanto pelo envio de e-mail via
// Microsoft 365 (server/mailer.js), para não duplicar autenticação e
// tratamento de erro entre os dois.
async function graphRequest(method, path, body){
  const token = await getGraphAppToken();
  const response = await fetch(GRAPH_BASE + path, {
    method,
    headers:{
      Authorization:'Bearer ' + token,
      'Content-Type':'application/json'
    },
    body:body ? JSON.stringify(body) : undefined
  });
  if(response.status === 404) return null;
  if(!response.ok){
    const text = await response.text().catch(() => '');
    throw new Error('Microsoft Graph respondeu ' + response.status + ': ' + text.slice(0, 300));
  }
  // sendMail devolve 202 sem corpo; DELETE devolve 204 - nenhum dos dois tem
  // JSON para ler.
  if(response.status === 202 || response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

module.exports = { graphRequest, GRAPH_BASE };
