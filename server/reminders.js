const { query, withTransaction } = require('./db');
const { listAllReservations } = require('./reservations-store');
const { sendMail } = require('./mailer');
const { resolveVehicle } = require('./calendar-sync');
const {
  reservationStart,
  reservationEnd,
  reservationIsCompleted,
  resolveReservationUsers,
  ensureNotificationsTable,
  insertNotification
} = require('./notifications');
const {
  licenseStatus,
  licenseStatusMessage,
  todayISO,
  toISODate
} = require('./driver-licenses');

// Data ISO (YYYY-MM-DD ou Date do pg) no formato brasileiro, para os e-mails.
function formatDateBR(value){
  const iso = String(value && value.toISOString ? value.toISOString() : value).slice(0, 10);
  const [ano, mes, dia] = iso.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

// Mesmo visual do badge de placa do portal (js/utils.js:plateBadgeHTML,
// css/components.css .plate-badge) mas remontado com tabela e estilos
// inline - e-mails (sobretudo o Outlook) não aplicam classes de CSS externo,
// só tabelas e `style=""` funcionam de forma confiável. Um pouco maior que
// a versão do portal para facilitar a leitura num e-mail, mas compacto o
// bastante para ficar ao lado do nome do veículo na mesma linha.
function plateBadgeEmailHTML(placa){
  const value = String(placa || '').trim();
  if(!value) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:88px;background-color:#ffffff;border:1.5px solid #1a1a1a;border-radius:6px;">
    <tr><td style="height:7px;background-color:#003699;border-radius:4px 4px 0 0;font-size:1px;line-height:7px;">&nbsp;</td></tr>
    <tr><td style="padding:4px 0 5px 0;text-align:center;font-family:'Arial Narrow',Arial,Helvetica,sans-serif;font-weight:800;font-size:14px;letter-spacing:1.2px;color:#1a1a1a;">${value.toUpperCase()}</td></tr>
  </table>`;
}

const REMINDER_TYPES = {
  reservationUpcoming:{ dedupePrefix:'email:upcoming' },
  pickupOverdue:{ dedupePrefix:'email:pickup-overdue' },
  returnOverdue:{ dedupePrefix:'email:return-overdue' }
};

// Marcos de aviso de vencimento da CNH, em dias restantes.
// O aviso sai UMA vez por marco cruzado - não todo dia. Um e-mail diário
// durante toda a janela seria dezenas de mensagens iguais por pessoa, que é
// a receita para o aviso virar ruído e ser filtrado.
//
// Só estes três marcos, mais um único aviso depois de vencida. Como não há
// marco acima de 30, uma CNH a 45 dias do vencimento não gera aviso - ela
// aparece com o estado "vencendo" no portal (a janela de exibição é de 60
// dias, ver DEFAULT_WARNING_DAYS), mas notificação e e-mail só a partir de 30.
// Faltando 0 dias cai no marco 1, que já foi avisado no dia anterior.
const CNH_MILESTONES = [1, 15, 30];

// Marco a que um determinado "faltam N dias" pertence: o menor marco que
// ainda é >= N. Assim 45 dias e 60 dias caem no mesmo marco (60) e só geram
// um aviso; ao chegar em 30 o marco muda e um novo aviso sai.
function cnhMilestoneFor(diasRestantes){
  if(diasRestantes < 0) return 'vencida';
  const marco = CNH_MILESTONES.find(m => m >= diasRestantes);
  return marco === undefined ? null : String(marco);
}

/* =========================================================
   Lembretes de manutenção (troca de óleo, pneus etc.)

   Cada lembrete tem até duas "pernas" independentes - uma por
   quilometragem, outra por data - e dispara pelo que vencer primeiro.
   O km só é conhecido quando o veículo já tem alguma devolução registrada
   com odômetro (ver latestOdometerReading); sem isso, essa perna fica de
   fora e só a data (se cadastrada) é avaliada.
   ========================================================= */
const MAINTENANCE_KM_MILESTONES = [200, 500, 1000];
const MAINTENANCE_DATE_MILESTONES = [3, 7, 15];

const MAINTENANCE_TYPE_LABELS = {
  oleo:'Troca de óleo',
  pneus:'Troca de pneus',
  revisao:'Revisão'
};

function maintenanceReminderLabel(reminder){
  return MAINTENANCE_TYPE_LABELS[reminder && reminder.tipo] ||
    String(reminder && reminder.descricao || 'Manutenção').trim();
}

// Mesma lógica de "menor marco que ainda cobre o restante" de
// cnhMilestoneFor, generalizada para km e dias ao mesmo tempo (o valor de
// `remaining` já vem no sinal certo: negativo/zero = vencido).
function maintenanceMilestoneFor(remaining, milestones){
  if(remaining == null) return null;
  if(remaining <= 0) return 'vencido';
  const marco = milestones.find(m => m >= remaining);
  return marco === undefined ? null : String(marco);
}

function utcMidnightISODate(iso){
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function daysRemaining(targetISO, todayISODate){
  return Math.round((utcMidnightISODate(targetISO) - utcMidnightISODate(todayISODate)) / 86400000);
}

// Maior leitura de odômetro já registrada numa devolução deste veículo -
// mesmo critério do motor de recomendação (js/vehicle-recommendation.js:
// vehicleRecommendationStats): não soma as viagens, usa a leitura mais
// recente, que já é cumulativa. Sem nenhuma devolução com odômetro
// registrada ainda (veículo novo, por exemplo), devolve null.
function latestOdometerReading(local, carro, reservations){
  let km = null;
  let registradoEm = null;
  (reservations || []).forEach(reservation => {
    if(reservation.partida !== local || String(reservation.carro) !== String(carro)) return;
    const devolucao = reservation.operacao && reservation.operacao.devolucao;
    if(!devolucao || !devolucao.registradoEm || !Number.isFinite(Number(devolucao.quilometragem))) return;
    const data = new Date(devolucao.registradoEm);
    if(isNaN(data.getTime())) return;
    if(!registradoEm || data > registradoEm){
      registradoEm = data;
      km = Number(devolucao.quilometragem);
    }
  });
  return km;
}

// Estado de um lembrete de manutenção numa referência (km atual do veículo,
// se conhecido, e a data de hoje). `status.km`/`status.data` só existem
// quando o lembrete tem essa perna cadastrada E ela é avaliável (km exige
// leitura de odômetro conhecida).
function maintenanceReminderStatus(reminder, currentKm, todayISODate){
  const status = { km:null, data:null };
  if(reminder.proximaKm != null && currentKm != null){
    const restante = Number(reminder.proximaKm) - Number(currentKm);
    status.km = { restante, marco:maintenanceMilestoneFor(restante, MAINTENANCE_KM_MILESTONES) };
  }
  if(reminder.proximaData){
    const restante = daysRemaining(reminder.proximaData, todayISODate);
    status.data = { restante, marco:maintenanceMilestoneFor(restante, MAINTENANCE_DATE_MILESTONES) };
  }
  return status;
}

// Texto único cobrindo as duas pernas quando aplicável - evita mandar dois
// avisos separados (km e data) no mesmo dia para o mesmo lembrete.
function maintenanceStatusMessage(reminder, status, veiculoNome){
  const label = maintenanceReminderLabel(reminder);
  const partes = [];
  if(status.km){
    partes.push(status.km.restante <= 0
      ? `${Math.abs(status.km.restante)} km além do previsto`
      : `faltam ${status.km.restante} km`);
  }
  if(status.data){
    if(status.data.restante < 0) partes.push(`${Math.abs(status.data.restante)} dia(s) atrasada`);
    else if(status.data.restante === 0) partes.push('vence hoje');
    else partes.push(`faltam ${status.data.restante} dia(s)`);
  }
  const vencido = (status.km && status.km.restante <= 0) || (status.data && status.data.restante <= 0);
  const veiculo = veiculoNome || 'veículo';
  return `${label} do ${veiculo} ${vencido ? 'venceu' : 'está próxima'}${partes.length ? ' — ' + partes.join(' · ') : ''}.`;
}

const DEFAULT_TEMPLATES = {
  reservationUpcoming:{
    enabled:false,
    subject:'🚗 CapriCar - Sua reserva #{{numeroReserva}} começa em breve',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#eaf2fb;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#d3e6f8;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">🚗</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#2c5073;font-size:18px;font-weight:700;">Sua reserva está chegando</div>
            <div style="color:#6488a8;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0;font-size:15px;color:#3c4753;">Olá, <strong>{{nome}}</strong>! Passando para lembrar que sua reserva começa em menos de 24 horas.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6ebf1;border-radius:8px;">
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;width:38%;">Reserva</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#2c5073;font-weight:700;">#{{numeroReserva}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Trajeto</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#3c4753;">{{origem}} → {{destino}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Veículo</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;font-size:14px;color:#3c4753;padding-right:10px;">{{veiculo}}</td>
                <td style="vertical-align:middle;">{{placaBadge}}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;">Retirada</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;">{{dataIda}} às {{horarioRetirada}}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#f5f9fd;border-left:3px solid #a7c6e3;border-radius:4px;padding:12px 16px;font-size:13px;color:#3c6182;">
            💡 Assim que pegar o veículo, não esqueça de registrar a retirada no CapriCar.
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Lembrete automático do CapriCar. Se a reserva já foi concluída ou cancelada, pode ignorar esta mensagem.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  },
  pickupOverdue:{
    enabled:false,
    subject:'🔑 CapriCar - Retirada pendente — reserva #{{numeroReserva}}',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#fdf4e3;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#f8e4b8;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">🔑</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#8a5f14;font-size:18px;font-weight:700;">Retirada pendente</div>
            <div style="color:#ab8447;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0;font-size:15px;color:#3c4753;">Olá, <strong>{{nome}}</strong>. O horário previsto para a retirada do veículo já passou e o registro ainda não foi feito.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6ebf1;border-radius:8px;">
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;width:38%;">Reserva</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#8a5f14;font-weight:700;">#{{numeroReserva}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Trajeto</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#3c4753;">{{origem}} → {{destino}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Veículo</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;font-size:14px;color:#3c4753;padding-right:10px;">{{veiculo}}</td>
                <td style="vertical-align:middle;">{{placaBadge}}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;">Retirada prevista</td>
            <td style="padding:13px 18px;font-size:14px;color:#8a5f14;font-weight:700;">{{dataIda}} às {{horarioRetirada}}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#fdf6e9;border-left:3px solid #e0bd76;border-radius:4px;padding:12px 16px;font-size:13px;color:#8a5f14;">
            ⚠️ <strong>Ação necessária:</strong> acesse o CapriCar e registre a retirada assim que possível.
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Lembrete automático do CapriCar. Se a retirada já foi registrada, pode ignorar esta mensagem.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  },
  returnOverdue:{
    enabled:false,
    subject:'⏰ CapriCar - Devolução pendente — reserva #{{numeroReserva}}',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#fdedef;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#f8ccd2;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">⏰</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#9c3347;font-size:18px;font-weight:700;">Devolução pendente</div>
            <div style="color:#bd7481;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0;font-size:15px;color:#3c4753;">Olá, <strong>{{nome}}</strong>. O horário previsto para a devolução do veículo já passou e o registro ainda não foi feito.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6ebf1;border-radius:8px;">
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;width:38%;">Reserva</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#9c3347;font-weight:700;">#{{numeroReserva}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Trajeto</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#3c4753;">{{origem}} → {{destino}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Veículo</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;font-size:14px;color:#3c4753;padding-right:10px;">{{veiculo}}</td>
                <td style="vertical-align:middle;">{{placaBadge}}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;">Devolução prevista</td>
            <td style="padding:13px 18px;font-size:14px;color:#9c3347;font-weight:700;">{{dataVolta}} às {{horarioDevolucao}}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#fdf2f3;border-left:3px solid #e2a3ac;border-radius:4px;padding:12px 16px;font-size:13px;color:#9c3347;">
            🔴 <strong>Ação necessária:</strong> registre a devolução no CapriCar o quanto antes — o veículo pode estar reservado para outra pessoa.
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Lembrete automático do CapriCar. Se a devolução já foi registrada, pode ignorar esta mensagem.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  },
  passengerJoined:{
    enabled:false,
    subject:'👥 CapriCar - {{passageiros}} entrou na sua carona — reserva #{{numeroReserva}}',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#eafaf1;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#c9f0da;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">👥</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#1a7a4c;font-size:18px;font-weight:700;">Alguém entrou na sua carona!</div>
            <div style="color:#5da583;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0;font-size:15px;color:#3c4753;">Olá, <strong>{{nome}}</strong>! <strong>{{passageiros}}</strong> confirmou presença na sua reserva.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6ebf1;border-radius:8px;">
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;width:38%;">Reserva</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#1a7a4c;font-weight:700;">#{{numeroReserva}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Trajeto</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#3c4753;">{{origem}} → {{destino}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Veículo</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;font-size:14px;color:#3c4753;padding-right:10px;">{{veiculo}}</td>
                <td style="vertical-align:middle;">{{placaBadge}}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;">Retirada</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;">{{dataIda}} às {{horarioRetirada}}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#f0f7fd;border-left:3px solid #4098e0;border-radius:4px;padding:12px 16px;font-size:13px;color:#245987;">
            ℹ️ Combine os detalhes com quem vai junto e lembre-se de respeitar os horários combinados na
            reserva — seus passageiros estão contando com isso.
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Aviso automático do CapriCar sobre a sua reserva.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  },
  rideWatchMatch:{
    enabled:false,
    subject:'🚗 CapriCar - Uma carona que você monitora apareceu — {{origem}} → {{destino}}',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#eaf2fb;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#d3e6f8;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">🚗</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#2c5073;font-size:18px;font-weight:700;">Uma carona que você monitora apareceu!</div>
            <div style="color:#6488a8;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0;font-size:15px;color:#3c4753;">Olá, <strong>{{nome}}</strong>! Uma reserva nova batendo com o
          que você monitora acabou de ser criada e tem vaga disponível.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6ebf1;border-radius:8px;">
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;width:38%;">Reserva</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#2c5073;font-weight:700;">#{{numeroReserva}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Trajeto</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:14px;color:#3c4753;">{{origem}} → {{destino}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;font-size:13px;color:#8a95a3;">Veículo</td>
            <td style="padding:13px 18px;border-bottom:1px solid #f0f3f6;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;font-size:14px;color:#3c4753;padding-right:10px;">{{veiculo}}</td>
                <td style="vertical-align:middle;">{{placaBadge}}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;">Retirada</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;">{{dataIda}} às {{horarioRetirada}}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#f5f9fd;border-left:3px solid #a7c6e3;border-radius:4px;padding:12px 16px;font-size:13px;color:#3c6182;">
            💡 Acesse "Caronas Disponíveis" no CapriCar para entrar nessa carona antes que as vagas acabem.
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Você está recebendo isso porque monitora essa rota no CapriCar.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  },
  cnhExpiring:{
    enabled:false,
    subject:'🪪 CapriCar - Sua CNH {{situacaoCurta}} — renove para continuar dirigindo',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#fdf3e3;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#f7e3c1;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">🪪</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#8a5a00;font-size:18px;font-weight:700;">Sua CNH {{situacaoCurta}}</div>
            <div style="color:#a9843c;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#3c4753;line-height:1.55;">Olá, {{nome}}. {{mensagem}}</p>
      </td></tr>
      <tr><td style="padding:0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f5;border-radius:8px;">
          <tr style="background-color:#fbfcfd;">
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;">Validade</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;">{{validade}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;border-top:1px solid #eef1f5;">Categoria</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;border-top:1px solid #eef1f5;">{{categoria}}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#fdf6ea;border-left:3px solid #e0b464;border-radius:4px;padding:12px 16px;font-size:13px;color:#7a5a1f;">
            💡 Atualize os dados e as fotos da CNH em "Meu perfil" no CapriCar. Sem CNH válida não é possível reservar veículo como motorista — mas você continua podendo entrar em caronas como passageiro.
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Você está recebendo isso porque tem uma CNH cadastrada no CapriCar.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  },
  maintenanceDue:{
    enabled:false,
    subject:'🔧 CapriCar - {{tipoManutencao}} próxima — {{veiculo}}',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#fdf3e3;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#f7e3c1;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">🔧</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#8a5a00;font-size:18px;font-weight:700;">{{tipoManutencao}} próxima</div>
            <div style="color:#a9843c;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#3c4753;line-height:1.55;">Olá, {{nome}}. {{mensagem}}</p>
      </td></tr>
      <tr><td style="padding:0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f5;border-radius:8px;">
          <tr style="background-color:#fbfcfd;">
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;width:38%;">Veículo</td>
            <td style="padding:13px 18px;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;font-size:14px;color:#3c4753;font-weight:600;padding-right:10px;">{{veiculo}}</td>
                <td style="vertical-align:middle;">{{placaBadge}}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;border-top:1px solid #eef1f5;">Próxima troca (km)</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;border-top:1px solid #eef1f5;">{{proximaKm}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;border-top:1px solid #eef1f5;">Próxima troca (data)</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;border-top:1px solid #eef1f5;">{{proximaData}}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#fdf6ea;border-left:3px solid #e0b464;border-radius:4px;padding:12px 16px;font-size:13px;color:#7a5a1f;">
            💡 Atualize o lembrete em Painel de Administração &gt; Manutenção assim que o serviço for feito.
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Você está recebendo isso porque tem permissão de frota no CapriCar.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  },
  passengerRemoved:{
    enabled:false,
    subject:'🚫 CapriCar - {{outraParte}} removeu você da carona {{origem}} → {{destino}}',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#fdf0f1;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#f5d7da;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">🚫</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#a3323f;font-size:18px;font-weight:700;">Você saiu de uma carona</div>
            <div style="color:#b9737c;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#3c4753;line-height:1.55;">Olá, {{nome}}. {{outraParte}} removeu você desta carona. A reserva continua existindo, mas sem você na lista de passageiros.</p>
      </td></tr>
      <tr><td style="padding:0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f5;border-radius:8px;">
          <tr style="background-color:#fbfcfd;">
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;width:38%;">Trajeto</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;">{{origem}} → {{destino}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;border-top:1px solid #eef1f5;">Saída</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;border-top:1px solid #eef1f5;">{{dataIda}} às {{horarioRetirada}}</td>
          </tr>
        </table>
      </td></tr>
      {{blocoMotivo}}
      <tr><td style="padding:18px 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#f5f9fd;border-left:3px solid #a7c6e3;border-radius:4px;padding:12px 16px;font-size:13px;color:#3c6182;">
            💡 Precisa dessa viagem? Veja em "Caronas Disponíveis" se há outra reserva no mesmo trajeto, ou monitore a rota para ser avisado quando surgir uma.
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Você está recebendo isso porque estava nesta carona no CapriCar.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  },
  passengerLeft:{
    enabled:false,
    subject:'🚶 CapriCar - {{outraParte}} saiu da sua carona {{origem}} → {{destino}}',
    body:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5f9;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e6ebf1;">
      <tr><td style="background-color:#eef4fb;padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:52px;height:52px;background-color:#d9e6f5;border-radius:26px;text-align:center;font-size:24px;line-height:52px;">🚶</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="color:#2c5073;font-size:18px;font-weight:700;">Alguém saiu da sua carona</div>
            <div style="color:#6488a8;font-size:12px;margin-top:2px;">CapriCar</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 8px 32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#3c4753;line-height:1.55;">Olá, {{nome}}. {{outraParte}} saiu desta carona, e a vaga voltou a ficar disponível para outra pessoa.</p>
      </td></tr>
      <tr><td style="padding:0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f5;border-radius:8px;">
          <tr style="background-color:#fbfcfd;">
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;width:38%;">Trajeto</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;">{{origem}} → {{destino}}</td>
          </tr>
          <tr>
            <td style="padding:13px 18px;font-size:13px;color:#8a95a3;border-top:1px solid #eef1f5;">Saída</td>
            <td style="padding:13px 18px;font-size:14px;color:#3c4753;font-weight:600;border-top:1px solid #eef1f5;">{{dataIda}} às {{horarioRetirada}}</td>
          </tr>
        </table>
      </td></tr>
      {{blocoMotivo}}
      <tr><td style="background-color:#fafbfc;padding:16px 32px;border-top:1px solid #f0f3f6;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:12px;color:#a7b0bc;">Você está recebendo isso porque é o motorista desta carona no CapriCar.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`
  }
};

