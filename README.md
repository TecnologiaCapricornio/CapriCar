# CapriCar — versão modular

O projeto foi reorganizado sem alterar a lógica funcional do sistema.

## Estrutura

```text
capricar/
├── index.html
├── assets/
│   ├── logo.png
│   └── bg.jpg
├── css/
│   ├── variables.css
│   ├── base.css
│   ├── components.css
│   ├── calendar.css
│   ├── admin.css
│   └── responsive.css
└── js/
    ├── app.js
    ├── config.js
    ├── storage.js
    ├── auth.js
    ├── reservations.js
    ├── rides.js
    ├── calendar.js
    ├── admin.js
    ├── modals.js
    └── utils.js
```

## Responsabilidade dos arquivos JavaScript

- `config.js`: constantes, filiais, veículos, capacidade e textos fixos.
- `utils.js`: datas, horários, formatação e detecção de conflitos.
- `storage.js`: leitura e gravação das reservas no `localStorage`.
- `auth.js`: login, logout, perfil e navegação entre abas.
- `reservations.js`: formulário, validação e gerenciamento das reservas do usuário.
- `rides.js`: passageiros, ocupantes e caronas disponíveis.
- `calendar.js`: calendário mensal e seleção de veículos.
- `admin.js`: filtros, criação, edição e exclusão administrativa.
- `modals.js`: confirmações, reserva rápida e seletor visual de datas.
- `app.js`: inicialização final da aplicação.

## Execução

Abra o `index.html` em um navegador moderno. Para um ambiente mais próximo de produção, sirva a pasta com um servidor local, por exemplo:

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.
