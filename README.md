# TuDestino

PWA de turismo responsable en Baja California Sur (proyecto final de Aplicaciones Web Progresivas).
La fuente única de verdad del proyecto es [`CLAUDE.md`](CLAUDE.md).

## Requisitos

- Node.js 20 o superior
- Docker (opcional, para `docker compose watch`)

## Comandos

| Tarea | Comando |
|---|---|
| Entorno completo con recarga en vivo (db, api, web) | `docker compose watch` |
| Entorno completo sin recarga automática | `docker compose up` |
| API en desarrollo | `cd backend && npm install && npm run dev` |
| Web en desarrollo | `cd frontend && npm install && npm run dev` |
| Pruebas | `npm test` (en `backend/` y en `frontend/`) |
| Lint / formato | `npm run lint` / `npm run format` |
| Build del frontend | `cd frontend && npm run build && npm run preview` |
| Regenerar íconos e ilustraciones | `cd frontend && npm run assets` |

Define las variables en un `.env` local en la raíz del repositorio antes de levantar con Docker (no hay `.env.example` versionado; las de reportes de F5, Cloudinary y push de F9 se documentan en sus secciones). Ese archivo está ignorado por git y `compose.yaml` lo usa para inyectar las variables en el contenedor de la API. Para ver los cambios del código en tiempo real usa `docker compose watch`: sincroniza `backend/` y `frontend/` con los contenedores y reconstruye la imagen si cambian las dependencias. El servicio web define `CHOKIDAR_USEPOLLING=true` para que Vite detecte los cambios también en Docker Desktop sobre Windows. El service worker solo se registra en el build de producción (`npm run build && npm run preview`).

## Revisión final de interfaz y datos (2026-11-02)

Estos ajustes se aplicaron después de las capturas de `docs/evidencias`; hay que regenerar las que muestran la interfaz anterior.

- **Tema azul.** La navegación, los acentos, los botones principales y los pines de destino usan la paleta azul (`#1f4fff` en claro y `#3f63ff` en oscuro); se retiraron los acentos rosas.
- **Inicio = Explorar.** `/` reexporta la pantalla de catálogo y `/explorar` sigue existiendo. Se mantiene la búsqueda en la barra superior y en la pantalla; se retiraron el hero, «Viaja con cuidado», el banner y el chip «Eventos».
- **Catálogo y reseñas reales.** Se retiró «Cerca de mí» de Explorar (sigue disponible como «Mi ubicación» en `/mapa`). Las tarjetas y el detalle ocultan promedio y número de reseñas cuando `reviews_count` es `0`; no hay texto de relleno ni botón de compartir dentro del destino. Los seeds ya no cargan valoraciones de ejemplo.
- **Frescura tras reseñar.** `src/storage/catalogFreshness.js` cambia la revisión del catálogo y `destinationsApi` añade `_r` a las URLs públicas; al guardar una reseña, la siguiente lectura de Explore y del detalle evita la copia vieja del navegador y del service worker.
- **Mapa.** Controles y filtros alineados a la izquierda, sin el enlace «Ir a la lista de lugares»; los selectores usan una flecha propia separada del borde y el texto de ayuda tiene más espacio. Los pines de destino son azules. El mapa público sigue mostrando solo reportes resueltos de tipos no sensibles.
- **Educación.** Quedan solo los filtros por tipo `Todo`, `Artículos`, `Videos` y `Enlaces`; se retiró el filtro por categoría.
- **Reportes.** Se agregó «Otro» (`otro`, no sensible) a los tipos del frontend, del respaldo local y del seed.
- **Eventos y botones.** «Proponer un evento» incluye un selector de mapa: al tocar o mover el pin se llenan latitud y longitud (también se pueden escribir). «Proponer un evento» y «Cerrar sesión» usan `btn--surface` (fondo blanco, borde y sombra) para que se lean como botones.
- **Docker.** `docker compose watch` sincroniza `backend/` y `frontend/`, y reconstruye la imagen si cambian `package.json`/`package-lock.json`. `CHOKIDAR_USEPOLLING=true` y `server.watch.usePolling` hacen que Vite detecte cambios en Docker Desktop sobre Windows.

## Subida de imágenes (2026-11-03)

Ya no se pide pegar una URL de imagen en los formularios: se elige un archivo, se sube al instante y el formulario guarda la URL devuelta.

- **Dónde se configuran las credenciales.** En el `.env` de la raíz (ignorado por git) con `STORAGE_DRIVER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`. `compose.yaml` las pasa a la API. Nunca se commitea el secreto; en otros entornos se definen como variables del proveedor.
- **Qué se puede subir.** Foto de perfil, imágenes de destinos, imagen de eventos/propuestas y portada de contenido educativo. Solo JPEG, PNG o WebP de hasta 5 MB; el backend comprueba los magic bytes, elimina metadatos y re-codifica a WebP.
- **Permisos.** `POST /api/v1/uploads/images?purpose=avatar|event` requiere sesión; `destination` y `education` requieren `authority` o `admin`.
- **Público vs. privado.** Estas imágenes se guardan como recursos públicos de Cloudinary (o bajo `/api/v1/uploads/public/…` con el driver local). Las evidencias de reportes siguen siendo privadas: Cloudinary `authenticated` y lectura solo por la ruta autenticada del panel.
- **Componente compartido.** `frontend/src/shared/components/ImageUploadField.jsx` muestra vista previa, estado «Subiendo…», error y opción de quitar; `frontend/src/api/uploads.js` envía el `FormData`.

## Base de datos, migraciones y seeds (Sprint 2)

```bash
docker compose up -d db                     # PostgreSQL 16 + PostGIS (DB_PORT=5433 si el 5432 está ocupado)
cd backend
export DATABASE_URL=postgres://tudestino:change-me@localhost:5432/tudestino
npm run migrate                             # aplica migraciones (node-pg-migrate, SQL explícito)
npm run migrate:down -- 5                   # revierte las últimas 5 (el número es obligatorio)
npm run seed                                # datos de ejemplo idempotentes; rechaza NODE_ENV=production
npm test                                    # con DATABASE_URL también corre las pruebas de integración
```

