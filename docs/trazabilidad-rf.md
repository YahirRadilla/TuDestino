# Trazabilidad RF → pantalla → endpoint

Se completa a medida que avanzan los sprints. Estados: Pendiente · Parcial · Hecho.

| RF | Requisito | Pantalla | Endpoint | Estado |
|---|---|---|---|---|
| RF01 | Consultar destinos | `/`, `/explorar`, `/destinos/:slug` | `GET /destinations`, `GET /destinations/:slug` | Hecho (Inicio y Explorar comparten catálogo; API + respaldo local sin conexión) |
| RF02 | Consultar playas y ANP | `/explorar` | `GET /destinations?category=`, `GET /destination-categories` | Hecho (API + respaldo local sin conexión) |
| RF03 | Consultar educación ambiental | `/educacion` | `GET /edu-contents`, `GET /edu-categories` | Hecho (búsqueda y filtros por tipo: Todo, Artículos, Videos y Enlaces; sin conexión desde IndexedDB) |
| RF04 | Eventos (lista y calendario) | `/eventos`, `/eventos/:id` | `GET /events`, `GET /events/:id` | Hecho (lista, calendario mensual accesible, detalle; sin conexión desde IndexedDB) |
| RF05 | Crear reportes (turistas y ciudadanos, también sin cuenta) | `/reportar` (3 pasos), `/reportar/pendientes` | `POST /reports` (multipart, idempotente por `client_uuid`) | Hecho |
| RF06 | Tipos de reporte (tortuga anidando, animal varado, contaminación, actividad sospechosa y «Otro» adicional) | `/reportar` paso 1 | `GET /report-types` (solo slug y nombre; `is_sensitive` no se expone) | Hecho (lista local de respaldo sin conexión, también con «Otro») |
| RF07 | Fotos de evidencia (hasta 4 de 5 MB) | `/reportar` paso 2 | `POST /reports` (campo `photos`; magic bytes, re-codificación WebP sin EXIF; `report_evidences`) | Hecho (la autoridad las consulta en F7; no hay ruta pública de evidencias) |
| RF08 | Ubicación aproximada | `/reportar` paso 2 (Geolocation, coordenadas a mano o destino cercano) | `POST /reports` (`lat`, `lng`, `accuracy_m`, `destination_slug`) | Hecho |
| RF09 | Reporte anónimo | `/reportar` paso 3 (interruptor, activo por defecto sin sesión) | `POST /reports` (`anonymous=true` ignora el token: `reporter_id` NULL; sin IP ni user-agent) | Hecho |
| RF10 | Autoridad consulta reportes | `/admin/reportes` (tabla en escritorio, tarjetas en móvil; filtros por estado y tipo, búsqueda por folio, paginación), `/admin/reportes/:id` | `GET /admin/reports`, `GET /admin/reports/:id` | Hecho |
| RF11 | Autoridad revisa evidencias | `/admin/reportes/:id` (galería y lightbox accesible) | `GET /admin/reports/:id/evidences/:evidenceId` (solo `authority`/`admin`; `Cache-Control: private, no-store`) | Hecho |
| RF12 | Autoridad cambia estado | `/admin/reportes/:id` (diálogo con nota obligatoria) | `PATCH /admin/reports/:id/status` | Hecho (máquina de estados, transacción con bloqueo de fila, historial de solo inserción; F9: aviso push y bandeja al reportante y a los seguidores, sin la nota interna) |
| RF13 | Administrar destinos | `/admin/destinos` | `GET`/`POST /admin/destinations`, `GET`/`PATCH`/`DELETE /admin/destinations/:id`, `POST /uploads/images?purpose=destination` | Hecho (borrador/publicado, borrado lógico, imágenes subidas) |
| RF14 | Administrar eventos | `/admin/eventos` | `GET`/`POST /admin/events`, `GET`/`PATCH`/`DELETE /admin/events/:id`, `POST /uploads/images?purpose=event` | Hecho (sin fechas pasadas al crear, imagen subida opcional, borrado lógico) |
| RF15 | Administrar contenido educativo | `/admin/educacion` | `GET`/`POST /admin/edu-contents`, `GET`/`PATCH`/`DELETE /admin/edu-contents/:id`, `POST /uploads/images?purpose=education` | Hecho (publicar/despublicar, portada subida, borrado lógico) |
| RF16 | Usuarios y permisos | `/login`, `/registro`, `/admin/usuarios` (solo `admin`) | `POST /auth/*`, `GET`/`POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/:id/invitation`, `GET /admin/areas`, `requireRole`/`requireCurrentRole` | Hecho (alta por invitación, rol/área, desactivar revoca sesiones, siempre queda un admin activo) |
| RF17 | Ver y editar perfil | `/perfil`, `/perfil/eventos`, `/perfil/resenas` | `GET /me`, `PATCH /me`, `GET /me/events`, `GET /me/reviews`, `POST /uploads/images?purpose=avatar` | Hecho (nombre y avatar subido, “Mis eventos”, “Mis reseñas”, “Mis favoritos”) |
| RF18 | Búsqueda | `/explorar`, `/educacion`, `/mapa` | `GET /destinations?q=` (y `near=`, aún en la API), `GET /edu-contents?q=` | Hecho (API; sin conexión: búsqueda local sin acentos. «Mi ubicación» y el orden por distancia están en `/mapa`; Explorar ya no muestra «Cerca de mí») |
| RF19 | Favoritos | `/favoritos`, corazón en tarjetas y detalle | `GET /me/favorites`, `PUT`/`DELETE /me/favorites/:slug` | Hecho (con sesión: servidor + copia en IndexedDB, UI optimista con reversión; sin sesión: IndexedDB y fusión sin duplicados al iniciar sesión) |
| RF20 | Organizar eventos (D-01) | `/eventos`, `/eventos/proponer`, `/perfil/propuestas`, `/admin/eventos` (cola de moderación) | `PUT`/`DELETE /events/:id/attendance`, `POST /events` (propuesta `pending`), `GET /me/events/proposed`, `PATCH /admin/events/:id/moderation` (`approve`/`reject`/`cancel`), `POST /uploads/images?purpose=event` | Hecho (propuesta → moderación → público; incluye selector de mapa e imagen subida; el rechazo guarda el motivo y lo ve quien propuso) |
| RF21 | Compartir destinos y eventos | `/eventos`, `/eventos/:id` |  | Parcial (Web Share + copiar enlace en eventos; el botón de compartir se retiró del detalle de destino en la revisión de interfaz) |
| RF22 | Seguimiento de reporte por folio | `/seguimiento` (línea de tiempo accesible) | `POST /reports/track` (folio + código; 404 idéntico si falla cualquiera) | Hecho (consulta por folio; F9: «Recibir avisos de este reporte» con `POST /reports/follow` y push al cambiar el estado) |
| RF23 | Reportes sin conexión con envío diferido | `/reportar`, `/reportar/pendientes` | `POST /reports` (reintentos idempotentes por `client_uuid`) | Hecho (outbox en IndexedDB + Background Sync + respaldo `online`/apertura/botón) |

