# Evidencias

Capturas, videos y reportes de Lighthouse que respaldan cada característica PWA.

## Convención de nombres

`PWA-XX_descripcion.ext`, donde `XX` es el número de la característica (01–16).

Ejemplos:

- `PWA-06_service-worker-activado.png`
- `PWA-09_manifest-devtools.png`
- `PWA-12_lighthouse-v0.1.0.html`
- `PWA-13_cola-reportes-offline.mp4`

Los reportes de Lighthouse se guardan por release (`PWA-12_lighthouse-vX.Y.Z.html`).

## Qué capturar para el almacenamiento y el modo sin conexión (F4)

Haz las capturas con la app construida (`npm run build && npm run preview`) y la API levantada, en Chrome. Primero navega online: Explorar, un destino, Eventos y Educación, para que se llenen las cachés.

### PWA-05 · Almacenamiento local

| Captura | Dónde | Qué debe verse |
|---|---|---|
| `PWA-05_indexeddb-stores.png` | DevTools > Application > Storage > IndexedDB > `tudestino` | Los stores `destinations`, `events`, `edu`, `favorites`, `outbox` y `meta` (versión 1) |
| `PWA-05_indexeddb-destinations.png` | Mismo panel, store `destinations` | 8 registros con `key` = slug y `data` con el destino |
| `PWA-05_indexeddb-meta-sync.png` | Store `meta` | Las claves `sync:destinations`, `sync:events` y `sync:edu` con su fecha |
| `PWA-05_indexeddb-favoritos.png` | Store `favorites` tras tocar un corazón | El slug del destino guardado (con sesión, además aparece en el servidor) |
| `PWA-05_localstorage.png` | Application > Local storage | `td.theme`, `td.installDismissed` y `td:session` (solo una marca, nunca el token). SessionStorage guarda el borrador del formulario de reportes (`td:report-draft`) |

### PWA-07 · Cache API

| Captura | Dónde | Qué debe verse |
|---|---|---|
| `PWA-07_cache-storage.png` | Application > Cache Storage | `workbox-precache-v2-…`, `td-api-v1` y `td-images-v1` |
| `PWA-07_td-api-entradas.png` | Cache Storage > `td-api-v1` | `/api/v1/destinations?limit=50`, `/api/v1/events?limit=50`, `/api/v1/edu-contents?limit=50`, `/api/v1/edu-categories` y destinos vistos. No debe haber `/auth`, `/me` ni `/reviews` |
| `PWA-07_network-swr.png` | Network, recargando Explorar | Las lecturas públicas marcadas “(ServiceWorker)” y, después, la petición de revalidación |
| `PWA-07_network-only.png` | Network, iniciando sesión | `/auth/login` y `/me` pasan directo a la red (sin caché) |
| `PWA-07_imagenes-cache-first.png` | Cache Storage > `td-images-v1` (imágenes de Cloudinary cuando existan) | Entradas de imagen; el límite es ~150 entradas y 30 días |
| `PWA-06_service-worker-activado.png` | Application > Service Workers | Estado “activated and is running”; al publicar una versión nueva, el aviso “Hay una nueva versión disponible” |

### PWA-08 · Funcionamiento offline

Video corto (`PWA-08_offline-demo.mp4`) y capturas:

1. DevTools > Network > **Offline** (o modo avión), recargar `/explorar`: lista completa y el aviso **“Sin conexión · mostrando datos guardados · Última sincronización: …”** (`PWA-08_explorar-offline.png`).
2. Buscar “espiritu” sin acento: aparece “Isla Espíritu Santo” (`PWA-08_busqueda-offline.png`).
3. Abrir un destino visto antes: detalle completo; las reseñas dicen que necesitan conexión (`PWA-08_detalle-offline.png`).
4. `/eventos` (lista y calendario) y `/educacion` con búsqueda (`PWA-08_eventos-offline.png`, `PWA-08_educacion-offline.png`).
5. “Cerca de mí” (con permiso de ubicación): la lista se ordena con distancias sin conexión (`PWA-08_cerca-de-mi-offline.png`, evidencia también de PWA-14).
6. Con sesión y sin conexión, el botón “Asistiré” aparece deshabilitado con el aviso “Necesitas conexión…” (`PWA-08_asistencia-offline.png`).