Variables del backend (validadas al arrancar con zod; falla rápido si faltan): `DATABASE_URL` (obligatoria salvo `NODE_ENV=test`), `PORT`, `CLIENT_ORIGIN`, `LOG_LEVEL`, `RATE_LIMIT_PER_MINUTE`, `TRUST_PROXY` (`true` o número de proxies delante de la API), más las de autenticación de la sección siguiente. Frontend: `VITE_API_URL` (por defecto `/api/v1`) y `API_PROXY_TARGET` (destino del proxy de Vite en dev y `preview`, por defecto `http://localhost:3000`).

Los seeds crean un usuario por rol (`user@`, `authority@`, `admin@dev.tudestino.local`) con una contraseña **solo de desarrollo** definida en `backend/seeds/data/content.js`. Nunca cargues los seeds en producción.

En producción el frontend estático debe reescribir `/api/*` hacia la API (p. ej. un `rewrites` en Vercel o una regla de proxy en Netlify) o definir `VITE_API_URL`.

### Decisiones de diseño (Sprint 2)

- Un destino tiene una sola categoría principal (`category_id`, según el modelo); el frontend de ejemplo local conserva varias.
- `destinations` añade `care_tips text[]` y `highlights jsonb` (recomendaciones y datos del lugar que muestra el detalle); no están en CLAUDE.md §10.
- El id que usa la interfaz es el `slug`, igual en API y datos locales, para que los favoritos sigan funcionando si la API cae.
- La búsqueda usa `websearch_to_tsquery('spanish')`; no ignora acentos (no se añadió `unaccent`).
- `report_status_history` es de solo inserción (trigger contra UPDATE, DELETE y TRUNCATE) y sus claves foráneas son `RESTRICT`: un reporte con historial no se puede borrar.
- El `down` de la primera migración conserva la extensión `postgis` (las imágenes y hosts gestionados la preinstalan junto con `postgis_topology`).
- Los logs registran método, ruta y estado, nunca el query string (puede contener coordenadas) ni cuerpos o cabeceras.
- `GET /api/v1/health` es liveness; `GET /api/v1/health/ready` comprueba la base de datos (503 si no responde).
- Sin conexión o con la API caída, la interfaz muestra primero lo guardado en IndexedDB (con la fecha de la última sincronización) y, si nunca se guardó nada, los datos de ejemplo locales; los errores 4xx no se enmascaran (ver «Catálogo, caché y modo sin conexión»).

## Catálogo, caché y modo sin conexión (Sprint 4 · F4)

Endpoints nuevos (bajo `/api/v1`; `U` = requiere sesión de cualquier rol):

| Método y ruta | Qué hace |
|---|---|
| `GET /destinations/:slug/reviews` | Reseñas públicas paginadas. **Nunca** devuelven autor ni `user_id` |
| `POST /destinations/:slug/reviews` (U) | Crea la reseña (rating 1–5, comentario opcional ≤ 1000). `409 REVIEW_EXISTS` si ya reseñaste |
| `PUT /destinations/:slug/reviews/me` (U) | Crea (`201`) o reemplaza (`200`) tu reseña |
| `GET /me/reviews`, `GET /me/favorites`, `GET /me/events?scope=upcoming\|past\|all` (U) | Tu actividad (`Cache-Control: no-store`) |
| `PUT` / `DELETE /me/favorites/:slug` (U) | Idempotentes; `favorites_count` solo cambia si la fila realmente se creó o borró |
| `GET /events/:id` | Detalle de un evento publicado (también pasados, para que un enlace compartido siga funcionando) |
| `PUT` / `DELETE /events/:id/attendance` (U) | «Asistiré»; idempotente. `409 EVENT_NOT_OPEN` si el evento ya terminó, `404` si no está publicado |

- `avg_rating`, `reviews_count` y `favorites_count` se **recalculan desde la tabla** en la misma transacción que la escritura, bloqueando la fila del destino con `FOR UPDATE`: no se incrementan, así que no se desfasan con escritores concurrentes. Los seeds ya no cargan valoraciones ni conteos de ejemplo: solo se muestran reseñas reales. La migración `1760600000008_real_review_totals` corrige bases existentes recalculando esos agregados desde `reviews`.
- Caché HTTP: lecturas públicas con `Cache-Control: public, max-age=60, stale-while-revalidate=300` y ETag (`304`); eventos con sesión opcional devuelven `attending` con `Cache-Control: private, no-store` y `Vary: Authorization`; todo lo personal y los errores van con `no-store`.
- Frontend: IndexedDB (`idb`) en `src/storage/db.js` con migraciones por versión; el catálogo visto en línea se espeja y se busca/filtra localmente sin acentos cuando no hay red, con el aviso «Sin conexión · mostrando datos guardados» y la fecha de sincronización. El service worker (`src/sw.js`, decisiones puras en `src/pwa/swRouting.js`) usa stale-while-revalidate para las lecturas públicas, cache-first con expiración para imágenes y red directa para autenticación, `/me`, escrituras y todo lo que lleve credenciales.
- Despliegue: el iframe de video de Educación necesita permitir `frame-src https://www.youtube-nocookie.com https://player.vimeo.com` si el host del frontend define una Content-Security-Policy.

## Autenticación y RBAC (Sprint 3 · F3)

Endpoints (todos bajo `/api/v1`, errores `{ "error": { "code", "message" } }`):