## Historias de usuario de identidad (Sprint 3 · F3)

| HU | Historia | Pantalla | Endpoint | Pruebas |
|---|---|---|---|---|
| HU-T01 | Registro | `/registro` | `POST /auth/register` | `auth.integration` (duplicado 409, contraseña débil 400), `AuthPages.test` |
| HU-T02 | Login (error genérico) | `/login` | `POST /auth/login` | `auth.integration` (mismo cuerpo para correo inexistente y clave incorrecta), `authService.test` |
| HU-T03 | Recuperar contraseña | `/recuperar`, `/restablecer` | `POST /auth/forgot`, `POST /auth/reset` | `auth.integration` (respuesta idéntica, un solo uso, vencido, revoca sesiones) |
| HU-T04 | Logout | `/perfil` (Cerrar sesión) | `POST /auth/logout` | `auth.integration` (revoca en servidor), `AuthProvider.test` |
| HU-T10 | Perfil | `/perfil` | `GET /me` | `auth.integration`, `ProfilePage.test` (favoritos locales; eventos y reseñas pendientes) |
| HU-T11 | Editar perfil | `/perfil` | `PATCH /me` | `auth.integration` (rol/correo rechazados), `ProfilePage.test` |
| HU-A01 | Login al panel (solo `authority` y `admin`) | `/admin/*` | `requireRole('authority','admin')` + `requireCurrentRole` (relee la cuenta) | `auth.integration` (RBAC), `RouteGuards.test`, `admin.integration` (401/403, cuenta desactivada o degradada con token vigente), `AdminLayout.test` |

