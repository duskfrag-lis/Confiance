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
├── database/          # seeds de desarrollo y consultas SQL de verificación
├── docs/              # documentación del proyecto
└── docker-compose.yml # PostgreSQL + SeaweedFS
```
 
## Requisitos
 
- Node.js 24 LTS (24.9 o superior; los tests del backend lo necesitan porque NestJS 12 es solo ESM)
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

El esquema se versiona con migraciones SQL escritas a mano en `backend/prisma/migrations/`:

| Migración | Contenido |
|---|---|
| `..._schema` | Tablas y restricciones (CHECK, UNIQUE, FK) |
| `..._indexes` | Índices |
| `..._views` | Vistas de catálogo y perfil público |
| `..._functions_triggers` | `updated_at` automático, autocompletado a 24h (HU-45), límite de reagendamientos (HU-50), cancelación tardía (HU-48) |
| `..._seed_catalogs` | Catálogos fijos (estados, tipos, días, bloques horarios) |
| `..._business_rules` | Ciclo de la contratación (solo transiciones válidas, cita automática al confirmar, trazabilidad automática); cancelación ordinaria hasta 24 h antes y fuerza mayor hasta FINALIZADO; reagendamiento (máx. 2 solicitudes); bloques horarios con horas y bloqueo desde ACEPTADO; calificaciones solo en COMPLETADO y por perfil; coherencia de las partes; límites de oficios y fotos; sesiones por dispositivo; pagos simulados solo por transferencia |

Para registrar quién hizo un cambio de estado, el backend debe ejecutar `SELECT set_config('app.user_id', '<user_id>', true)` dentro de la misma transacción; los triggers lo guardan en `audit_events`.

`schema.prisma` se obtiene de la base ya migrada (`npx prisma db pull`). No lo edites a mano.

Para comprobar las reglas de negocio después de cargar el seed (corre en una transacción y no deja datos):

```bash
docker compose exec -T postgres psql -U confiance -d confiance -v ON_ERROR_STOP=1 < database/queries/business_rules_check.sql
```

**Reglas:**
- Usa `npx prisma migrate deploy` para aplicar migraciones. **No uses `prisma migrate dev`**: Prisma no representa los CHECK, las vistas, los triggers ni los índices parciales, y podría generar una migración que los borre.
- Para cambiar el esquema, crea una carpeta nueva `AAAAMMDDHHMMSS_descripcion/migration.sql`, aplícala con `migrate deploy` y después ejecuta `npx prisma db pull` y `npx prisma generate`.
- En el backend, busca los catálogos **por nombre** (`status_name = 'active'`), nunca por ID.
- `database/seeds/dev_seed.sql` es solo para desarrollo.
 
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
 