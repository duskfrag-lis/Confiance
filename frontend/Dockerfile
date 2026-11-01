# Dependencias, compartidas por desarrollo y producción.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Desarrollo (docker-compose.dev.yml): ng serve monta el código y recarga al guardar.
FROM deps AS dev
COPY . .
EXPOSE 4200
CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200"]

# Compila la SPA con la configuración de producción + docker (API en /api).
FROM deps AS build
COPY . .
RUN npx ng build --configuration production,docker

# Sirve la SPA y reenvía /api al backend.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