## Historias de usuario del catálogo (Sprint 4 · F4)

| HU | Historia | Pantalla | Endpoint | Pruebas |
|---|---|---|---|---|
| HU-T05 | Ver destinos (promedio, detalle con reseñas, filtro por categoría) | `/`, `/explorar`, `/destinos/:slug` (Inicio y Explorar comparten catálogo) | `GET /destinations`, `GET /destinations/:slug`, `GET /destinations/:slug/reviews` | `api.integration`, `engagement.integration` (reseñas sin autor), `DestinationDetailPage.test`, `ExplorePage.test` (incluye sin conexión; promedio y conteo solo con reseñas reales y ocultos si `reviews_count` es 0) |
| HU-T06 | Ver eventos en lista y calendario | `/eventos`, `/eventos/:id` | `GET /events`, `GET /events/:id` | `engagement.integration`, `calendar.test`, `EventsPage.test`, `EventDetailPage.test` |
| HU-T07 | Asistir a eventos y “Mis eventos” | `/eventos`, `/perfil/eventos` | `PUT`/`DELETE /events/:id/attendance`, `GET /me/events` | `engagement.integration` (idempotencia, 409 `EVENT_NOT_OPEN`, 401), `EventsPage.test` (optimista y reversión), `MyActivityPages.test` |
| HU-T08 | Educación ambiental con búsqueda y filtros | `/educacion` | `GET /edu-contents`, `GET /edu-categories` | `EducationPage.test`, `mediaEmbed.test` (solo https; `loading="lazy"` en iframes). Filtros solo por tipo: Todo, Artículos, Videos y Enlaces |
| HU-T10 | Perfil: Mis eventos, Mis reseñas, Mis favoritos | `/perfil/*`, `/favoritos` | `GET /me/events`, `GET /me/reviews`, `GET /me/favorites` | `engagement.integration`, `MyActivityPages.test`, `FavoritesPage.test` |
| HU-T12 | Reseñar (1–5 estrellas, publicación inmediata, autor oculto) | `/destinos/:slug` | `POST /destinations/:slug/reviews` (409 si repite), `PUT /destinations/:slug/reviews/me` (crear o reemplazar) | `engagement.integration` (contadores consistentes con escritores concurrentes, sin `user_id`), `ReviewForm.test`, `ReviewsSection.test` |

## Reportes ciudadanos (Sprint 5 · F5)

| HU / ítem | Historia o requisito | Pantalla | Endpoint | Pruebas |
|---|---|---|---|---|
| HU-T09 | Crear reporte: tipo, descripción, varias fotos, geolocalización; anónimo sin vincular usuario; genera folio | `/reportar`, pantalla de éxito con folio y código | `POST /reports`, `GET /report-types` | `reports.integration` (anónimo con token ⇒ `reporter_id` NULL, con sesión ⇒ vinculado, folio `TD-AAAA-NNNNNN`, solo se guarda el hash del código), `ReportForm.test`, `ReportPage.test` |
| RNF03 / ADR-03 | Sin IP ni user-agent; EXIF eliminado; logs sin cuerpo ni query | — | — | `reports.integration` (columnas, logs, fotos con GPS ⇒ salida sin metadatos), `imageService.test` (fixture con GPS verificado con `exifr`) |
| Idempotencia | Un reintento con el mismo `client_uuid` devuelve el mismo folio y no duplica filas ni fotos | — | `POST /reports` (200, `tracking_code: null`, `replayed: true`) | `reports.integration` (reintento y 6 peticiones concurrentes ⇒ 1 fila, 1 juego de archivos), `reportSender.test` |
| Atomicidad | Reporte + evidencias + historial inicial en una transacción; los archivos huérfanos se limpian | — | — | `reports.integration` (fallo del almacenamiento ⇒ rollback y archivos borrados) |
| RF22 | Seguimiento por folio + código | `/seguimiento` | `POST /reports/track` | `reports.integration` (404 idéntico, límite de tasa, sin autor ni evidencias), `TrackingPage.test` |
| RF23 | Cola de reportes sin conexión | `/reportar/pendientes` | — | `outbox.test`, `reportQueue.test`, `submitReport.test`, `PendingReportsPage.test`, `OutboxSync.test`, Playwright (modo avión → cola → envío una sola vez) |

