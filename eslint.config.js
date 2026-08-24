const js = require('@eslint/js');

const nodeGlobals = {
  require:'readonly',
  module:'readonly',
  exports:'writable',
  process:'readonly',
  __dirname:'readonly',
  console:'readonly',
  Buffer:'readonly',
  fetch:'readonly',
  TextDecoder:'readonly',
  setTimeout:'readonly',
  clearTimeout:'readonly'
};

module.exports = [
  js.configs.recommended,
  {
    // O próprio arquivo de configuração roda em Node/CommonJS.
    files:['*.js'],
    languageOptions:{ sourceType:'commonjs', ecmaVersion:2022, globals:nodeGlobals }
  },
  {
    files:['server/**/*.js'],
    languageOptions:{ sourceType:'commonjs', ecmaVersion:2022, globals:nodeGlobals },
    rules:{
      'no-unused-vars':['warn', { argsIgnorePattern:'^_', varsIgnorePattern:'^_' }],
      // Regexes de sanitização checam caracteres de controle de propósito
      // (ex.: server/validation.js), não por engano.
      'no-control-regex':'off'
    }
  },
  {
    files:['js/**/*.js'],
    languageOptions:{
      sourceType:'script',
      ecmaVersion:2022,
      globals:{
        window:'readonly',
        document:'readonly',
        console:'readonly',
        fetch:'readonly',
        localStorage:'readonly',
        navigator:'readonly',
        FormData:'readonly',
        FileReader:'readonly',
        Intl:'readonly',
        setTimeout:'readonly',
        clearTimeout:'readonly',
        setInterval:'readonly',
        clearInterval:'readonly'
      }
    },
    rules:{
      // Os 15 módulos em js/ são carregados como <script> clássicos, sem
      // bundler nem módulos ES — cada arquivo declara funções/constantes de
      // nível superior que outros arquivos consomem via escopo global
      // compartilhado (ver docs/DOCUMENTACAO_TECNICA.md, seção 6.1). Isso é
      // arquitetural, não um erro: aplicar no-undef/no-unused-vars às
      // declarações de topo exigiria manter uma lista manual de centenas de
      // símbolos entre arquivos, sem detectar bugs reais — por isso ficam
      // desligadas só nesse escopo. Variáveis/parâmetros não usados dentro
      // do corpo de uma função continuam sendo pegos normalmente pelo
      // restante do projeto (server/, tests/).
      'no-undef':'off',
      'no-unused-vars':'off'
    }
  },
  {
    files:['tests/**/*.js'],
    languageOptions:{ sourceType:'commonjs', ecmaVersion:2022, globals:nodeGlobals }
  },
  {
    ignores:['node_modules/**', 'backups/**', 'server/uploads/**', 'output/**']
  }
];
