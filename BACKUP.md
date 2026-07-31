# Backup e restauração do CapriCar

## Criar um backup

Execute:

`npm run db:backup`

O arquivo será gravado em `backups/`. Por padrão, backups com mais de 30 dias
são removidos automaticamente. As opções podem ser alteradas no `.env`:

```text
BACKUP_DIR=backups
BACKUP_RETENTION_DAYS=30
```

## Restaurar um backup

Pare o CapriCar antes da restauração. A restauração substitui o banco atual e
exige uma confirmação explícita:

`npm run db:restore -- backups/arquivo.backup --confirm=capricar`

Antes de restaurar, crie também um backup do estado atual.

## Migração para outro servidor

No servidor definitivo:

1. Instale Node.js e PostgreSQL.
2. Copie o código, sem copiar o `.env` antigo.
3. Crie um `.env` com as credenciais do novo banco.
4. Execute `npm run db:migrate`.
5. Restaure o último arquivo `.backup`.
6. Configure HTTPS e `SESSION_COOKIE_SECURE=true`.

