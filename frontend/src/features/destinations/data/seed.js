// Local sample data (Sprint 1). Replaced by the API in later sprints.
// Ratings and reviews are not bundled: they are shown only when real reviews arrive from the API.
// Distances (km from La Paz) are illustrative sample values.

export const CATEGORIES = [
  { id: 'playa', label: 'Playas', icon: 'waves' },
  { id: 'anp', label: 'Áreas protegidas', icon: 'shield' },
  { id: 'mirador', label: 'Miradores', icon: 'eye' },
  { id: 'cultura', label: 'Cultura', icon: 'landmark' },
];

const img = (slug) => [1, 2, 3].map((n) => `/img/${slug}-${n}.svg`);

export const DESTINATIONS = [
  {
    id: 'playa-el-tecolote',
    slug: 'playa-el-tecolote',
    name: 'Playa El Tecolote',
    location: 'La Paz, Baja California Sur',
    categories: ['playa'],
    tag: 'Playa',
    distanceKm: 25,
    coords: { lat: 24.3436, lng: -110.3167 },
    summary: 'Aguas someras y tranquilas frente a la isla Espíritu Santo.',
    description:
      'Playa amplia de arena clara al norte de La Paz, con aguas someras y tranquilas ideales para ir en familia. Desde la orilla se ve la silueta de la isla Espíritu Santo y, al final de la tarde, el atardecer es uno de los más buscados de la bahía. Hay palapas con comida local, pero conviene llevar agua y protección solar.',
    details: [
      { icon: 'tag', label: 'Entrada libre' },
      { icon: 'car', label: 'Estacionamiento' },
      { icon: 'users', label: 'Sanitarios' },
      { icon: 'waves', label: 'Aguas tranquilas' },
    ],
    care: [
      'Llévate tu basura de regreso.',
      'No dejes que tu mascota moleste a las aves playeras.',
      'Usa bloqueador solar biodegradable.',
    ],
    images: img('playa-el-tecolote'),
  },
  {
    id: 'balandra',
    slug: 'balandra',
    name: 'Balandra',
    location: 'La Paz, Baja California Sur',
    categories: ['anp', 'playa'],
    tag: 'ANP',
    distanceKm: 26,
    coords: { lat: 24.3185, lng: -110.3249 },
    summary: 'Bahía de aguas turquesa y manglar, famosa por su roca El Hongo.',
    description:
      'Bahía protegida de aguas turquesa y poca profundidad, rodeada de manglar y dunas. Es un Área de Protección de Flora y Fauna: el acceso tiene un aforo regulado y hay zonas que no se pueden pisar para cuidar el pasto marino y el manglar. La roca El Hongo es su imagen más conocida.',
    details: [
      { icon: 'shield', label: 'Área protegida' },
      { icon: 'users', label: 'Aforo regulado' },
      { icon: 'tag', label: 'Entrada libre' },
      { icon: 'car', label: 'Estacionamiento' },
    ],
    care: [
      'Respeta el aforo y las áreas restringidas del manglar.',
      'No subas a la roca El Hongo ni te lleves conchas o arena.',
      'Usa solo bloqueador biodegradable o ropa con protección UV.',
    ],
    images: img('balandra'),
  },
  {
    id: 'cabo-pulmo',
    slug: 'cabo-pulmo',
    name: 'Cabo Pulmo',
    location: 'Los Cabos, Baja California Sur',
    categories: ['anp'],
    tag: 'Parque Nacional',
    distanceKm: 190,
    coords: { lat: 23.4333, lng: -109.4236 },
    summary: 'Uno de los arrecifes de coral más importantes del Mar de Cortés.',
    description:
      'Parque Nacional que protege un arrecife de coral de origen muy antiguo en el Golfo de California. Es un sitio muy valorado para el buceo y el snorkel, con gran variedad de peces. La recuperación de su vida marina es un caso reconocido de conservación comunitaria. Se recomienda contratar guías locales autorizados.',
    details: [
      { icon: 'shield', label: 'Parque Nacional' },
      { icon: 'waves', label: 'Snorkel y buceo' },
      { icon: 'users', label: 'Guías locales' },
      { icon: 'tag', label: 'Pago de acceso al parque' },
    ],
    care: [
      'No toques ni pises el coral.',
      'No alimentes a los peces.',
      'Contrata operadores y guías autorizados.',
    ],
    images: img('cabo-pulmo'),
  },
  {
    id: 'espiritu-santo',
    slug: 'espiritu-santo',
    name: 'Isla Espíritu Santo',
    location: 'La Paz, Baja California Sur',
    categories: ['anp'],
    tag: 'Parque Nacional',
    distanceKm: 30,
    coords: { lat: 24.4667, lng: -110.3833 },
    summary: 'Archipiélago de acantilados rojizos, lobos marinos y bahías de cuento.',
    description:
      'Parque Nacional Archipiélago de Espíritu Santo, Patrimonio de la Humanidad dentro de las Islas y Áreas Protegidas del Golfo de California. Se visita en lancha con operadores autorizados. Es famoso por su lobera, por las playas aisladas y por la posibilidad de nadar con lobos marinos de forma responsable.',
    details: [
      { icon: 'shield', label: 'Parque Nacional' },
      { icon: 'navigation', label: 'Acceso en lancha' },
      { icon: 'users', label: 'Operadores autorizados' },
      { icon: 'waves', label: 'Nado con lobos marinos' },
    ],
    care: [
      'Mantén la distancia indicada con los lobos marinos.',
      'No dejes residuos ni hagas fogatas.',
      'Elige operadores autorizados por la CONANP.',
    ],
    images: img('espiritu-santo'),
  },
  {
    id: 'todos-santos',
    slug: 'todos-santos',
    name: 'Todos Santos',
    location: 'Todos Santos, Baja California Sur',
    categories: ['cultura'],
    tag: 'Pueblo Mágico',
    distanceKm: 80,
    coords: { lat: 23.4486, lng: -110.2253 },
    summary: 'Pueblo Mágico de galerías, huertos y arquitectura de misión.',
    description:
      'Pueblo con casonas del siglo XIX, galerías de arte, cafés y huertos orgánicos a pocos minutos del Pacífico. Su centro histórico se recorre a pie. Cada año se celebra un festival de arte y se pueden visitar talleres de artesanos locales. Es una buena parada para apoyar la economía local.',
    details: [
      { icon: 'landmark', label: 'Centro histórico' },
      { icon: 'tag', label: 'Entrada libre' },
      { icon: 'car', label: 'Estacionamiento' },
      { icon: 'users', label: 'Sanitarios' },
    ],
    care: [
      'Compra artesanías y productos a productores locales.',
      'Respeta el patrimonio: no pintes ni dañes fachadas.',
      'Camina o usa bicicleta por el centro.',
    ],
    images: img('todos-santos'),
  },
  {
    id: 'bahia-concepcion',
    slug: 'bahia-concepcion',
    name: 'Bahía Concepción',
    location: 'Mulegé, Baja California Sur',
    categories: ['playa', 'mirador'],
    tag: 'Playa',
    distanceKm: 480,
    coords: { lat: 26.7, lng: -111.9 },
    summary: 'Bahía larga y serena con playas como Santispac y Requesón.',
    description:
      'Bahía de aguas verdes y calmas sobre el Mar de Cortés, con playas como Santispac, Requesón y El Coyote. Desde la carretera transpeninsular hay varios miradores con vistas amplias. Es un destino popular para acampar y practicar kayak, por lo que la gestión de residuos es clave.',
    details: [
      { icon: 'eye', label: 'Miradores' },
      { icon: 'waves', label: 'Kayak y snorkel' },
      { icon: 'tag', label: 'Cuota de campamento' },
      { icon: 'users', label: 'Sanitarios' },
    ],
    care: [
      'Si acampas, empaca todo lo que llevaste.',
      'Evita lavar trastes o ropa en el mar.',
      'No extraigas conchas ni almejas sin permiso.',
    ],
    images: img('bahia-concepcion'),
  },
  {
    id: 'playa-los-cerritos',
    slug: 'playa-los-cerritos',
    name: 'Playa Los Cerritos',
    location: 'El Pescadero, Baja California Sur',
    categories: ['playa'],
    tag: 'Playa',
    distanceKm: 95,
    coords: { lat: 23.3217, lng: -110.1778 },
    summary: 'Olas constantes para surfear y atardeceres sobre el Pacífico.',
    description:
      'Playa abierta al Pacífico, conocida por sus olas aptas para aprender y practicar surf. Las corrientes pueden ser fuertes, así que conviene nadar solo en las zonas señaladas. En temporada de anidación, las tortugas marinas llegan a playas cercanas: si ves una, mantén distancia y reporta el avistamiento.',
    details: [
      { icon: 'waves', label: 'Surf' },
      { icon: 'tag', label: 'Entrada libre' },
      { icon: 'car', label: 'Estacionamiento' },
      { icon: 'users', label: 'Sanitarios' },
    ],
    care: [
      'De noche, evita luces y fogatas en la playa.',
      'Si ves una tortuga anidando, no la toques y repórtalo.',
      'Respeta las zonas de nado señaladas.',
    ],
    images: img('playa-los-cerritos'),
  },
  {
    id: 'laguna-san-ignacio',
    slug: 'laguna-san-ignacio',
    name: 'Laguna San Ignacio',
    location: 'Mulegé, Baja California Sur',
    categories: ['anp'],
    tag: 'Santuario de ballenas',
    distanceKm: 740,
    coords: { lat: 26.8, lng: -113.2 },
    summary: 'Santuario donde la ballena gris llega a reproducirse cada invierno.',
    description:
      'Laguna dentro de la Reserva de la Biósfera El Vizcaíno, donde cada invierno llegan las ballenas grises a parir y criar. La temporada de avistamiento va aproximadamente de enero a abril y se realiza en lanchas autorizadas, con reglas estrictas para no perturbar a los animales. Es un viaje largo pero muy significativo.',
    details: [
      { icon: 'shield', label: 'Reserva de la Biósfera' },
      { icon: 'calendar', label: 'Temporada: ene–abr' },
      { icon: 'navigation', label: 'Avistamiento en lancha' },
      { icon: 'users', label: 'Operadores autorizados' },
    ],
    care: [
      'Sigue las instrucciones del guía: no persigas a las ballenas.',
      'No arrojes objetos ni alimentos al agua.',
      'Respeta los horarios y las zonas de avistamiento.',
    ],
    images: img('laguna-san-ignacio'),
  },
];

export const getDestinationBySlug = (slug) => DESTINATIONS.find((d) => d.slug === slug);
export const getDestinationsByCategory = (categoryId) =>
  categoryId ? DESTINATIONS.filter((d) => d.categories.includes(categoryId)) : DESTINATIONS;
export const mapsDirectionsUrl = ({ coords }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