async function getEmailReminderSettings(){
  const result = await query("SELECT value FROM application_state WHERE collection_name = 'emailReminders'");
  const stored = (result.rows[0] && result.rows[0].value) || {};
  const settings = {};
  for(const key of Object.keys(DEFAULT_TEMPLATES)){
    settings[key] = { ...DEFAULT_TEMPLATES[key], ...(stored[key] || {}) };
  }
  return settings;
}

function renderTemplate(template, tokens){
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? String(tokens[key]) : match
  );
}

function reservationTokens(reservation, vehicle){
  const veiculo = vehicle
    ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() || 'Veículo'
    : (reservation.carro || 'Veículo');
  return {
    numeroReserva:reservation.numeroReserva || reservation.id,
    origem:reservation.partida || '',
    destino:reservation.destino || '',
    dataIda:reservation.dataIda || '',
    horarioRetirada:reservation.horarioRetirada || '',
    dataVolta:reservation.dataVolta || '',
    horarioDevolucao:reservation.horarioDevolucao || '',
    veiculo,
    placaBadge:plateBadgeEmailHTML(vehicle && vehicle.plate)
  };
}

// Espelha reminderTypesForReservation (notifications.js), mas centrado na
// reserva (varre todos os usuarios, nao um so sob demanda) e adiciona o
// tipo de devolucao pendente, que nao existe no canal de notificacoes
// internas do sininho.
function pendingReminders(reservation, now){
  if(reservationIsCompleted(reservation)) return [];
  const startsAt = reservationStart(reservation);
  const endsAt = reservationEnd(reservation);
  const pickupDone = !!(reservation.operacao && reservation.operacao.retirada);
  const returnDone = !!(reservation.operacao && reservation.operacao.devolucao);
  const types = [];
  if(startsAt != null){
    const remaining = startsAt - now;
    if(remaining > 0 && remaining <= 24 * 60 * 60 * 1000){
      types.push({ type:'reservationUpcoming', creatorOnly:false });
    }
    if(remaining <= 0 && !pickupDone){
      types.push({ type:'pickupOverdue', creatorOnly:true });
    }
  }
  if(endsAt != null){
    const remainingReturn = endsAt - now;
    if(remainingReturn <= 0 && pickupDone && !returnDone){
      types.push({ type:'returnOverdue', creatorOnly:true });
    }
  }
  return types;
}

