export const destinationCategories = [
  { slug: 'playa', name: 'Playas' },
  { slug: 'anp', name: 'Áreas protegidas' },
  { slug: 'mirador', name: 'Miradores' },
  { slug: 'cultura', name: 'Cultura' },
];

export const reportTypes = [
  { slug: 'tortuga-anidando', name: 'Tortuga anidando', is_sensitive: true },
  { slug: 'animal-varado', name: 'Animal varado', is_sensitive: false },
  { slug: 'contaminacion', name: 'Contaminación', is_sensitive: false },
  { slug: 'actividad-sospechosa', name: 'Actividad sospechosa', is_sensitive: true },
  { slug: 'otro', name: 'Otro', is_sensitive: false },
];

export const eduCategories = [
  { slug: 'fauna-marina', name: 'Fauna marina' },
  { slug: 'turismo-responsable', name: 'Turismo responsable' },
  { slug: 'ecosistemas', name: 'Ecosistemas' },
];

export const eduContents = [
  {
    slug: 'que-hacer-si-ves-una-tortuga-anidando',
    title: 'Qué hacer si ves una tortuga anidando',
    type: 'article',
    category: 'fauna-marina',
    body: 'Mantén una distancia de al menos diez metros, apaga linternas y flashes, no toques a la tortuga ni a sus huevos y evita que tu mascota se acerque. Reporta el avistamiento para que las autoridades protejan el nido.',
  },
  {
    slug: 'ballena-gris-en-laguna-san-ignacio',
    title: 'La ballena gris en Laguna San Ignacio',
    type: 'video',
    category: 'fauna-marina',
    body: 'Cada invierno las ballenas grises llegan a la laguna a reproducirse. Conoce las reglas para observarlas sin perturbarlas.',
    media_url: 'https://www.youtube.com/watch?v=dev-sample',
  },
  {
    slug: 'bloqueador-solar-y-arrecifes',
    title: 'Bloqueador solar y arrecifes de coral',
    type: 'article',
    category: 'turismo-responsable',
    body: 'Algunos filtros químicos dañan el coral. Prefiere bloqueadores minerales biodegradables, ropa con protección UV y aplica el producto antes de llegar al agua.',
  },
  {
    slug: 'manglares-aliados-del-clima',
    title: 'Manglares, aliados del clima y de la costa',
    type: 'article',
    category: 'ecosistemas',
    body: 'Los manglares protegen la costa de tormentas, son criadero de peces y almacenan carbono. Camina solo por los senderos señalados.',
  },
  {
    slug: 'guia-oficial-de-avistamiento-de-fauna',
    title: 'Guía oficial de avistamiento de fauna',
    type: 'link',
    category: 'turismo-responsable',
    body: 'Lineamientos de la CONANP para observar fauna silvestre sin causarle daño.',
    media_url: 'https://www.gob.mx/conanp',
  },
];

// Start offsets are relative to "now" so seeded events stay in the future in development.
export const events = [
  {
    title: 'Limpieza de playa en El Tecolote',
    description:
      'Jornada comunitaria de limpieza. Lleva guantes, agua y gorra; nosotros ponemos bolsas.',
    startsInDays: 10,
    durationHours: 4,
    location_name: 'Playa El Tecolote',
    destination: 'playa-el-tecolote',
    capacity: 80,
  },
  {
    title: 'Plática: tortugas marinas de Los Cerritos',
    description: 'Conoce el ciclo de anidación y cómo ayudar a proteger los nidos.',
    startsInDays: 24,
    durationHours: 2,
    location_name: 'Playa Los Cerritos',
    destination: 'playa-los-cerritos',
    capacity: 40,
  },
  {
    title: 'Jornada de monitoreo de arrecife',
    description: 'Voluntariado guiado de conteo de especies con la comunidad de Cabo Pulmo.',
    startsInDays: 45,
    durationHours: 6,
    location_name: 'Cabo Pulmo',
    destination: 'cabo-pulmo',
    capacity: 20,
  },
];

// DEVELOPMENT ONLY: fixed credentials for local testing. Never use these outside a dev database.
export const devPassword = 'DevOnly#2026';
export const devUsers = [
  { full_name: 'Usuario Demo (solo desarrollo)', email: 'user@dev.tudestino.local', role: 'user' },
  {
    full_name: 'Autoridad Demo (solo desarrollo)',
    email: 'authority@dev.tudestino.local',
    role: 'authority',
    area: 'CONANP (demo)',
  },
  { full_name: 'Admin Demo (solo desarrollo)', email: 'admin@dev.tudestino.local', role: 'admin' },
];
