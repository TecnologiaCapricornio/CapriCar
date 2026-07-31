# CapriCar — instruções para instalar em outro computador

Este pacote contém o código-fonte do CapriCar e um backup do banco de dados
PostgreSQL com os dados existentes no momento da geração.

## 1. Programas necessários

- Node.js LTS
- PostgreSQL 18 (ou uma versão compatível)
- pgAdmin 4 é opcional, mas facilita a criação do banco e do usuário

## 2. Preparar o PostgreSQL

No pgAdmin, crie:

- um usuário de login chamado `capricar_app`, com uma senha forte;
- um banco chamado `capricar`, deixando `capricar_app` como proprietário.

Também é possível executar, conectado como `postgres`:

```sql
CREATE ROLE capricar_app WITH LOGIN PASSWORD 'ESCOLHA_UMA_SENHA_FORTE';
CREATE DATABASE capricar OWNER capricar_app;
```

## 3. Configurar o projeto

Abra a pasta extraída no VS Code. Copie `.env.example` para um novo arquivo
chamado `.env` e preencha principalmente:

```text
PGHOST=localhost
PGPORT=5432
PGDATABASE=capricar
PGUSER=capricar_app
PGPASSWORD=A_MESMA_SENHA_CRIADA_NO_POSTGRESQL
```

Em uma instalação local, mantenha:

```text
NODE_ENV=development
SESSION_COOKIE_SECURE=false
```

O arquivo `.env` real não acompanha este pacote para evitar o envio da senha
do PostgreSQL da máquina de origem.

## 4. Instalar as dependências

No terminal do VS Code, dentro da pasta do projeto:

```powershell
npm install
```

## 5. Restaurar os dados enviados

O backup está na pasta `backups`. Com o `.env` configurado, execute:

```powershell
npm run db:restore -- backups/NOME_DO_ARQUIVO.backup --confirm=capricar
```

Substitua `NOME_DO_ARQUIVO.backup` pelo nome real existente na pasta. A
restauração substitui o conteúdo atual do banco `capricar`.

Se o PostgreSQL não for localizado automaticamente, acrescente ao `.env`:

```text
PG_DUMP_PATH=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe
PG_RESTORE_PATH=C:\Program Files\PostgreSQL\18\bin\pg_restore.exe
```

## 6. Iniciar o CapriCar

```powershell
npm start
```

Depois, acesse:

```text
http://localhost:3000
```

Os usuários da aplicação e seus dados fazem parte do backup. Portanto, os
acessos existentes continuam válidos após a restauração.

## Teste rápido

Com o servidor iniciado, abra no navegador:

```text
http://localhost:3000/api/health
```

O resultado deve indicar `"ok": true`.

Para executar os testes automatizados:

```powershell
npm test
```

## Produção e HTTPS

Para uso em um servidor definitivo:

- use um `.env` próprio do servidor;
- defina `NODE_ENV=production`;
- configure HTTPS em um proxy como Nginx, Caddy ou IIS;
- defina `SESSION_COOKIE_SECURE=true`;
- mantenha backups periódicos com `npm run db:backup`.