async function alreadySent(userId, dedupeKey){
  const result = await query(
    "SELECT 1 FROM email_reminder_log WHERE user_id = $1 AND dedupe_key = $2 AND status = 'sent'",
    [userId, dedupeKey]
  );
  return result.rowCount > 0;
}

async function recordOutcome(userId, reminderType, reservationId, dedupeKey, status, error){
  await query(
    `INSERT INTO email_reminder_log (user_id, reminder_type, reservation_id, dedupe_key, status, error)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, dedupe_key) DO UPDATE
       SET status = EXCLUDED.status, error = EXCLUDED.error, sent_at = NOW()`,
    [userId, reminderType, reservationId, dedupeKey, status, error || null]
  );
}

async function sweepEmailReminders(){
  const settings = await getEmailReminderSettings();
  const anyEnabled = Object.values(settings).some(item => item.enabled);
  const summary = { scanned:0, sent:0, skipped:0, failed:0 };
  if(!anyEnabled) return summary;

  const reservations = await listAllReservations();
  const now = Date.now();

  for(const reservation of reservations){
    const pending = pendingReminders(reservation, now);
    if(!pending.length) continue;
    summary.scanned++;

    const vehicle = await resolveVehicle(reservation.carro, reservation.partida);
    const tokens = reservationTokens(reservation, vehicle);

    for(const item of pending){
      const config = settings[item.type];
      if(!config.enabled){ summary.skipped++; continue; }

      const recipientIds = await resolveReservationUsers({ query }, reservation, true);
      const targets = item.creatorOnly
        ? recipientIds.filter(id => String(id) === String(reservation.criadorUsuarioId))
        : recipientIds;
      if(!targets.length){ summary.skipped++; continue; }

      const usersResult = await query(
        'SELECT id, email, display_name FROM users WHERE id = ANY($1::uuid[])',
        [targets]
      );

      for(const user of usersResult.rows){
        if(!user.email){ summary.skipped++; continue; }

        const dedupeKey = `${REMINDER_TYPES[item.type].dedupePrefix}:${reservation.id}`;
        if(await alreadySent(user.id, dedupeKey)){ summary.skipped++; continue; }

        const subject = renderTemplate(config.subject, { ...tokens, nome:user.display_name });
        const html = renderTemplate(config.body, { ...tokens, nome:user.display_name });

        try{
          await sendMail({ to:user.email, subject, html });
          await recordOutcome(user.id, item.type, String(reservation.id), dedupeKey, 'sent', null);
          summary.sent++;
        }catch(error){
          await recordOutcome(user.id, item.type, String(reservation.id), dedupeKey, 'failed', error.message);
          summary.failed++;
        }
      }
    }
  }

  return summary;
}