| Método y ruta | Qué hace |
|---|---|
| `POST /auth/register` | Crea la cuenta (correo único `citext`; contraseña ≥ 8 con número y símbolo, ≤ 72 bytes) e inicia sesión. `409 EMAIL_TAKEN` si el correo existe |
| `POST /auth/login` | Error idéntico (`401 INVALID_CREDENTIALS`) para correo inexistente o contraseña incorrecta; siempre ejecuta una comparación bcrypt |
| `POST /auth/refresh` | Rota el refresh token (cookie). Si llega uno ya rotado o revocado se revocan **todas** las sesiones de ese usuario |
| `POST /auth/logout` | Revoca el refresh token en el servidor y borra la cookie (204, idempotente) |
| `POST /auth/forgot` | Respuesta `202` idéntica exista o no el correo; token aleatorio de un solo uso, 20 min, solo se guarda su SHA-256; el envío ocurre después de responder |
| `POST /auth/reset` | Valida token no usado y no vencido, cambia la contraseña, lo marca usado y revoca todos los refresh tokens (una sola sentencia SQL atómica) |
| `GET /me`, `PATCH /me` | Perfil del usuario autenticado (Bearer). `PATCH` solo acepta `full_name` y `avatar_url` (https); rol y correo se rechazan con 400 |

Tokens: el **access token** es un JWT HS256 de 15 min (`jose`; emisor, audiencia y algoritmo verificados) que va en el cuerpo y el cliente guarda **solo en memoria**. El **refresh token** es opaco (32 bytes aleatorios, 256 bits), solo se guarda su SHA-256 en `refresh_tokens` y viaja únicamente en la cookie `td_refresh` (`HttpOnly; SameSite=Lax; Path=/api/v1/auth`, `Secure` salvo en desarrollo).

Middleware (`backend/src/middleware/auth.js`): `authenticate` (Bearer → `req.user`), `requireRole(...roles)` y `requireArea(resolveAreaId)` (el admin pasa; la autoridad solo si el recurso es de su área). 401 sin sesión válida y 403 sin permiso. Límite estricto por IP en login (solo cuenta los intentos fallidos), register, forgot y reset.

Variables nuevas del backend (validadas con zod; ver `backend/src/config/env.js`):

| Variable | Por defecto | Notas |
|---|---|---|
| `JWT_SECRET` | secreto fijo solo de desarrollo | **Obligatoria en producción** (≥ 32 caracteres, no puede empezar con `change-me`). Genera una con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `COOKIE_SECURE` | `true` salvo `NODE_ENV=development` | Fuerza o desactiva el atributo `Secure` |
| `COOKIE_DOMAIN` | sin definir | Solo si la API y el frontend comparten dominio padre |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Vida de la cookie y del refresh token (1–90) |
| `BCRYPT_ROUNDS` | `12` | Costo de bcrypt (4–15) |
| `SMTP_URL` | sin definir | Obligatoria en producción (`smtps://usuario:clave@host:465`). En desarrollo y test **no se envía nada**: nodemailer usa `jsonTransport` |
| `MAIL_FROM` | `TuDestino <no-reply@tudestino.local>` | Remitente |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Origen CORS y base del enlace `CLIENT_ORIGIN/restablecer?token=…` |
| `TRUST_PROXY` | `false` | `true` (un salto) o el número de proxies delante de la API; necesario para que el rate limit vea la IP real |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MINUTES` | `10` / `15` | Límite por IP en los endpoints de credenciales |

En desarrollo el enlace de recuperación se imprime en el log de la API (solo `NODE_ENV=development`); en producción nunca se registra. Usuarios de prueba: ver Sprint 2 (`user@`, `authority@`, `admin@dev.tudestino.local`).

Pruebas de integración (con Postgres real; se omiten sin `DATABASE_URL`):

```bash
DB_PORT=5433 docker compose up -d db        # 5433 si el 5432 está ocupado
cd backend
export DATABASE_URL=postgres://tudestino:change-me@localhost:5433/tudestino
npm run migrate && npm run seed && npm test
docker compose stop db                      # sin borrar el volumen
```

### Decisiones de diseño (Sprint 3)

- **`jose`** para JWT (sin dependencias, mantenida, API estándar `SignJWT`/`jwtVerify` con `algorithms` explícito) en lugar de `jsonwebtoken`.
- **`bcryptjs`** (puro JavaScript, ya instalado) en lugar de `argon2`: no requiere compilar módulos nativos en Windows ni en CI. Argon2id sería preferible con más margen; bcrypt tiene tope de 72 bytes, por eso se valida. Costo 12 por defecto; las pruebas usan 4.
- **Reuso de refresh = revocar todas las sesiones del usuario.** La tabla no tiene `family_id`, así que la "familia" es el conjunto de tokens del usuario. Consecuencia: dos peticiones simultáneas con el mismo token cuentan como reuso; el frontend comparte una única promesa de refresh y usa `navigator.locks` para serializar entre pestañas.
- **`authenticate` es sin estado:** el rol y el área van en el JWT (15 min). Un cambio de rol o una desactivación se aplican como máximo 15 min después (o al siguiente refresh, que lee la base de datos).
- **Registro con correo duplicado responde 409** (revela que el correo existe; es el compromiso habitual de usabilidad). Login, forgot y reset no filtran existencia.
- **CSRF:** el refresh solo viaja en cookie `SameSite=Lax` con `Path=/api/v1/auth`, y la API solo acepta CORS de `CLIENT_ORIGIN`; las rutas con Bearer no dependen de cookies.
- **`forgot` responde antes de buscar/enviar** para que el tiempo de respuesta no delate si la cuenta existe; un fallo de envío solo se registra.
- **Auditoría** (pino, nivel `warn` para eventos sospechosos): `auth.login_failed`, `auth.refresh_reuse_detected`, `auth.password_reset_rejected`; nivel `info`: registro, login, reset. Nunca incluyen contraseñas, tokens ni el correo completo (solo un HMAC truncado `emailRef`).
- **Frontend:** el token de acceso vive en una referencia de React (memoria). Un indicador no sensible `td:session` en LocalStorage evita llamar a `refresh` (y ver un 401) cuando el visitante nunca inició sesión. Si el servidor no responde al restaurar la sesión, la interfaz queda como visitante sin borrar ese indicador.
- `compose.yaml` aún define `JWT_REFRESH_SECRET`: ya no se usa (el refresh token es opaco) y puede eliminarse.

## Reportes ciudadanos, Background Sync y Geolocation (Sprint 5 · F5)

Endpoints nuevos (bajo `/api/v1`; todos públicos, un visitante puede reportar y consultar):

| Método y ruta | Qué hace |
|---|---|
| `GET /report-types` | Tipos de reporte (`slug`, `name`). No expone `is_sensitive` |
| `POST /reports` | `multipart/form-data`: `type`, `description` (10–2000), `lat`, `lng`, `accuracy_m`?, `destination_slug`?, `occurred_at`? (no futuro), `anonymous` (por defecto `true`), `client_uuid` (obligatorio) y hasta 4 archivos `photos`. `201` con `folio` y `tracking_code` (una sola vez); `200` con `replayed: true` y `tracking_code: null` si el `client_uuid` ya existe |
| `POST /reports/track` | JSON `{ folio, code }`. Devuelve estado e historial (`from_status`, `to_status`, `note`, `created_at`), sin autor ni evidencias. `404 REPORT_NOT_FOUND` idéntico para folio inexistente y código erróneo |

Variables nuevas del backend (validadas con zod; ver `backend/src/config/env.js`). No hay `.env.example` versionado: las variables se documentan aquí. En Docker Compose se leen del `.env` de la raíz (ignorado por git); el contenedor las recibe mediante `compose.yaml`.

| Variable | Por defecto | Notas |
|---|---|---|
| `STORAGE_DRIVER` | `local` (`cloudinary` en producción) | Dónde se guardan las evidencias y las imágenes públicas: `local` o `cloudinary` |
| `CLOUDINARY_URL` | sin definir | Alternativa compacta: `cloudinary://<api_key>:<api_secret>@<cloud_name>` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | sin definir | Variables separadas de Cloudinary; van juntas. El backend construye `CLOUDINARY_URL` si no se define |
| `UPLOADS_DIR` | `backend/uploads` | Carpeta del driver `local`. Está en `.gitignore`. Las imágenes públicas locales se sirven por `/api/v1/uploads/public/…`; las evidencias de reportes nunca tienen ruta pública |
| `REPORT_RATE_LIMIT_MAX` / `REPORT_RATE_LIMIT_WINDOW_MINUTES` | `10` / `60` | Límite de `POST /reports` por cliente |
| `TRACK_RATE_LIMIT_MAX` / `TRACK_RATE_LIMIT_WINDOW_MINUTES` | `10` / `15` | Límite estricto de `POST /reports/track` por cliente |

