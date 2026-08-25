/* Aplica o tema salvo (ou preferencia do sistema) antes da primeira renderizacao, evitando flash do tema errado. Extraido de index.html para respeitar a CSP script-src 'self' (nao permite scripts inline). */
  (function(){
    try{
      var savedTheme = localStorage.getItem('capricar_theme');
      var preferredTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : preferredTheme);
    }catch(error){
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