### PWA-14 y PWA-15

- `PWA-14_cerca-de-mi.png`: lista ordenada por distancia (online y offline).
- `PWA-15_compartir-evento.png`: hoja de compartir del móvil (o el aviso “Enlace copiado” en escritorio) en un destino y en un evento. Requiere HTTPS o `localhost` y, para la hoja nativa, un móvil real.

## Qué capturar para los reportes (F5)

Con la app construida (`npm run build && npm run preview`), la API levantada (`STORAGE_DRIVER=local` basta) y Chrome. Para Background Sync usa una ventana normal: algunos perfiles de invitado o automatizados deniegan el permiso `background-sync`.

### PWA-13 · Background Sync

Video corto `PWA-13_reporte-offline-a-sync.mp4` con el recorrido de la demo (offline → cola → sync):

1. Abrir `/reportar` con red y esperar a que el service worker esté activo (DevTools > Application > Service Workers).
2. DevTools > Network > **Offline**. Crear un reporte completo (tipo, foto, ubicación, descripción) y enviarlo: aparece **«Guardado en tu dispositivo · Se enviará cuando haya conexión»** (`PWA-13_guardado-offline.png`).
3. Abrir **Pendientes de envío**: el reporte en estado «En cola» y la insignia numérica en la pestaña «Reportar» (`PWA-13_pendientes-en-cola.png`).
4. DevTools > Application > IndexedDB > `tudestino` > `outbox`: la entrada con `status: queued` y las fotos como bytes (`PWA-13_indexeddb-outbox.png`). En Application > Background services > Background sync, la etiqueta `reports-outbox` (`PWA-13_background-sync-tag.png`).
5. Desmarcar **Offline**: el reporte pasa a «Enviado» y muestra folio y código de seguimiento (`PWA-13_enviado-tras-reconectar.png`); en Network solo hay **una** petición `POST /api/v1/reports` (`PWA-13_network-un-solo-post.png`).
6. En `/seguimiento`, folio + código: línea de tiempo con «Pendiente · Reporte recibido» (`PWA-13_seguimiento.png`).
7. Opcional, con la app cerrada: en Application > Service Workers, el botón **Sync** (etiqueta `reports-outbox`) dispara el evento del worker y se envía la cola sin ninguna pestaña de la app abierta.
8. Sin soporte de Background Sync (Safari/Firefox) el mismo recorrido funciona con el evento `online`, al abrir la app o con «Reintentar ahora» (menciónalo en el documento técnico).

### PWA-14 · Geolocation (reporte)

- `PWA-14_reporte-ubicacion-concedida.png`: paso 2 con «Ubicación lista · precisión de unos N m» y las coordenadas rellenas.
- `PWA-14_reporte-ubicacion-denegada.png`: con el permiso bloqueado (candado de la barra de direcciones), el mensaje «No diste permiso…» y las alternativas (coordenadas a mano y destino cercano).

### Privacidad (RNF03, ADR-03)

- `PRIV_foto-sin-exif.png`: la misma foto con GPS antes y después (por ejemplo `exiftool`): el archivo guardado en `backend/uploads/reports/` es WebP y no tiene metadatos.
- `PRIV_tablas-sin-ip.png`: `\d reports` en `psql`: no hay columnas de IP ni user-agent; `reporter_id` es NULL en los reportes anónimos.

Las comprobaciones automatizadas con Playwright (offline real con `context.setOffline(true)`, inspección de Cache Storage e IndexedDB, ausencia de desbordamiento horizontal en 360 y 1280 px) se describen en la entrega de F4; los scripts viven fuera del repositorio y no son dependencia del proyecto.

## Qué capturar para el panel de autoridad (F7)