## Panel de autoridad y administración (Sprint 7 · F7)

| HU / ítem | Historia o requisito | Pantalla | Endpoint | Pruebas |
|---|---|---|---|---|
| HU-A02 | Tabla de reportes con filtros por estado y tipo y búsqueda por folio | `/admin/reportes` | `GET /admin/reports?status=&type=&folio=&page=` | `admin.integration` (filtros, folio exacto/prefijo, comodines rechazados, paginación, sin secretos), `ReportsListPage.test` (tabla en escritorio, tarjetas en móvil, filtros en la URL) |
| HU-A03 | Detalle con galería de evidencias e historial | `/admin/reportes/:id` | `GET /admin/reports/:id`, `GET /admin/reports/:id/evidences/:evidenceId` | `admin.integration` (anónimo ⇒ `reporter: null` y nunca `reporter_id`, evidencia solo autenticada, no sirve la evidencia de otro reporte, sin ruta pública), `ReportDetailPage.test` (blob URL con sesión, revocación al desmontar, lightbox con teclado y foco atrapado), `Modal.test` |
| HU-A04 | Cambiar estado con nota obligatoria; historial inmutable con fecha y autor | `/admin/reportes/:id` (diálogo) | `PATCH /admin/reports/:id/status` | `admin.integration` (409 `INVALID_TRANSITION`, nota 3–1000, `changed_by`, concurrencia sin pérdida de actualizaciones, `UPDATE`/`DELETE` del historial rechazados, sin ruta para editar el reporte), `reportTransitions.test`, `adminServices.test` (rollback), `StatusChangeModal.test` |
| HU-A05 | CRUD de destinos (borrado lógico, imágenes, categoría, coordenadas) | `/admin/destinos` | `/admin/destinations` | `admin.integration` (slug único generado, 409 `SLUG_TAKEN`, borrador fuera de lo público, borrado lógico), `adminValidators.test`, `formValidation.test`, `DestinationsAdminPage.test` |
| HU-A06 | CRUD de eventos; sin fechas pasadas al crear | `/admin/eventos` | `/admin/events`, `PATCH /admin/events/:id/moderation` | `admin.integration` (fecha pasada 400, propuesta → aprobación visible en lo público, rechazo con motivo, 409 al repetir), `eventForm.test`, `EventsAdminPage.test`, `EventProposals.test` (la propuesta pública permite elegir la ubicación en el mapa; el formulario de administración conserva latitud/longitud manuales) |
| HU-A07 | CRUD de contenido educativo; se puede despublicar | `/admin/educacion` | `/admin/edu-contents` | `admin.integration` (video sin URL 400, publicar/despublicar, `published_at` estable), `EducationAdminPage.test` |
| HU-A08 | Gestión de usuarios: alta de administradores, revocar acceso, rol y área | `/admin/usuarios` | `/admin/users`, `/admin/areas` | `admin.integration` (alta sin contraseña en la respuesta + invitación por correo, desactivar revoca todos los refresh tokens, no auto-degradarse, 403 a autoridades), `adminServices.test` (`LAST_ADMIN`, `SELF_PROTECTION`), `UsersAdminPage.test` |
| HU-T06 / HU-T07 | Eventos en lista y calendario; asistir (solo los `published` son públicos) | `/eventos` | `GET /events` | `admin.integration` (pendientes, rechazados, cancelados y borrados no aparecen), `EventsPage.test` |
| RNF03 | Un reporte anónimo no revela a su autor ni a la autoridad | `/admin/reportes/:id` | `GET /admin/reports/:id` | `admin.integration`, `reports.integration` |
| RNF05 | Control de acceso en el servidor | `/admin/*` | `authenticate` + `requireRole` + `requireCurrentRole`, límites de tasa | `admin.integration`, `adminServices.test` (401/403 sin tocar la base) |
| RNF07 | Historial inmutable | — | trigger `report_status_history_no_update_delete` | `admin.integration`, `schema.integration` |

