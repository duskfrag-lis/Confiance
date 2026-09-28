# Confiance
 
Plataforma web para conectar de forma segura a clientes con prestadores de servicios locales. Proyecto de equipo, Universidad Católica Luis Amigó.
 
> **Estado:** en desarrollo. El backend base ya levanta; el frontend y el modelo de datos están en construcción.
 
## Stack
 
| Capa | Tecnología |
|---|---|
| Frontend | Angular + Angular Material + CDK |
| Backend | NestJS (TypeScript, CommonJS + Jest) |
| Base de datos | PostgreSQL 16 + Prisma 6 |
| Autenticación | JWT en cookies httpOnly + refresh token en BD, Argon2 |
| Archivos | SeaweedFS (compatible con S3) + sharp |
| Correo | Resend |
| Tiempo real | WebSockets con socket.io (chat) |
| Contenedores | Docker + Docker Compose |
 
## Estructura del repositorio
 
```
Confiance/
├── frontend/          # SPA Angular (4 roles)
├── backend/           # API REST + gateway WebSockets (NestJS)
│   ├── prisma/        # schema.prisma y migraciones
│   └── src/
│       ├── common/    # guards, decoradores, interceptores, filtros
│       ├── config/    # validación de variables de entorno (zod)
│       ├── prisma/    # PrismaService global
│       ├── storage/   # cliente S3 (SeaweedFS) + sharp
│       ├── mail/      # cliente Resend
│       └── modules/   # un módulo por dominio (auth, profiles, contracting...)
├── database/          # diagrama ER, seeds y SQL de referencia
├── docs/              # documentación del proyecto
└── docker-compose.yml # PostgreSQL + SeaweedFS
```
 
## Requisitos
 
- Node.js 22 LTS (se recomienda 22.22.3 o superior)
- Docker con Compose
- Git
## Puesta en marcha
 
```bash
# 1. Clonar
git clone https://github.com/duskfrag-lis/Confiance.git
cd Confiance
 
# 2. Levantar PostgreSQL y SeaweedFS
docker compose up -d
 
# 3. Backend
cd backend
cp .env.example .env      # y completa los valores (ver abajo)
npm install
npx prisma generate
npm run start:dev
```
 
Si todo salió bien, la consola termina con `Nest application successfully started` y la documentación Swagger queda en http://localhost:3000/docs.
 
### Servicios locales
 
| Servicio | URL / puerto | Para qué |
|---|---|---|
| API (NestJS) | http://localhost:3000/api | Backend (todas las rutas llevan el prefijo `/api`) |
| Swagger | http://localhost:3000/docs | Documentación de la API |
| PostgreSQL | localhost:5432 | Base de datos (usuario, clave y BD: `confiance`) |
| SeaweedFS (S3) | localhost:8333 | API S3 para archivos |
| SeaweedFS (Filer UI) | http://localhost:8888 | Explorador web de archivos |
 
### Variables de entorno
 
El archivo `backend/.env` no se sube al repositorio. Parte de `backend/.env.example` y completa:
 
- `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`: cualquier cadena de al menos 10 caracteres en desarrollo.
- `STORAGE_ACCESS_KEY=confiance` y `STORAGE_SECRET_KEY=confiance123`: coinciden con los valores del `docker-compose.yml`.
- `RESEND_API_KEY`: en desarrollo sirve un valor de relleno; para enviar correos reales se necesita una clave de Resend.
## Base de datos
 
El modelo de datos se está cerrando (normalización a 3FN). Mientras tanto, `prisma/schema.prisma` no tiene modelos. Cuando el modelo esté listo, se cargará el script SQL en PostgreSQL y se generarán los modelos con `npx prisma db pull`.
 
Antes de ejecutar `prisma migrate` o `prisma db push` contra una base compartida, acuérdalo con el equipo.
 
## Flujo de trabajo con Git
 
- `main`: código estable. Solo recibe cambios por Pull Request desde `develop`.
- `develop`: integración del trabajo del equipo.
- `feature/<épica>-<descripción>`: una rama por tarea, creada desde `develop` y fusionada por Pull Request. Ejemplo: `feature/auth-registro`.
- Commits con prefijo: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
## Notas importantes
 
- **Prisma está fijado en la versión 6.** Las versiones 7 y 8 exigen módulos ESM (el backend usa CommonJS) y aún no soportan MongoDB. No actualices sin discutirlo con el equipo.
- **Usa un solo entorno para instalar dependencias** (Windows o WSL). Mezclarlos deja binarios nativos incompatibles en `node_modules` (Prisma, sharp, argon2).
- **El almacenamiento es SeaweedFS, no MinIO.** MinIO fue archivado en 2026 y ya no es una opción viable.
## Problemas comunes
 
| Síntoma | Solución |
|---|---|
| `@prisma/client did not initialize yet` | Ejecuta `npx prisma generate` en `backend/` |
| No conecta a la base de datos al arrancar | Verifica `docker compose ps` y que `DATABASE_URL` coincida con el compose |
| `Variables de entorno inválidas` | Compara tu `.env` con `.env.example`; falta alguna variable |
| Errores raros con `sharp` o `argon2` | Borra `node_modules` y vuelve a ejecutar `npm install` en un solo entorno |
 