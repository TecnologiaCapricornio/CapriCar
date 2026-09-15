#!/bin/sh
# Ponto de entrada do container: espera o Postgres responder, aplica as
# migrações (db/schema.sql + db/migrations/*.sql, idempotente - ver
# server/scripts/migrate.js), garante os dados iniciais (usuário admin,
# locais/veículos de demonstração - também idempotente, ver
# server/scripts/seed.js) e só então sobe o servidor. Roda em todo start do
# container (não só na primeira vez) porque os três passos são seguros de
# repetir - é o que permite usar a mesma imagem para o primeiro deploy e
# para reinícios seguintes sem precisar de um passo manual separado.
set -e

echo "[entrypoint] Aguardando o banco de dados..."
node server/scripts/wait-for-db.js

echo "[entrypoint] Aplicando migrações..."
node server/scripts/migrate.js

echo "[entrypoint] Garantindo dados iniciais..."
node server/scripts/seed.js

echo "[entrypoint] Iniciando o CapriCar..."
exec node server/index.js