Con `STORAGE_DRIVER=cloudinary` las evidencias de reportes se suben como recursos `authenticated` (solo accesibles con URL firmada) y las fotos de perfil, destinos, eventos y portadas educativas como recursos públicos normales. El endpoint autenticado `POST /api/v1/uploads/images?purpose=avatar|event|destination|education` recibe el campo multipart `image`; `destination` y `education` exigen rol `authority` o `admin`.

Límites de subida: 4 fotos por reporte, 5 MB cada una (`413 PAYLOAD_TOO_LARGE`), solo JPEG/PNG/WebP comprobados por sus primeros bytes (`415 UNSUPPORTED_MEDIA_TYPE`), cuerpo total ≤ ~20,25 MB (se rechaza por `Content-Length` antes de leerlo), campos de texto ≤ 16 KB. La subida de imágenes públicas acepta una imagen de hasta 5 MB y el backend la re-codifica a WebP sin EXIF antes de guardarla. Errores de validación: `400 VALIDATION_ERROR`; rate limit: `429 RATE_LIMITED`.

Cómo probarlo a mano:

```bash
cd backend && DATABASE_URL=postgres://tudestino:change-me@localhost:5433/tudestino PORT=3100 npm start
curl -F type=contaminacion -F "description=Basura acumulada en la orilla." -F lat=24.14 -F lng=-110.31 \
     -F anonymous=true -F client_uuid=$(node -e "console.log(crypto.randomUUID())") \
     -F "photos=@foto.jpg" http://localhost:3100/api/v1/reports
curl -X POST http://localhost:3100/api/v1/reports/track -H 'Content-Type: application/json' \
     -d '{"folio":"TD-2026-000001","code":"ABCDE-23456"}'
```

### Decisiones de diseño (Sprint 5)