// Varredura de vencimento de CNH. Diferente do sweep de reservas, este é
// orientado a USUÁRIO - percorre as CNHs cadastradas, não as reservas.
// Cria a notificação do sino e envia o e-mail, ambos governados pelo mesmo
// marco, para o portal e a caixa de entrada nunca discordarem.
async function sweepDriverLicenseReminders(){
  const summary = { scanned:0, notified:0, sent:0, skipped:0, failed:0 };

  const result = await query(
    `SELECT l.id, l.user_id, l.numero, l.categoria, l.validade,
            u.email, u.display_name
       FROM driver_licenses l
       JOIN users u ON u.id = l.user_id
      WHERE l.validade IS NOT NULL
        AND u.active = TRUE
        AND u.deleted_at IS NULL`
  );
  if(!result.rows.length) return summary;

  const settings = await getEmailReminderSettings();
  const emailConfig = settings.cnhExpiring;
  const hoje = todayISO();

  for(const row of result.rows){
    const license = { numero:row.numero, categoria:row.categoria, validade:row.validade };
    const status = licenseStatus(license, hoje);
    if(status.estado !== 'vencendo' && status.estado !== 'vencida'){ continue; }

    summary.scanned++;
    const marco = cnhMilestoneFor(status.diasRestantes);
    if(!marco){ summary.skipped++; continue; }

    const mensagem = licenseStatusMessage(status);
    const situacaoCurta = status.estado === 'vencida' ? 'está vencida' : 'está próxima do vencimento';
    // A validade entra na chave em ISO (e não pela coerção do objeto Date, que
    // produziria "Wed Sep 30 2026 ... GMT-0300" e mudaria conforme o locale do
    // servidor). Incluí-la faz o aviso recomeçar quando a CNH é renovada.
    const validadeISO = toISODate(row.validade);
    const dedupeKey = `cnh-expiring:${row.id}:${validadeISO}:${marco}`;

    // Notificação no portal. O unique (user_id, dedupe_key) é quem garante o
    // "uma vez por marco"; só contamos quando a linha entrou de fato.
    try{
      const criada = await withTransaction(async client => {
        await ensureNotificationsTable(client);
        return insertNotification(client, {
          userId:String(row.user_id),
          type:'cnh_expiring',
          title:status.estado === 'vencida' ? 'Sua CNH está vencida' : 'Sua CNH está vencendo',
          message:mensagem,
          reservationId:null,
          dedupeKey,
          metadata:{ validade:validadeISO, diasRestantes:status.diasRestantes }
        });
      });
      if(criada) summary.notified++;
    }catch(error){
      console.error('Falha ao notificar vencimento de CNH:', error.message);
    }

    // E-mail, se o tipo estiver habilitado em Integrações > Lembretes.
    if(!emailConfig || !emailConfig.enabled){ summary.skipped++; continue; }
    if(!row.email){ summary.skipped++; continue; }
    if(await alreadySent(row.user_id, dedupeKey)){ summary.skipped++; continue; }

    const tokens = {
      nome:row.display_name,
      mensagem,
      situacaoCurta,
      validade:formatDateBR(row.validade),
      categoria:row.categoria || 'Não informada',
      diasRestantes:String(status.diasRestantes)
    };

    try{
      await sendMail({
        to:row.email,
        subject:renderTemplate(emailConfig.subject, tokens),
        html:renderTemplate(emailConfig.body, tokens)
      });
      await recordOutcome(row.user_id, 'cnhExpiring', null, dedupeKey, 'sent', null);
      summary.sent++;
    }catch(error){
      await recordOutcome(row.user_id, 'cnhExpiring', null, dedupeKey, 'failed', error.message);
      summary.failed++;
    }
  }

  return summary;
}

