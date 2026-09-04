/* Gestão — lembretes de manutenção da frota */

/* =========================================================
   Cálculo de status (duplicado de propósito de server/reminders.js:
   maintenanceReminderStatus/latestOdometerReading - o portal não importa
   do servidor, e o selo do card precisa da mesma lógica que decide quando
   a notificação/e-mail dispara, senão os dois divergem).
   ========================================================= */
const MAINTENANCE_TYPE_LABELS = {
  oleo:'Troca de óleo',
  pneus:'Troca de pneus',
  revisao:'Revisão'
};

const MAINTENANCE_KM_WARNING = 1000;
const MAINTENANCE_DATE_WARNING_DAYS = 15;

function maintenanceReminderLabel(reminder){
  return MAINTENANCE_TYPE_LABELS[reminder.tipo] || String(reminder.descricao || 'Manutenção').trim();
}

// Maior leitura de odômetro já registrada numa devolução deste veículo -
// mesmo critério do motor de recomendação (vehicleRecommendationStats, em
// js/vehicle-recommendation.js) e da varredura do servidor.
function maintenanceLatestOdometer(local, carro, reservations){
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

function maintenanceDaysRemaining(targetISO, todayISODate){
  const parseUTC = iso => {
    const [ano, mes, dia] = String(iso).slice(0, 10).split('-').map(Number);
    return Date.UTC(ano, mes - 1, dia);
  };
  return Math.round((parseUTC(targetISO) - parseUTC(todayISODate)) / 86400000);
}

const MAINTENANCE_BADGE_INFO = {
  ok:{ classe:'tag-success', texto:'Em dia' },
  aproximando:{ classe:'tag-warning', texto:'Aproximando' },
  vencido:{ classe:'tag-danger', texto:'Vencido' }
};

// Selo único (ok/aproximando/vencido) considerando as duas pernas - o pior
// estado das duas vence, igual à mensagem consolidada do servidor.
function maintenanceBadge(reminder, reservations){
  let estado = 'ok';
  const detalhes = [];

  if(reminder.proximaKm != null){
    const kmAtual = maintenanceLatestOdometer(reminder.local, reminder.carro, reservations);
    if(kmAtual != null){
      const restante = Number(reminder.proximaKm) - kmAtual;
      if(restante <= 0){
        estado = 'vencido';
        detalhes.push(Math.abs(restante) + ' km além do previsto');
      } else {
        if(restante <= MAINTENANCE_KM_WARNING && estado !== 'vencido') estado = 'aproximando';
        detalhes.push('faltam ' + restante + ' km');
      }
    } else {
      detalhes.push('sem leitura de odômetro ainda');
    }
  }

  if(reminder.proximaData){
    const restante = maintenanceDaysRemaining(reminder.proximaData, todayISO());
    if(restante < 0){
      estado = 'vencido';
      detalhes.push(Math.abs(restante) + ' dia(s) atrasada');
    } else if(restante === 0){
      if(estado !== 'vencido') estado = 'aproximando';
      detalhes.push('vence hoje');
    } else {
      if(restante <= MAINTENANCE_DATE_WARNING_DAYS && estado !== 'vencido') estado = 'aproximando';
      detalhes.push('faltam ' + restante + ' dia(s)');
    }
  }

  const info = MAINTENANCE_BADGE_INFO[estado];
  return { estado, texto:info.texto, classe:info.classe, detalhes:detalhes.join(' · ') };
}

/* =========================================================
   Painel de administração
   ========================================================= */
const maintenanceForm = document.getElementById('maintenanceForm');
const maintenanceList = document.getElementById('maintenanceList');
const maintenanceTypeSelect = document.getElementById('maintenanceType');
const maintenanceDescriptionInput = document.getElementById('maintenanceDescription');

if(maintenanceTypeSelect && maintenanceDescriptionInput){
  maintenanceTypeSelect.addEventListener('change', function(){
    maintenanceDescriptionInput.placeholder = maintenanceTypeSelect.value === 'outro'
      ? 'Descreva a manutenção (obrigatório)'
      : 'Detalhe adicional (opcional)';
  });
}

function renderMaintenanceManagement(){
  if(!canManageMaintenance()) return;
  populateManagementVehicleSelectors();
  const reservations = getReservations();
  const reminders = getMaintenanceReminders().slice().sort((a, b) => {
    if((a.ativo !== false) !== (b.ativo !== false)) return a.ativo !== false ? -1 : 1;
    return String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''));
  });

  maintenanceList.innerHTML = reminders.length ? reminders.map(reminder => {
    const badge = maintenanceBadge(reminder, reservations);
    const detalhes = [];
    if(reminder.proximaKm != null){
      detalhes.push('Próxima aos ' + Number(reminder.proximaKm).toLocaleString('pt-BR') + ' km');
    }
    if(reminder.proximaData) detalhes.push('até ' + formatDate(reminder.proximaData));
    const linhaDetalhe = [detalhes.join(' · '), badge.detalhes, reminder.observacoes]
      .filter(Boolean).join(' · ') + (reminder.ativo === false ? ' · Concluído' : '');

    return '<div class="management-item' + (reminder.ativo === false ? ' is-inactive' : '') + '">' +
        '<div><strong>' + escapeHTML(maintenanceReminderLabel(reminder)) + ' · ' +
          getVehicleDisplayHTML({ partida:reminder.local, carro:reminder.carro }) +
          ' <span class="tag ' + badge.classe + '">' + escapeHTML(badge.texto) + '</span></strong>' +
        '<small>' + escapeHTML(linhaDetalhe) + '</small></div>' +
        '<div class="management-actions">' +
          (reminder.ativo !== false
            ? '<button type="button" class="secondary-btn maintenance-done-btn" data-id="' +
              escapeHTML(reminder.id) + '">Marcar como feito</button>'
            : '') +
          '<button type="button" class="delete-btn maintenance-delete-btn" data-id="' +
            escapeHTML(reminder.id) + '">Excluir</button>' +
        '</div>' +
      '</div>';
  }).join('') : '<div class="empty-state">Nenhum lembrete de manutenção cadastrado.</div>';

  maintenanceList.querySelectorAll('.maintenance-delete-btn').forEach(btn => {
    btn.addEventListener('click', async function(){
      if(!canManageMaintenance()) return;
      const id = this.getAttribute('data-id');
      const old = getMaintenanceReminders().find(r => String(r.id) === String(id));
      const list = getMaintenanceReminders().filter(r => String(r.id) !== String(id));
      try{
        await saveMaintenanceReminders(list);
      }catch(error){
        await hydrateDatabaseState();
        await showSiteAlert(error.message, {
          title:'Não foi possível excluir o lembrete',
          type:'danger'
        });
        renderMaintenanceManagement();
        return;
      }
      logAudit('removeu', 'lembrete de manutenção', id,
        old ? maintenanceReminderLabel(old) + ' · ' + old.local + ' · ' + old.carro : '');
      renderMaintenanceManagement();
    });
  });

  maintenanceList.querySelectorAll('.maintenance-done-btn').forEach(btn => {
    btn.addEventListener('click', async function(){
      if(!canManageMaintenance()) return;
      const id = this.getAttribute('data-id');
      const list = getMaintenanceReminders();
      const reminder = list.find(r => String(r.id) === String(id));
      if(!reminder) return;

      if(!await showSiteConfirm(
        'Marcar "' + maintenanceReminderLabel(reminder) + '" como feito?',
        { title:'Concluir manutenção', confirmText:'Concluir', type:'info' }
      )) return;

      reminder.ativo = false;

      try{
        await saveMaintenanceReminders(list);
      }catch(error){
        await hydrateDatabaseState();
        await showSiteAlert(error.message, {
          title:'Não foi possível concluir o lembrete',
          type:'danger'
        });
        renderMaintenanceManagement();
        return;
      }
      logAudit('concluiu', 'lembrete de manutenção', id,
        maintenanceReminderLabel(reminder) + ' · ' + reminder.local + ' · ' + reminder.carro);
      renderMaintenanceManagement();
    });
  });
}