- **Anonimato real (ADR-03).** No existe columna para IP ni user-agent; el logger solo registra método, ruta y estado, y además redacta `ip`, `body`, `query` y cabeceras si alguien los registrara (hay una prueba). `anonymous=true` ignora el token aunque sea válido; sin el campo, el reporte es anónimo. Un reporte «no anónimo» de un visitante sin sesión tampoco se vincula a nadie.
- **Fotos.** Se validan por magic bytes (no por el `Content-Type` declarado) y se re-codifican con `sharp`: se aplica la orientación EXIF, se limitan a 1600 px y se guardan como WebP sin ningún metadato (EXIF/GPS, XMP, ICC). Hay una prueba con un JPEG con GPS verificada con `exifr`. En el navegador además se reducen en un canvas antes de guardarlas (ahorra datos y cuota; el canvas ya descarta el EXIF).
- **No hay ruta pública de evidencias.** La autoridad las lee en F7 con acceso autenticado (`GET /admin/reports/:id/evidences/:evidenceId`); en Cloudinary se suben como `authenticated`.
- **Folio y código.** El folio `TD-AAAA-NNNNNN` lo genera la base de datos (`report_folio_seq`). El código son 10 caracteres base32 sin ambiguos (`crypto.randomBytes` con muestreo sin sesgo); se devuelve una sola vez y solo se guarda su SHA-256. La comparación es en tiempo constante y, si el folio no existe, se compara contra un hash señuelo.
- **Idempotencia.** `client_uuid` UNIQUE + `INSERT … ON CONFLICT DO NOTHING`: peticiones simultáneas con el mismo uuid esperan en el índice único y la perdedora recibe `200` con el mismo folio (hay una prueba con 6 peticiones concurrentes). Los archivos se guardan solo después de ganar el `INSERT` y, si algo falla, la transacción se revierte y se borran los archivos ya subidos.
- **Un `409` se reintenta, no se descarta.** La API solo responde `409 REPORT_CONFLICT` si el ganador de una carrera hizo rollback; el frontend lo trata como transitorio (reintenta) para no perder el reporte. El `200` de repetición cuenta como entregado.
- **Outbox.** Todo reporte se guarda primero en el store `outbox` de IndexedDB (con las fotos como bytes, no como `Blob`, por compatibilidad). Cada cambio de estado es una transacción: la página y el service worker «reclaman» una entrada atómicamente, así un reporte nunca se envía dos veces aunque compitan. Un reclamo abandonado vence a los 2 minutos.
- **Quién envía.** Con conexión, la página envía al momento; si falla por red o 5xx queda en cola. Sin conexión se registra el `sync` `reports-outbox`; el worker ejecuta el mismo código de envío. Un `4xx` de validación marca la entrada como `failed` con el motivo (no se reintenta). Sin `SyncManager` (Safari, Firefox) funcionan el evento `online`, la apertura de la app y «Reintentar ahora».
- **El service worker no tiene sesión** (el token vive en memoria de la página). Por eso un reporte no anónimo de un usuario con sesión queda marcado `needsSession` y solo lo envía la página, para que se vincule a la cuenta; los anónimos los envía cualquiera.
- **El código de un reporte enviado en segundo plano** no tiene pantalla donde mostrarse: la entrada pasa a `sent` y conserva folio y código **hasta que el usuario pulsa «Ya lo guardé»** en «Pendientes de envío» (se borra entonces, y también se descarta el cuerpo y las fotos al marcar `sent`). Es la única copia del código en el dispositivo; si el envío ocurre con la pantalla de éxito abierta, el código solo vive en memoria.
- **`occurred_at`.** Solo se envía cuando el reporte estuvo en cola más de 2 minutos (y nunca en el futuro), para que un envío diferido conserve la hora real sin que un reloj desajustado del teléfono bloquee un reporte normal.
- **Limitación conocida:** si la respuesta de creación se pierde por la red después de que el servidor la guardó, el reintento recibe el folio pero no el código (solo se muestra una vez); la pantalla lo explica.

## Panel de autoridad y administración (Sprint 7 · F7)

Pantallas (React Router, todas bajo `RequireRole`): `/admin` (resumen), `/admin/reportes` y `/admin/reportes/:id`, `/admin/destinos`, `/admin/eventos` (incluye la cola de moderación), `/admin/educacion` y `/admin/usuarios` (solo `admin`; la autoridad ni la ve en el menú). Escritorio ≥ 1024 px: barra lateral; menos: menú compacto desplazable. Para quien tiene cuenta: `/eventos/proponer` («Proponer un evento») y `/perfil/propuestas` («Mis propuestas»).

Endpoints (todos bajo `/api/v1`, `Cache-Control: private, no-store`, límite de tasa: 240 lecturas/min y 60 escrituras/min por cliente):

| Método y ruta | Acceso | Qué hace |
|---|---|---|
| `GET /admin/summary` | authority, admin | Reportes por estado y propuestas de eventos pendientes |
| `GET /admin/reports` | authority, admin | Paginado (`page`, `limit` ≤ 50), filtros `status`, `type`, `folio` (exacto o prefijo; solo letras, números y guiones), más recientes primero |
| `GET /admin/reports/:id` | authority, admin | Datos, tipo, ubicación, evidencias (solo id, MIME y `download_path`), historial con autor y `allowed_transitions`. `reporter` solo existe si el reporte **no** fue anónimo; si lo fue, `reporter: null` y nunca se devuelve `reporter_id` |
| `GET /admin/reports/:id/evidences/:evidenceId` | authority, admin | Imagen en flujo desde el almacenamiento (`Cache-Control: private, no-store`, `nosniff`). Con Cloudinary se firma una URL de 60 s y la API la descarga y la reenvía (el navegador nunca la ve) |
| `PATCH /admin/reports/:id/status` | authority, admin | `{ status, note }` (nota 3–1000, obligatoria). `pending → in_review \| dismissed`; `in_review → resolved \| dismissed \| pending`; `resolved`/`dismissed` son terminales salvo que un **admin** los reabra a `in_review`; el resto responde `409 INVALID_TRANSITION`. UPDATE + INSERT en el historial en una transacción con `SELECT … FOR UPDATE` |
| `GET`/`POST /admin/destinations`, `GET`/`PATCH`/`DELETE /admin/destinations/:id` | authority, admin | Incluye borradores. `slug` generado (`playa-x`, `playa-x-2`…) o explícito (`409 SLUG_TAKEN`); `lat`/`lng` ⇒ `geography`; `images: [{ url, alt_text }]` (imagen subida, https o `/img/…`; al editar reemplazan a las anteriores). `DELETE` es lógico (`deleted_at`) |
| `GET`/`POST /admin/events`, `GET`/`PATCH`/`DELETE /admin/events/:id` | authority, admin | `POST` crea ya `published`; no acepta fechas pasadas ni `ends_at < starts_at`. `DELETE` es lógico |
| `PATCH /admin/events/:id/moderation` | authority, admin | `{ action: approve \| reject \| cancel, reason? }`. `approve`/`reject` solo desde `pending`; `reject` exige motivo; `cancel` desde `pending` o `published`; si no, `409` |
| `POST /events` | cualquier sesión | Propone un evento (mismo validador): queda `pending` con `organizer_id` = quien lo propone. 10 por hora |
| `GET /me/events/proposed` | cualquier sesión | Mis propuestas con estado, `moderation_note` (motivo del rechazo o cancelación) |
| `GET`/`POST /admin/edu-contents`, `GET`/`PATCH`/`DELETE /admin/edu-contents/:id` | authority, admin | `slug` único, `type` article/video/link (video y enlace exigen `media_url` https), `cover_url` opcional con imagen subida, `is_published` (`published_at` se fija la primera vez), borrado lógico |
| `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/:id/invitation`, `GET /admin/areas` | **solo admin** | Lista paginada (`role`, `status`, `q`). Alta de `authority`/`admin`; `PATCH` cambia rol, área, nombre y `is_active` |

