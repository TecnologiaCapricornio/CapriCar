/* Persistência local das reservas */
function getReservations(){
  try{
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }catch(e){
    return [];
  }
}

function saveReservations(list){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// Retorna todas as reservas cuja faixa [dataIda, dataVolta] cobre a data informada (qualquer carro/rota).
function getReservationsCoveringDate(iso){
  return getReservations().filter(r => iso >= r.dataIda && iso <= r.dataVolta);
}

function carKey(partida, carro){
  return partida + '|' + carro;
}
