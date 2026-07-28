/* Funções utilitárias de datas, horários e conflitos */
/* =========================================================
   Utilitários gerais
   ========================================================= */
function pad2(n){
  return String(n).padStart(2, '0');
}

function isoFromParts(year, monthIndex, day){
  return year + '-' + pad2(monthIndex + 1) + '-' + pad2(day);
}

function todayISO(){
  const t = new Date();
  return isoFromParts(t.getFullYear(), t.getMonth(), t.getDate());
}

function daysInMonth(year, monthIndex){
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function formatDate(dateStr){
  if(!dateStr) return '';
  const [y,m,d] = dateStr.split('-');
  return d + '/' + m + '/' + y;
}

function eachDateISOInRange(startISO, endISO, callback){
  if(!startISO || !endISO) return;
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const oneDay = 86400000;
  let guard = 0;
  while(cur <= end && guard < 3660){
    const d = new Date(cur);
    callback(isoFromParts(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    cur += oneDay;
    guard++;
  }
}

// Converte "HH:MM" em minutos desde 00:00. Retorna 0 para valores vazios/; usado
// para compatibilidade com reservas antigas que podem não ter horário definido.
function horaParaMinutos(hhmm){
  if(!hhmm) return 0;
  const [hh, mm] = hhmm.split(':').map(Number);
  if(!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

const MIN_DIA = 0;
const MAX_DIA = 24 * 60; // 1440 — meia-noite do dia seguinte

// Retorna o intervalo [inicioMin, fimMin) em minutos (0-1440) que uma reserva ocupa
// do carro em um dia (iso) específico dentro do seu período [dataIda, dataVolta].
// - No primeiro dia: do horário de retirada até 23:59 (1440), a menos que seja também o último dia.
// - No último dia: de 00:00 até o horário de devolução.
// - Nos dias intermediários: dia inteiro (00:00 - 24:00).
// - Se dataIda === dataVolta (mesmo dia): do horário de retirada até o horário de devolução.
// Retorna null se o iso não estiver dentro do período da reserva.
function getOccupiedMinutesRangeForDate(reserva, iso){
  if(iso < reserva.dataIda || iso > reserva.dataVolta) return null;

  const isFirstDay = iso === reserva.dataIda;
  const isLastDay = iso === reserva.dataVolta;

  let inicio, fim;

  if(isFirstDay && isLastDay){
    inicio = horaParaMinutos(reserva.horarioRetirada);
    fim = horaParaMinutos(reserva.horarioDevolucao) || MAX_DIA;
    if(fim <= inicio) fim = MAX_DIA; // reserva sem horário de devolução válido: considera até o fim do dia
  } else if(isFirstDay){
    inicio = horaParaMinutos(reserva.horarioRetirada);
    fim = MAX_DIA;
  } else if(isLastDay){
    inicio = MIN_DIA;
    fim = horaParaMinutos(reserva.horarioDevolucao) || MAX_DIA;
  } else {
    inicio = MIN_DIA;
    fim = MAX_DIA;
  }

  return { inicio: inicio, fim: fim };
}

// Verifica se dois intervalos de minutos [a.inicio, a.fim) e [b.inicio, b.fim) se sobrepõem.
function faixasSeSobrepoem(a, b){
  return a.inicio < b.fim && b.inicio < a.fim;
}

// Verifica se duas reservas do MESMO carro conflitam: precisam ter datas que se
// sobrepõem e, nos dias em comum, faixas de horário que se sobrepõem.
function reservasConflitam(r1, r2){
  if(r1.dataIda > r2.dataVolta || r2.dataIda > r1.dataVolta) return false; // sem sobreposição de datas

  let conflita = false;
  const inicioComum = r1.dataIda > r2.dataIda ? r1.dataIda : r2.dataIda;
  const fimComum = r1.dataVolta < r2.dataVolta ? r1.dataVolta : r2.dataVolta;

  eachDateISOInRange(inicioComum, fimComum, iso => {
    if(conflita) return;
    const faixa1 = getOccupiedMinutesRangeForDate(r1, iso);
    const faixa2 = getOccupiedMinutesRangeForDate(r2, iso);
    if(faixa1 && faixa2 && faixasSeSobrepoem(faixa1, faixa2)) conflita = true;
  });

  return conflita;
}

// Verifica se uma reserva "candidata" (ainda não salva) conflitaria com as reservas
// já existentes do mesmo carro (mesma partida + mesmo número de carro). Permite
// excluir uma reserva pelo id (usado ao editar) — não utilizado atualmente, mas
// mantém a função genérica.
function findConflictingReservations(partida, carro, dataIda, dataVolta, horarioRetirada, horarioDevolucao, excludeId){
  const candidata = { dataIda: dataIda, dataVolta: dataVolta, horarioRetirada: horarioRetirada, horarioDevolucao: horarioDevolucao };
  return getReservations().filter(r => {
    if(r.partida !== partida || r.carro !== carro) return false;
    if(excludeId != null && String(r.id) === String(excludeId)) return false;
    return reservasConflitam(candidata, r);
  });
}

// Formata a faixa horária ocupada por uma reserva em um dia específico, ex: "07:00 - 10:00".
// Para dias intermediários/parciais sem horário nesse dia específico, usa 00:00/23:59 como limites visuais.
function formatFaixaHorariaNoDia(reserva, iso){
  const faixa = getOccupiedMinutesRangeForDate(reserva, iso);
  if(!faixa) return '';
  const minutosParaHora = m => pad2(Math.floor(Math.min(m, 1439) / 60)) + ':' + pad2(Math.min(m, 1439) % 60);
  return minutosParaHora(faixa.inicio) + ' - ' + minutosParaHora(faixa.fim === MAX_DIA ? 1439 : faixa.fim);
}

function initials(name){
  if(!name) return '--';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if(parts.length === 0) return '--';
  if(parts.length === 1) return parts[0].substring(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Gera lista de horários de 30 em 30 minutos, 24 horas (00:00 até 23:30).
function gerarHorarios(){
  const horarios = [];
  for(let h = 0; h <= 23; h++){
    horarios.push(pad2(h) + ':00');
    horarios.push(pad2(h) + ':30');
  }
  return horarios;
}

function populateHorarioOptions(selectEl){
  const horarios = gerarHorarios();
  selectEl.innerHTML = '<option value="">Selecione...</option>' +
    horarios.map(h => '<option value="' + h + '">' + h + '</option>').join('');
}
