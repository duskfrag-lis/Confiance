# Base: Node 24 (NestJS 12 lo exige) y openssl, que Prisma necesita.
FROM node:24-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Compila la API y genera el cliente de Prisma.
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# prisma.config.ts exige DATABASE_URL incluso para generar el cliente; aquí no se conecta a nada.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
 && npm run build

# Aplica las migraciones pendientes y termina (servicio "migrate" del compose).
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# Deja solo las dependencias de producción (conserva el cliente generado de Prisma).
FROM build AS prune
RUN npm prune --omit=dev

# Imagen final de la API.
FROM base AS runtime
COPY --from=prune /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