### Decisiones de diseño (Sprint 7)

- **D-01 implementada (propuesta → moderación).** Un usuario con cuenta propone un evento (`POST /events`, estado `pending`); una autoridad o admin lo ve en `/admin/eventos?estado=pending`, lo aprueba (`published`, ya aparece en la API pública y en la app), lo rechaza con motivo (`rejected`, el proponente lo ve en «Mis propuestas») o lo cancela. Solo `published` es público. La migración `1760600000006_event_moderation.js` añade `moderation_note`, `moderated_by` y `moderated_at` a `events` (no están en CLAUDE.md §10). La decisión sigue «abierta» en CLAUDE.md; el equipo debe trasladar este resultado allí.
- **Alta de usuarios por invitación, no por contraseña temporal.** `POST /admin/users` crea la cuenta con una contraseña aleatoria que **nadie conoce** y envía un correo con un enlace de un solo uso (48 h) a `/restablecer`, el mismo mecanismo de HU-T03; el admin nunca ve ni transmite una credencial y la respuesta no lleva ningún secreto. Si el correo falla, la cuenta se crea igual y la respuesta trae `meta.invitation_sent: false`; «Reenviar invitación» emite un enlace nuevo (invalida el anterior). En desarrollo el enlace sale en el log de la API (como la recuperación).
- **El rol se vuelve a leer en cada petición de `/admin`.** El JWT dura 15 min y lleva el rol con el que se emitió; `requireCurrentRole` consulta la cuenta, así que una cuenta desactivada (401) o degradada (403) pierde el acceso **al instante**, no a los 15 min. Es una consulta por petición al panel; las rutas públicas y de usuario siguen siendo sin estado. Cambiar rol, área o estado revoca además todos sus refresh tokens.
- **Sin quedarse sin administradores.** Dentro de la transacción se bloquean todos los admin activos y: un admin no puede quitarse a sí mismo el rol ni desactivarse (`409 SELF_PROTECTION`) y ningún cambio puede dejar cero admins activos (`409 LAST_ADMIN`; la regla es una función pura con pruebas).
- **Área de las autoridades.** `requireArea` existe, pero ni los reportes ni `destinations`/`events`/`edu_contents` tienen columna de área, así que **la autoridad gestiona todos los reportes y todo el contenido**; solo el admin gestiona usuarios y áreas. Para acotarlo por área haría falta añadir `area_id` a esas tablas (decisión pendiente del equipo).
- **Evidencias.** Nunca salen por una URL pública ni se entrega la ubicación del almacenamiento: la API devuelve `download_path` y el navegador pide la imagen con el token (`fetch` → `Blob` → `URL.createObjectURL`, revocada al salir del detalle). Por eso no se puede abrir en una pestaña con `<a href>`; el visor es un lightbox con foco atrapado, flechas y Escape.
- **Historial y reportes de solo lectura.** No existe ninguna ruta que modifique el contenido de un reporte (`PUT`/`PATCH`/`DELETE /admin/reports/:id` responden 404) y el trigger sigue rechazando `UPDATE`/`DELETE` del historial. Limpiar reportes de prueba exige desactivar un instante el trigger en una transacción (como hacen las pruebas de integración); nunca en producción.
- **Auditoría.** `admin.<recurso>.<acción>` (nivel `info`, pino) con `actorId`, `actorRole` e identificadores/enums/booleanos; descarta cualquier texto libre, así que las notas, descripciones y correos nunca llegan al log. Hay una prueba que lo comprueba.
- **Sin caché ni sin conexión.** Todo `/admin` es de red directa: el service worker no lo cachea (lleva credenciales) y la interfaz muestra «Sin conexión» en lugar de datos viejos; lo único que se guarda en la sesión del navegador son filtros en la URL.
- **Imágenes y límites.** Destinos, eventos, perfil y educación suben archivos con `POST /uploads/images`; el mapa se documenta en la sección siguiente y los avisos al proponente y al denunciante llegan en F9 (push).

## Mapa (Sprint 8 · F8)

Pantallas: `/mapa` (público), `/admin/mapa` (autoridad y admin), mini-mapa en `/admin/reportes/:id` y selector de ubicación en el formulario de reporte (paso 2), en el de destinos y en «Proponer un evento» (el formulario de administración de eventos conserva latitud y longitud manuales).

### Decisión: Leaflet + OpenStreetMap (ADR-09)

El equipo decidió usar **Leaflet + OpenStreetMap** porque Google exige una API key con facturación que no existe en el proyecto y sus términos no permiten guardar teselas sin conexión; con Leaflet todo es verificable y funciona offline de forma parcial. La decisión quedó registrada en `CLAUDE.md` §21 como ADR-09. Cambiar de proveedor es barato: solo `features/map/components/MapView.jsx` (y `SafeMapContainer.jsx`) conocen Leaflet; el resto habla con `MapView` por props (`markers`, `center`, `zoom`, `fitKey`, `selectedId`, `userPosition`, `picked`, `onPick`, `onSelect`, `offline`).

