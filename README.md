# CapriCar

Sistema interno de reservas e gestão da frota corporativa.

## Início rápido

```powershell
npm install
npm run db:migrate
npm run db:seed
npm start
```

A aplicação fica disponível em:

```text
http://localhost:3000
```

Antes de iniciar, copie `.env.example` para `.env` e configure o PostgreSQL.

## Documentação

- [Documentação técnica e operacional](docs/DOCUMENTACAO_TECNICA.md)
- [Backup e restauração](BACKUP.md)
- [Transferência para outro computador](INSTRUCOES_TRANSFERENCIA.md)

## Testes

```powershell
npm test
```
