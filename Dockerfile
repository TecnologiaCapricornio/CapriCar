# syntax=docker/dockerfile:1

# ---- deps: instala só as dependências de produção, em camada separada ----
# (fica em cache entre builds enquanto package*.json não mudar - reconstruir
# só o código da aplicação não reinstala node_modules do zero toda vez)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Usuário não-root: o processo Node não precisa (e não deve) rodar como root
# dentro do container.
RUN addgroup -S capricar && adduser -S capricar -G capricar

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY js ./js
COPY css ./css
COPY assets ./assets
COPY db ./db
COPY index.html logo.png bg.jpg ./
COPY docker/entrypoint.sh ./docker/entrypoint.sh

# server/uploads (fotos de CNH e de retirada/devolução) e backups/ são
# montados como volume em produção (ver docker-compose.yml) - criados aqui
# só para já existirem com o dono certo antes do primeiro mount.
RUN chmod +x ./docker/entrypoint.sh && \
    mkdir -p server/uploads/cnh server/uploads/operacoes backups && \
    chown -R capricar:capricar /app

USER capricar
EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]