- **Atribución y política de OSM.** Se muestra «© OpenStreetMap contributors» con enlace a su licencia. Se usa el servidor estándar `tile.openstreetmap.org` con las cabeceras normales del navegador (sin `User-Agent` falso ni Referer vaciado), sin descarga masiva ni precarga: solo se piden las teselas que el usuario ve y el service worker guarda **solo las ya visitadas** (máx. 300, 7 días, solo respuestas 0/200). Para producción con tráfico real conviene un proveedor de teselas propio o contratado (la política de OSM no es para uso intensivo).
- **Paquetes.** `leaflet@1.9`, `react-leaflet@4.2` (compatible con React 18; la v5 exige React 19), `@react-leaflet/core@2.1` y `leaflet.markercluster@1.5`. Para el agrupamiento se evaluó `react-leaflet-cluster`: la v2 (compatible con react-leaflet 4) es CommonJS con `require` de PNG y CSS y reasigna los íconos por defecto de Leaflet; las v3+ requieren react-leaflet 5. Por eso se usa directamente `leaflet.markercluster` (el plugin mantenido que ambas envuelven) con una capa propia de ~50 líneas. El plugin extiende el `L` global, que se asigna en un módulo previo (`leafletGlobal.js`).
- **`SafeMapContainer`.** Sustituye a `MapContainer` de react-leaflet porque este crea el mapa en un *ref callback*: si React oculta y vuelve a mostrar un árbol bajo `Suspense` (p. ej. se pulsa «Ver detalle» y se vuelve atrás antes de que cargue la página), crea un segundo mapa sobre el mismo elemento («Map container is already initialized») y la pantalla queda en blanco. Se reprodujo en el navegador y hay una prueba de regresión. También cancela el temporizador de animación de zoom de Leaflet al desmontar.
- **Carga diferida.** `/mapa`, `/admin/mapa` y los mapas incrustados cargan el chunk `MapView` (Leaflet + plugin + CSS) bajo demanda; no forma parte del bundle inicial.
- **Íconos.** SVG propios (`markerIcons.js`), sin las imágenes por defecto de Leaflet: destino = gota azul (`#1f4fff`) con estrella; reporte público = insignia cuadrada con **anillo discontinuo** («aproximado») y un glifo y color por tipo; estados del mapa de autoridad = círculo con glifo por estado. La forma y el glifo distinguen, no solo el color.

### Privacidad del mapa (RNF03, ADR-04)

`GET /api/v1/map/pins` (público, `Cache-Control: public, max-age=60, stale-while-revalidate=300` + ETag; `bbox=minLng,minLat,maxLng,maxLat` y `limit` ≤ 500 opcionales):

- **Destinos:** publicados y no borrados, con coordenadas exactas (son lugares públicos).
- **Reportes:** solo `resolved` de tipos con `is_sensitive = false`. La coordenada se redondea **en SQL** con `ST_SnapToGrid(…, 0.005)` (~550 m): la original nunca llega a Node. El `bbox` se aplica al punto ya redondeado, de modo que filtrar por zona no sirve para localizar un reporte. Solo salen tipo, **mes y año** (no la fecha), un id opaco (hash SHA-256 truncado del uuid) y `approximate: true`. Nunca: descripción, evidencias, autor, folio, `client_uuid`, código de seguimiento ni el uuid real.
- La consulta pública lee `reports.location` solo a través de `ST_SnapToGrid`; una prueba lo verifica sobre el SQL y otra de integración comprueba que la coordenada original **no aparece** en el texto de la respuesta.

`GET /api/v1/admin/map/pins` (authority, admin; `private, no-store`; `status`, `type`, `bbox`, `limit`): todos los estados y tipos con coordenadas **exactas**, folio, tipo, estado y `detail_path`. Registra `admin.map.pins_viewed` con la cantidad, los filtros (enums) y si hubo `bbox`, sin coordenadas, folios ni identificadores de reportes. El service worker nunca lo guarda.

### Sin conexión (PWA-08)

`/api/v1/map/pins` usa stale-while-revalidate; las teselas ya visitadas, `CacheFirst` (`td-tiles-v1`). Sin red, si el SWR no tiene los pines, los destinos salen del espejo IndexedDB del catálogo (o de los de ejemplo) y los reportes no se muestran; el aviso dice «Sin conexión: mostrando solo los puntos guardados». Si además no hay teselas, el mapa pasa a un fondo neutro con el mismo aviso. La lista alternativa funciona siempre.

### Accesibilidad

El mapa es una región con nombre; los pines **no** son paradas de tabulación (ni los agrupamientos). La lista equivalente repite cada punto con «En el mapa» (abre su popup y centra) y «Ver detalle». Los controles de zoom, el cierre del popup y los selectores están en español. En escritorio el panel (capas, filtros, lista) va a la izquierda del mapa y los controles/filtros se alinean a la izquierda; los selectores dejan espacio para su flecha y no tocan el borde derecho.

### Pendiente / límites (F8)

- Los reportes públicos del mapa no se espejan en IndexedDB: sin red solo aparecen si el service worker ya guardó `/map/pins`.
- Teselas del servidor público de OSM: adecuado para desarrollo y demo; para producción hace falta un proveedor acorde al tráfico.
- El aviso push al cambiar el estado de un reporte se implementó en F9 (ver sección siguiente).

## Avisos push y Badging API (Sprint 9 · F9, PWA-16)

Cubre PWA-16, RF12 (aviso al cambiar el estado), RF22, HU-A04 y HU-T07 (recordatorio). Pantallas: `/notificaciones` (bandeja), interruptor «Recibir avisos» en `/perfil` y en la bandeja, y «Recibir avisos de este reporte» en la pantalla de éxito del reporte, en «Pendientes de envío» y en `/seguimiento` tras consultar un reporte.

### Variables de entorno

No hay `.env.example` versionado (decisión del equipo): se documentan aquí. Generar un par propio con `npm run vapid:generate` (en `backend/`); **nunca** se versiona la clave privada.

| Variable | Por defecto | Notas |
|---|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | claves **solo de desarrollo** fijas en `config/env.js` | Van juntas (las tres o ninguna). `VAPID_SUBJECT` es `mailto:` o `https:`. **Obligatorias y propias en producción**: la API no arranca con la clave de desarrollo (su parte privada es pública en el repositorio). Con claves fijas las suscripciones sobreviven a los reinicios |
| `PUSH_ALLOWED_HOSTS` | servicios conocidos en producción (FCM, Mozilla, Apple, Windows); cualquiera en desarrollo | Lista separada por comas de sufijos de host. Evita que `POST /push/subscriptions` convierta a la API en un cliente HTTP hacia un destino arbitrario (SSRF) |
| `PUSH_RATE_LIMIT_MAX` / `PUSH_RATE_LIMIT_WINDOW_MINUTES` | `30` / `60` | Límite de altas y bajas de suscripción por cliente |
| `REMINDERS_ENABLED` | `true` | `false` desactiva el recordatorio de eventos |
| `REMINDERS_INTERVAL_MINUTES` | `60` | Cada cuántos minutos corre el trabajo de recordatorios |