// Varredura de manutenção da frota. Orientada a LEMBRETE (coleção
// maintenanceReminders em application_state, cadastrada pelo Painel de
// Administração > Manutenção) - percorre os lembretes ativos, resolve o
// km atual do veículo a partir das reservas já persistidas e avisa quem
// tem permissão de frota (admin ou can_manage_fleet) quando algum marco é
// cruzado. Igual ao CNH, a notificação do sino sempre sai; o e-mail é
// condicionado ao tipo "maintenanceDue" estar habilitado em
// Integrações > Lembretes.
async function sweepMaintenanceReminders(){
  const summary = { scanned:0, notified:0, sent:0, skipped:0, failed:0 };

  const state = await query(
    `SELECT collection_name, value FROM application_state WHERE collection_name = ANY($1::text[])`,
    [['maintenanceReminders', 'vehicles']]
  );
  const values = Object.fromEntries(state.rows.map(row => [row.collection_name, row.value]));
  const reminders = (Array.isArray(values.maintenanceReminders) ? values.maintenanceReminders : [])
    .filter(reminder => reminder && reminder.ativo !== false);
  if(!reminders.length) return summary;

  const managersResult = await query(
    `SELECT id, email, display_name FROM users
      WHERE active = TRUE AND deleted_at IS NULL AND (role = 'admin' OR can_manage_fleet = TRUE)`
  );
  if(!managersResult.rows.length) return summary;

  const vehicles = Array.isArray(values.vehicles) ? values.vehicles : [];
  const reservations = await listAllReservations();
  const hoje = todayISO();
  const settings = await getEmailReminderSettings();
  const emailConfig = settings.maintenanceDue;

  for(const reminder of reminders){
    const currentKm = reminder.proximaKm != null
      ? latestOdometerReading(reminder.local, reminder.carro, reservations)
      : null;
    const status = maintenanceReminderStatus(reminder, currentKm, hoje);
    const marco = (status.km && status.km.marco) || (status.data && status.data.marco);
    if(!marco) continue;
    summary.scanned++;

    const vehicle = vehicles.find(v =>
      v.local === reminder.local && String(v.codigo) === String(reminder.carro));
    const veiculoNome = vehicle
      ? (`${(vehicle.marca || '').trim()} ${(vehicle.modelo || '').trim()}`.trim() || 'Veículo')
      : String(reminder.carro || 'Veículo');
    const mensagem = maintenanceStatusMessage(reminder, status, veiculoNome);
    const dedupeKey = `maint:${reminder.id}:${status.km ? status.km.marco : '-'}:` +
      `${status.data ? status.data.marco : '-'}:${reminder.proximaKm ?? ''}:${reminder.proximaData ?? ''}`;

    for(const manager of managersResult.rows){
      let criada = false;
      try{
        criada = await withTransaction(async client => {
          await ensureNotificationsTable(client);
          return insertNotification(client, {
            userId:String(manager.id),
            type:'maintenance_due',
            title:`${maintenanceReminderLabel(reminder)} próxima`,
            message:mensagem,
            reservationId:null,
            dedupeKey,
            metadata:{
              reminderId:reminder.id, local:reminder.local, carro:reminder.carro,
              proximaKm:reminder.proximaKm, proximaData:reminder.proximaData
            }
          });
        });
      }catch(error){
        console.error('Falha ao notificar manutenção próxima:', error.message);
      }
      if(criada) summary.notified++;

      if(!emailConfig || !emailConfig.enabled || !manager.email){ summary.skipped++; continue; }
      if(await alreadySent(manager.id, dedupeKey)){ summary.skipped++; continue; }

      const tokens = {
        nome:manager.display_name,
        veiculo:veiculoNome,
        placaBadge:plateBadgeEmailHTML(vehicle && vehicle.placa),
        tipoManutencao:maintenanceReminderLabel(reminder),
        mensagem,
        proximaKm:reminder.proximaKm != null ? String(reminder.proximaKm) : 'Não informada',
        proximaData:reminder.proximaData ? formatDateBR(reminder.proximaData) : 'Não informada'
      };
      try{
        await sendMail({
          to:manager.email,
          subject:renderTemplate(emailConfig.subject, tokens),
          html:renderTemplate(emailConfig.body, tokens)
        });
        await recordOutcome(manager.id, 'maintenanceDue', null, dedupeKey, 'sent', null);
        summary.sent++;
      }catch(error){
        await recordOutcome(manager.id, 'maintenanceDue', null, dedupeKey, 'failed', error.message);
        summary.failed++;
      }
    }
  }

  return summary;
}