## Matriz de características PWA (F4)

La matriz oficial vive en `CLAUDE.md` sección 20; aquí se mantiene el detalle del estado real por fase.

| Ítem | Implementación | Prueba | Evidencia a capturar | Estado |
|---|---|---|---|---|
| PWA-05 Almacenamiento local | `frontend/src/storage/db.js` (IndexedDB con `idb`: `destinations`, `events`, `edu`, `favorites`, `outbox`, `meta`; migraciones por versión), `catalogCache.js`, `favoritesStore.js`, LocalStorage (tema, sesión) | `db.test`, `catalogCache.test`, `favoritesStore.test`, Playwright (stores y sincronía) | DevTools > Application > IndexedDB > `tudestino` | Hecho (la `outbox` se usa en F5) |
| PWA-07 Cache API | `frontend/src/sw.js` + `pwa/swRouting.js`: SWR para lectura pública, CacheFirst + expiración (150/30 días) para imágenes, NetworkOnly para auth/me/escrituras, `cleanupOutdatedCaches`, limpieza de cachés `td-*` | `swRouting.test` (42), Playwright (`td-api-v1`, `td-images-v1`) | DevTools > Application > Cache Storage | Hecho |
| PWA-08 Offline parcial | Espejo IndexedDB + SWR + shell precacheado + `offline.html`; aviso “Sin conexión · mostrando datos guardados” con fecha | `useRemoteData.test`, `offlineCatalog.test`, `ExplorePage.test`, `EventsPage.test`, `EducationPage.test`, Playwright (`setOffline`) | Video/capturas en modo avión | Hecho para destinos, eventos y educación; reportes en cola llegan en F5 |
| PWA-14 Geolocation | «Mi ubicación» en `/mapa` (Haversine local cuando no hay red); el catálogo ya no muestra «Cerca de mí» | `useNearMe.test`, `offlineCatalog.test`, `MapPage.test`, Playwright | Captura de orden por distancia sin conexión | Hecho en el mapa; captura de coordenadas del reporte llega en F5 |
| PWA-15 Web Share | `ShareButton` en eventos (tarjeta y detalle); fallback: copiar enlace. El botón se retiró de los destinos | `EventDetailPage.test`, Playwright | Captura en móvil real | Parcial (eventos; destinos ya no muestra el botón y la verificación manual en móvil sigue pendiente) |

## Matriz de características PWA (F5)

| Ítem | Implementación | Prueba | Evidencia a capturar | Estado |
|---|---|---|---|---|
| PWA-13 Background Sync | `storage/outbox.js` (cola en IndexedDB con reclamo atómico), `features/reports/reportSender.js` + `reportQueue.js` (el mismo código en la página y en el worker), `pwa/reportSync.js` y listener `sync` (etiqueta `reports-outbox`) en `sw.js`; respaldo sin `SyncManager`: evento `online`, apertura de la app y «Reintentar ahora» (`OutboxSync.jsx`) | `reportSync.test`, `reportQueue.test`, `reportSender.test`, Playwright (etiqueta registrada, envío tras recuperar la red, una sola fila) | DevTools > Application > Background services > Background sync; IndexedDB > `outbox`; video del recorrido | Hecho |
| PWA-14 Geolocation | `useReportLocation.js` + `LocationPicker.jsx` (permiso, denegado, no disponible, tiempo agotado, sin API; alternativa manual y destino cercano) | `ReportForm.test`, Playwright (permiso concedido y denegado) | Paso 2 con «Ubicación lista» y con el permiso denegado | Hecho («Cerca de mí» se retiró del catálogo; «Mi ubicación» sigue en `/mapa`) |
| PWA-05 Almacenamiento local | `outbox` (IndexedDB) y borrador del formulario en SessionStorage (`td:report-draft`) | `outbox.test`, `ReportForm.test` | DevTools > Application > IndexedDB > `outbox` y Session storage | Hecho |