### Endpoints nuevos (bajo `/api/v1`)

| Método y ruta | Acceso | Qué hace |
|---|---|---|
| `GET /push/public-key` | público | Clave pública VAPID (`{ data: { public_key } }`) |
| `POST /push/subscriptions` | público; la sesión, si existe, vincula el dispositivo | Cuerpo de `PushSubscription.toJSON()`: `endpoint` (https, ≤ 1024), `keys.p256dh`, `keys.auth`. Idempotente por `endpoint` (`201` la primera vez, `200` después; al repetir, la sesión actual decide el dueño, así que un dispositivo que se registra sin sesión se desvincula de la cuenta anterior) |
| `DELETE /push/subscriptions` | público con prueba de posesión | `{ endpoint, auth }`: solo borra si el secreto `auth` coincide (comparación en tiempo constante). `404` idéntico para endpoint desconocido y secreto erróneo |
| `POST` / `DELETE /reports/follow` | público | `{ folio, tracking_code, endpoint }`: si folio + código son válidos (misma comprobación y mismo `404 REPORT_NOT_FOUND` genérico que `/reports/track`, **con el mismo presupuesto de intentos**) liga el reporte al **dispositivo** (`report_followers`), no a una persona. `404 SUBSCRIPTION_NOT_FOUND` si el dispositivo aún no se suscribió |
| `GET /me/notifications?page&limit&unread` | sesión | Bandeja paginada del propio usuario con `unread_count` |
| `PATCH /me/notifications/:id/read` | sesión | Marca una como leída (idempotente); `404` si es de otra persona |
| `POST /me/notifications/read-all` | sesión | Marca todas como leídas |

### Quién recibe qué

- **Cambio de estado de un reporte** (`PATCH /admin/reports/:id/status`): seguidores anónimos del reporte (push) y, si el reporte tiene `reporter_id`, fila en la bandeja + push a sus dispositivos. El mensaje es «Tu reporte TD-… cambió de estado · Ahora está «en revisión»»; **nunca** lleva la nota interna, el código, ubicación ni descripción.
- **Moderación de un evento** (`PATCH /admin/events/:id/moderation`): al proponente al aprobar o rechazar; al cancelar, al organizador y a todos los asistentes (salvo quien cancela).
- **Recordatorio**: a quienes marcaron «Asistiré», cuando un evento `published` empieza en menos de 24 h. Tabla `event_reminders` (migración `1760600000007_event_reminders.js`, que también añade un índice a `notifications`): el trabajo reclama filas con `INSERT … ON CONFLICT DO NOTHING`, así que es idempotente aunque se repita o haya varias instancias; además usa `pg_try_advisory_lock` para no correr dos veces a la vez y se detiene limpiamente al apagar la API.
- Envío en segundo plano **después** del commit: la respuesta HTTP nunca espera al servicio push. Concurrencia limitada (8), tiempo máximo de 10 s por envío, TTL de 24 h (6 h en recordatorios). `404`/`410` del servicio push borran la suscripción; otros errores se registran **sin** payload ni endpoint.

### Decisiones

- **Seguimiento anónimo: endpoint propio, no un campo en `POST /reports`.** Con Background Sync el reporte puede enviarse con la app cerrada, cuando no hay página que pida permiso ni suscripción garantizada. Un `follow` posterior (desde la pantalla de éxito, «Pendientes de envío» o «Seguimiento») funciona igual para todos los caminos, no cambia el contrato idempotente de `POST /reports` y la prueba de posesión (folio + código) es la misma que ya existía. El código se usa solo en memoria para esa petición y no se guarda en ningún almacenamiento nuevo.
- **Sin vinculación de identidad (ADR-03).** `report_followers` liga reporte ↔ suscripción; una suscripción sin cuenta tiene `user_id` NULL.
- **Una suscripción rota por el navegador** (`pushsubscriptionchange`) se renueva en el service worker y se registra sin sesión; la página la vuelve a vincular a la cuenta al abrirse. Los seguimientos de reportes de la suscripción vieja se pierden (hay que volver a pulsar «Recibir avisos de este reporte»).
- **Badging API.** El número del ícono de la app instalada es `unread_count` para quien tiene cuenta (el push lo trae en `badge`); para un dispositivo anónimo cada push suma uno y se limpia al abrir la app. Navegadores sin la API simplemente no lo muestran.
- **Sin dependencia de cron.** Se usa un temporizador (`setInterval`, `unref`) con bloqueo asesor en PostgreSQL: menos dependencias y seguro con varias instancias.

### Límites por plataforma

- **iOS/iPadOS (16.4+):** Web Push **solo funciona con la app instalada** («Compartir → Agregar a pantalla de inicio»); en una pestaña de Safari no existe `PushManager`. La interfaz detecta iOS fuera del modo `standalone` y muestra la guía «Instala la app para recibir avisos». La Badging API también exige la app instalada.
- **Android/Chrome:** funciona en pestaña e instalada; el servicio es FCM (requiere internet en el dispositivo). Chrome no admite Push en incognito.
- **Firefox escritorio:** push sí; Badging API no. **Safari macOS 13+:** push sí.
- **Permiso denegado:** el navegador no vuelve a preguntar; la interfaz explica cómo reactivarlo desde el candado de la barra de direcciones.
- **No verificado aquí:** el envío real a FCM/Mozilla/APNs y la notificación con el navegador cerrado (ver la entrega de F9).

## Estructura

```
backend/   API Express (ESM) en /api/v1
frontend/  React + Vite + PWA (service worker propio en src/sw.js)
docs/      uso de IA, evidencias, trazabilidad y fuentes
```