// Dispara na hora (não pelo sweep periódico) quando um passageiro entra
// numa carona - avisa o motorista por e-mail, se esse tipo estiver
// habilitado em Integrações > Lembretes. Nunca deve interromper o fluxo de
// sincronização da reserva: qualquer erro só é registrado no console.
async function sendPassengerJoinedEmail(reservation, addedPassengers, driver){
  if(!driver || !driver.email || !Array.isArray(addedPassengers) || !addedPassengers.length) return;
  try{
    const settings = await getEmailReminderSettings();
    const config = settings.passengerJoined;
    if(!config.enabled) return;
    const vehicle = await resolveVehicle(reservation.carro, reservation.partida);
    const tokens = reservationTokens(reservation, vehicle);
    const passageiros = addedPassengers.map(passenger => passenger.nome).join(', ');
    const mergedTokens = { ...tokens, nome:driver.display_name, passageiros };
    const subject = renderTemplate(config.subject, mergedTokens);
    const html = renderTemplate(config.body, mergedTokens);
    await sendMail({ to:driver.email, subject, html });
  }catch(error){
    console.error('Falha ao enviar e-mail de passageiro na carona:', error.message);
  }
}

// Bloco de citação da mensagem opcional. Fora do template para que, sem
// mensagem, o e-mail não fique com uma caixa vazia - o token {{blocoMotivo}}
// simplesmente some.
function blocoMotivoHTML(motivo, autor){
  const texto = String(motivo || '').trim();
  if(!texto) return '';
  const escapado = texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<tr><td style="padding:18px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#f7f9fb;border-left:3px solid #c2cedb;border-radius:4px;padding:14px 16px;">
            <div style="font-size:12px;color:#8a95a3;margin-bottom:6px;">Mensagem de ${autor}</div>
            <div style="font-size:14px;color:#3c4753;line-height:1.55;">${escapado}</div>
          </td>
        </tr></table>
      </td></tr>`;
}

// Dispara na hora (não pelo sweep) quando alguém sai ou é removido de uma
// carona. `task` vem de notifyReservationPassengerRemovals. Como os demais
// e-mails de evento, nunca interrompe o fluxo: erro só vai para o console.
async function sendPassengerRemovalEmail(task){
  if(!task || !task.destinatario || !task.destinatario.email) return;
  try{
    const settings = await getEmailReminderSettings();
    const config = settings[task.tipo];
    if(!config || !config.enabled) return;

    const vehicle = await resolveVehicle(task.reservation.carro, task.reservation.partida);
    const tokens = {
      ...reservationTokens(task.reservation, vehicle),
      nome:task.destinatario.display_name,
      outraParte:task.outraParte,
      motivo:String(task.motivo || ''),
      blocoMotivo:blocoMotivoHTML(task.motivo, task.outraParte)
    };
    await sendMail({
      to:task.destinatario.email,
      subject:renderTemplate(config.subject, tokens),
      html:renderTemplate(config.body, tokens)
    });
  }catch(error){
    console.error('Falha ao enviar e-mail de remoção de passageiro:', error.message);
  }
}

module.exports = {
  sweepEmailReminders,
  sweepDriverLicenseReminders,
  sweepMaintenanceReminders,
  getEmailReminderSettings,
  DEFAULT_TEMPLATES,
  pendingReminders,
  cnhMilestoneFor,
  CNH_MILESTONES,
  renderTemplate,
  reservationTokens,
  formatDateBR,
  plateBadgeEmailHTML,
  blocoMotivoHTML,
  sendPassengerJoinedEmail,
  sendPassengerRemovalEmail,
  MAINTENANCE_KM_MILESTONES,
  MAINTENANCE_DATE_MILESTONES,
  MAINTENANCE_TYPE_LABELS,
  maintenanceReminderLabel,
  maintenanceMilestoneFor,
  latestOdometerReading,
  maintenanceReminderStatus,
  maintenanceStatusMessage
};