Capturas ya incluidas (tomadas con Chrome sobre el build real, una API con PostgreSQL y datos de prueba que se borraron después):

| Archivo | Qué muestra |
|---|---|
| `F7_panel-resumen-1280.png` | Resumen con contadores por estado y propuestas por revisar; barra lateral (escritorio ≥ 1024 px) |
| `F7_reportes-tabla-1280.png` | Tabla de reportes con filtros por estado y tipo y búsqueda por folio (HU-A02) |
| `F7_reporte-detalle-evidencia-1280.png` | Detalle: tipo, ubicación con «Abrir en mapa», reportante anónimo, evidencia cargada con sesión (HU-A03) |
| `F7_reporte-historial-1280.png` | Historial en línea de tiempo con la nota y la autoridad tras un cambio de estado (HU-A04) |
| `F7_eventos-moderacion-1280.png` | Cola de moderación de propuestas (aprobar / rechazar / cancelar) |
| `F7_usuarios-1280.png` | Usuarios: alta por invitación, rol, área y desactivar con confirmación (HU-A08) |
| `F7_reportes-tarjetas-360.png`, `F7_cambiar-estado-360.png` | Móvil de 360 px: menú compacto, tarjetas y diálogo de cambio de estado |

Capturas manuales que faltan para el documento técnico:

- `F7_evidencia-sin-sesion-401.png`: en DevTools > Network, abrir la URL de una evidencia sin sesión (401) y con sesión (200, `Cache-Control: private, no-store`).
- `F7_historial-inmutable.png`: en `psql`, `UPDATE report_status_history SET note = 'x'` y `DELETE` fallan con «append-only».
- `F7_blob-url-revocada.png`: `chrome://blob-internals` antes y después de salir del detalle: las URL `blob:` se revocan.
- `F7_log-auditoria.png`: el log de la API con `audit: "admin.report.status_changed"` y sin la nota ni datos personales.

Para repetir el recorrido: levanta la API (`DATABASE_URL=… PORT=3100 npm start`), construye el frontend y sírvelo con `API_PROXY_TARGET=http://localhost:3100 npx vite preview --port 4273`; entra con `authority@`, `admin@` y `user@dev.tudestino.local`. Los datos de prueba de reportes se borran en una transacción que desactiva un instante el trigger de solo inserción del historial (el mismo mecanismo de la limpieza de las pruebas de integración); nunca se hace en producción.

## Qué capturar para el mapa (F8)

Capturas incluidas (Chrome sobre el build real; **las teselas se simularon con un PNG liso** porque la verificación no depende de internet, así que el fondo es un color uniforme y no el mapa de OpenStreetMap; con conexión real se ven las calles):

| Archivo | Qué muestra |
|---|---|
| `F8_mapa-1280.png` | `/mapa` en escritorio: panel con capas, filtros, «Mi ubicación», leyenda y lista; mapa con pines de destino, agrupamientos y el punto del usuario (HU-T13, PWA-14) |
| `F8_mapa-360.png` | Móvil de 360 px: mapa, atribución y lista debajo |
| `F8_mapa-offline-sin-teselas-1280.png` | Sin conexión y sin teselas guardadas: fondo neutro, «Sin conexión: mostrando solo los puntos guardados» y la lista (PWA-08) |
| `F8_mapa-offline-con-teselas-1280.png` | Sin conexión con teselas ya visitadas servidas desde `td-tiles-v1` |
| `F8_selector-ubicacion-360.png` | Paso 2 del reporte con el mapa para ajustar el punto y los campos de coordenadas a mano |
| `F8_admin-reporte-mini-mapa-1280.png` | Detalle de un reporte con mini-mapa en la posición exacta y el enlace externo a OpenStreetMap |
| `F8_admin-destino-selector-1280.png` | Formulario de destino con el selector de ubicación |

Capturas manuales que faltan para el documento técnico:

- `F8_mapa-osm-real.png`: `/mapa` con conexión real (teselas de OpenStreetMap y atribución «© OpenStreetMap contributors»).
- `F8_tiles-cache.png`: DevTools > Application > Cache Storage > `td-tiles-v1` (≤ 300 entradas) y `td-api-v1` con `/api/v1/map/pins` y **sin** ninguna URL `/admin/`.
- `F8_pins-publicos-red.png`: DevTools > Network > `/api/v1/map/pins`: coordenadas redondeadas, `approximate: true`, sin folio ni descripción.
- `F8_pins-admin-401.png`: `/api/v1/admin/map/pins` sin sesión (401) y con sesión (coordenadas exactas, `Cache-Control: private, no-store`).

## Qué capturar para los avisos push y el badge (F9, PWA-16)

Requisitos: app construida y servida por HTTPS o `localhost`, API con VAPID (las claves de desarrollo bastan en local), Chrome en una **ventana normal** (Chrome no admite Push en incognito ni en perfiles de invitado) y, para el badge, la app **instalada** (Chrome ▸ Instalar).

Capturas manuales para el documento técnico:

| Archivo sugerido | Qué muestra |
|---|---|
| `PWA-16_permiso.png` | El diálogo del navegador «TuDestino quiere mostrar notificaciones» tras pulsar «Recibir avisos» (el permiso **no** se pide al cargar la página) |
| `PWA-16_interruptor-activado.png` | Perfil con «Recibir avisos · Activados en este dispositivo» |
| `PWA-16_permiso-denegado.png` | Guía «Los avisos están bloqueados» con las instrucciones para reactivarlos |
| `PWA-16_ios-instalar.png` | En Safari de iPhone sin instalar: «Instala la app para recibir avisos» |
| `PWA-16_suscripcion-devtools.png` | DevTools > Application > Service Workers (worker activo) y, en la consola, `(await (await navigator.serviceWorker.ready).pushManager.getSubscription()).endpoint` |
| `PWA-16_notificacion-recibida.png` | La notificación del sistema «Tu reporte TD-… cambió de estado» tras cambiar el estado desde el panel de autoridad |
| `PWA-16_push-devtools.png` | DevTools > Application > Service Workers > campo **Push** con un JSON de ejemplo (`{"title":"Prueba","body":"Hola","url":"/","tag":"t"}`): prueba el listener sin servidor |
| `PWA-16_badge-icono.png` | El ícono de la app instalada con el número de no leídas (barra de tareas, dock o pantalla de inicio) |
| `PWA-16_bandeja-1280.png`, `PWA-16_bandeja-360.png` | `/notificaciones` con elementos sin leer, «Marcar todas como leídas» y la campana con su número |
| `PWA-16_seguir-reporte.png` | «Recibir avisos de este reporte» en la pantalla de éxito y la confirmación «Te avisaremos en este dispositivo…» |
| `PWA-16_recordatorio.png` | Notificación «Recordatorio de evento» (usa un evento `published` que empiece en menos de 24 h y una cuenta con «Asistiré») |
| `PWA-16_sin-datos-sensibles.png` | El cuerpo del push descifrado o el log de la API: sin la nota interna, el código ni coordenadas |

Guion de la demo (se encadena con el de Background Sync):

1. Instalar la app, abrir **Perfil** e iniciar sesión; activar **Recibir avisos** (permiso → «Activados»).
2. En modo avión crear un reporte (queda en cola); al volver la conexión se envía. En «Pendientes de envío» pulsar **Recibir avisos de este reporte** y guardar el código.
3. En otra ventana, entrar como autoridad y cambiar el estado del reporte a «En revisión».
4. En el dispositivo aparece la notificación; tocarla abre `/seguimiento?folio=…` con la línea de tiempo y el número del ícono cambia.
5. Abrir **Notificaciones** (campana): marcar como leída y ver cómo el número baja a cero.

Verificación automatizada (scripts fuera del repositorio, Playwright sobre Chrome real): ver la entrega de F9. **No** se pudo automatizar la entrega real por FCM/Mozilla/APNs, la notificación con el navegador cerrado ni iOS real; usa el guion manual anterior con un teléfono para esas capturas.