## Mapa (Sprint 8 · F8)

| HU / ítem | Historia o requisito | Pantalla | Endpoint | Pruebas |
|---|---|---|---|---|
| HU-T13 | Mapa con pines distintos para destinos y reportes, popup y enlace al detalle | `/mapa` | `GET /map/pins` | `map.integration` (destinos publicados, reportes resueltos), `mapPins.test`, `MapPage.test` (pines por tipo, lista equivalente, filtros por capa/categoría/tipo, «Mi ubicación» concedida/denegada/sin API), `MapView.test` (Leaflet real en jsdom: atribución, SVG propios, popup con enlace, pines fuera del orden de tabulación), `mapModel.test`, `markerIcons.test`, Playwright |
| HU-T13 (staff) | Mapa de reportes para la autoridad, con ubicación exacta | `/admin/mapa`, mini-mapa en `/admin/reportes/:id` | `GET /admin/map/pins` | `map.integration` (401/403/200, estados y tipos, coordenadas exactas, límite, auditoría sin datos sensibles), `AdminMapPage.test`, `ReportDetailPage.test`, Playwright |
| RNF03 / ADR-04 | El mapa público solo muestra reportes resueltos de tipos no sensibles, con ubicación redondeada | `/mapa` | `GET /map/pins` | `map.integration`: la coordenada original **no aparece** en la respuesta (se busca el texto), el redondeo es determinista y el `bbox` se aplica al punto redondeado (no se puede localizar un reporte filtrando por zona), sin descripción, evidencias, autor, folio, `client_uuid` ni uuid real (id opaco = hash), mes y año en lugar de fecha; `mapPins.test` (la consulta solo lee `location` a través de `ST_SnapToGrid`) |
| RNF05 | Control de acceso en el servidor | `/admin/mapa` | `authenticate` + `requireRole` + `requireCurrentRole` | `map.integration` (401 sin token, 403 a un usuario), `mapPins.test` |
| PWA-08 | Mapa con funcionamiento offline parcial | `/mapa` | — | `swRouting.test` (teselas OSM, `/map/pins` en SWR, `/admin/map/pins` nunca), `MapPage.test` (puntos del espejo IndexedDB sin conexión), `MapView.test` (aviso sin teselas), `DataNotice.test`, Playwright (`setOffline`: teselas desde `td-tiles-v1`, puntos y lista sin red, fondo neutro con aviso si nunca se visitó) |
| PWA-14 | Geolocation en el mapa y en los selectores de ubicación | `/mapa`, `/reportar` (paso 2), `/admin/destinos`, `/eventos/proponer` | — | `MapPage.test`, `LocationPicker.test`, `LocationStep.test`, `DestinationForm.test`, `EventProposals.test`, `geo.test` (Haversine), Playwright (permiso concedido y denegado) |

## Matriz de características PWA (F8)

| Ítem | Implementación | Prueba | Evidencia a capturar | Estado |
|---|---|---|---|---|
| PWA-07 Cache API | `td-tiles-v1`: `CacheFirst` + `ExpirationPlugin` (300 entradas, 7 días) + `CacheableResponsePlugin` `[0, 200]` para `tile.openstreetmap.org`; `/api/v1/map/pins` entra en la estrategia SWR existente (`td-api-v1`); `/admin/map/pins` es red directa | `swRouting.test`, Playwright (`td-tiles-v1` y `td-api-v1` sin ninguna URL `/admin/`) | DevTools > Application > Cache Storage | Hecho |
| PWA-08 Offline parcial | Teselas ya visitadas desde caché; sin red los destinos salen del espejo IndexedDB (o de los de ejemplo) y la lista alternativa sigue funcionando; sin teselas, fondo neutro y «Sin conexión: mostrando solo los puntos guardados» | ver arriba | `F8_mapa-offline-*.png`, `PWA-08_*-offline-*.png` | Hecho (los pines de reportes solo si el SWR ya los guardó) |
| PWA-14 Geolocation | «Mi ubicación» (centra, punto propio y destinos cercanos con distancia) y mapa para elegir la ubicación del reporte, del destino y de la propuesta de evento | ver arriba | `F8_mapa-1280.png`, `F8_selector-ubicacion-360.png`, `PWA-14_*.png` | Hecho |

