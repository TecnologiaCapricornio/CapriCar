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

## Docker

Sobe a aplicação e o PostgreSQL juntos, sem precisar instalar Node ou Postgres na máquina:

```powershell
copy .env.example .env
# edite o .env: defina PGPASSWORD e ADMIN_INITIAL_PASSWORD antes de continuar
docker compose up --build
```

A aplicação fica disponível em `http://localhost:3000`. Na primeira subida, o
container aplica as migrações e cria o usuário `admin` automaticamente (ver
`docker/entrypoint.sh`) - não precisa rodar `db:migrate`/`db:seed` à parte.

Fotos de CNH/retirada/devolução e os dados do Postgres ficam em volumes
Docker nomeados (`capricar_uploads`, `capricar_pgdata`), então sobrevivem a
`docker compose down` (mas não a `docker compose down -v`, que apaga os
volumes). Para reconstruir a imagem depois de alterar código:

```powershell
docker compose up --build
```

Para parar:

```powershell
docker compose down
```

## Documentação

- [Manual de utilização](docs/MANUAL_UTILIZACAO.md)
- [Documentação técnica e operacional](docs/DOCUMENTACAO_TECNICA.md)
- [Backup e restauração](BACKUP.md)
- [Transferência para outro computador](INSTRUCOES_TRANSFERENCIA.md)

## Testes

```powershell
npm test
```