if(maintenanceForm){
  maintenanceForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if(!canManageMaintenance()) return;
    const key = document.getElementById('maintenanceVehicle').value;
    const tipo = maintenanceTypeSelect.value;
    const descricao = maintenanceDescriptionInput.value.trim();
    const proximaKmRaw = document.getElementById('maintenanceNextKm').value;
    const proximaData = document.getElementById('maintenanceNextDate').value;
    const observacoes = document.getElementById('maintenanceNotes').value.trim();

    if(!key || !tipo){
      await showSiteAlert('Selecione o veículo e o tipo de manutenção.', {
        title:'Revise os dados do lembrete',
        type:'warning'
      });
      return;
    }
    if(tipo === 'outro' && !descricao){
      await showSiteAlert('Descreva o tipo de manutenção quando selecionar "Outro".', {
        title:'Revise os dados do lembrete',
        type:'warning'
      });
      return;
    }
    if(!proximaKmRaw && !proximaData){
      await showSiteAlert(
        'Informe a próxima troca por quilometragem e/ou por tempo (data) - o que vencer primeiro dispara o aviso.',
        { title:'Revise os dados do lembrete', type:'warning' }
      );
      return;
    }

    const splitAt = key.lastIndexOf('|');
    const reminder = {
      id: 'manutencao-' + Date.now(),
      local: key.slice(0, splitAt),
      carro: key.slice(splitAt + 1),
      tipo: tipo,
      descricao: tipo === 'outro' ? descricao : '',
      proximaKm: proximaKmRaw ? Number(proximaKmRaw) : null,
      proximaData: proximaData || null,
      observacoes: observacoes,
      ativo: true,
      criadoEm: new Date().toISOString()
    };

    const list = getMaintenanceReminders();
    list.push(reminder);
    try{
      await saveMaintenanceReminders(list);
    }catch(error){
      await hydrateDatabaseState();
      await showSiteAlert(error.message, {
        title:'Não foi possível cadastrar o lembrete',
        type:'danger'
      });
      renderMaintenanceManagement();
      return;
    }
    logAudit('cadastrou', 'lembrete de manutenção', reminder.id,
      maintenanceReminderLabel(reminder) + ' · ' + reminder.local + ' · ' + reminder.carro);
    maintenanceForm.reset();
    renderMaintenanceManagement();
  });
}