## Avisos push y Badging API (Sprint 9 · F9)

| HU / ítem | Historia o requisito | Pantalla | Endpoint | Pruebas |
|---|---|---|---|---|
| PWA-16 | Push + Badging: aviso al cambiar el estado de un reporte y recordatorio de eventos; el badge muestra las no leídas | `/notificaciones`, `/perfil`, `/seguimiento`, pantalla de éxito del reporte, «Pendientes de envío» | `GET /push/public-key`, `POST`/`DELETE /push/subscriptions`, `POST`/`DELETE /reports/follow`, `GET /me/notifications`, `PATCH /me/notifications/:id/read`, `POST /me/notifications/read-all` | `push.integration` (alta idempotente, baja con prueba de posesión, follow con 404 genérico, disparo al cambiar el estado sin la nota, 410 borra, no bloquea la respuesta, bandeja y conteo, recordatorio idempotente con bloqueo), `notify.test` (web-push simulado), `pushValidators.test`, `push.test` (SW: payload, URL de clic, badge), `PushToggle.test`, `FollowReportButton.test`, `NotificationsPage.test`, `NotificationsProvider.test`, Playwright |
| RF12 | La autoridad cambia el estado y el reportante se entera | `/admin/reportes/:id` → push a `/seguimiento?folio=` | `PATCH /admin/reports/:id/status` | `push.integration` (seguidores anónimos, cuenta con bandeja + `badge`, sin duplicados, un fallo del push no afecta el cambio) |
| RF22 | Avisos de cambio de estado sin vincular identidad | `/seguimiento`, éxito del reporte | `POST /reports/follow` | `push.integration` (seguidor con `user_id` NULL, 404 idéntico para código erróneo y folio inexistente, comparte presupuesto de intentos con `/reports/track`), `FollowReportButton.test` (el código no se guarda) |
| HU-A04 | Cambiar estado con nota; el aviso no revela la nota | — | `PATCH /admin/reports/:id/status` | `push.integration`, `notify.test` (el payload solo tiene título, cuerpo, url, tag y badge) |
| HU-T07 | Asistir a eventos y recibir el recordatorio | `/perfil/eventos`, push a `/eventos/:id` | `PUT /events/:id/attendance` + trabajo de recordatorios | `push.integration` («Asistiré» + evento a < 24 h ⇒ una sola notificación; evento lejano, pendiente o pasado ⇒ ninguna; bloqueo asesor; programador que se detiene limpio) |
| RF20 / D-01 | El proponente se entera de la moderación; los asistentes, de una cancelación | `/perfil/propuestas`, `/eventos` | `PATCH /admin/events/:id/moderation` | `push.integration` (aprobar, rechazar y cancelar) |
| RNF03 / ADR-03 | Los avisos no llevan datos sensibles ni identifican al denunciante | — | — | `notify.test`, `push.integration` (sin nota, sin código), logs de fallo sin payload ni endpoint |

## Matriz de características PWA (F9)

| Ítem | Implementación | Prueba | Evidencia a capturar | Estado |
|---|---|---|---|---|
| PWA-16 Push | `backend/src/services/notify.js` (`web-push`, VAPID, TTL, urgencia, concurrencia, 404/410 borra), `frontend/src/sw.js` (`push`, `notificationclick`, `pushsubscriptionchange`) con la lógica pura en `pwa/push.js`, `features/notifications/*` | ver arriba | Permiso, notificación recibida, bandeja (ver `docs/evidencias/README.md`) | Hecho (envío real a FCM/APNs sin verificar en esta máquina) |
| PWA-16 Badging | `navigator.setAppBadge`/`clearAppBadge` desde el worker (al llegar un push) y desde la página (al cambiar `unread_count`), con degradación elegante | `push.test`, `NotificationsProvider.test`, Playwright | Ícono de la app instalada con el número | Hecho (solo se ve en la app instalada) |
| PWA-05 Almacenamiento local | Contador del badge en IndexedDB (`meta`) | `push.test` | DevTools > Application > IndexedDB > `meta` > `badgeCount` | Hecho |
