/* Aplica o tema salvo antes da primeira renderizacao, evitando flash do tema errado. Extraido de index.html para respeitar a CSP script-src 'self' (nao permite scripts inline). Sem preferencia salva (primeiro acesso, ou localStorage bloqueado), o padrao e sempre claro - nao segue a preferencia do sistema operacional. */
  (function(){
    try{
      var savedTheme = localStorage.getItem('capricar_theme');
      document.documentElement.setAttribute('data-theme', savedTheme === 'dark' ? 'dark' : 'light');
    }catch(error){
      document.documentElement.setAttribute('data-theme', 'light');
    }
  })();
