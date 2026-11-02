// Mirrors frontend/src/features/destinations/data/seed.js (same slugs, names and coordinates).
// Ratings and review counts are never seeded: they only come from real reviews in PostgreSQL.
// Each destination has a single primary category in the database (category_id).

const images = (slug, name) =>
  [1, 2, 3].map((n) => ({
    url: `/img/${slug}-${n}.svg`,
    alt_text: n === 1 ? `Ilustración de ${name}` : null,
  }));

export const destinations = [
  {
    slug: 'playa-el-tecolote',
    name: 'Playa El Tecolote',
    category: 'playa',
    municipality: 'La Paz',
    lat: 24.3436,
    lng: -110.3167,
    is_protected_area: false,
    summary: 'Aguas someras y tranquilas frente a la isla Espíritu Santo.',
    description:
      'Playa amplia de arena clara al norte de La Paz, con aguas someras y tranquilas ideales para ir en familia. Desde la orilla se ve la silueta de la isla Espíritu Santo y, al final de la tarde, el atardecer es uno de los más buscados de la bahía. Hay palapas con comida local, pero conviene llevar agua y protección solar.',
    highlights: [
      { icon: 'tag', label: 'Entrada libre' },
      { icon: 'car', label: 'Estacionamiento' },
      { icon: 'users', label: 'Sanitarios' },
      { icon: 'waves', label: 'Aguas tranquilas' },
    ],
    care_tips: [
      'Llévate tu basura de regreso.',
      'No dejes que tu mascota moleste a las aves playeras.',
      'Usa bloqueador solar biodegradable.',
    ],
    images: images('playa-el-tecolote', 'Playa El Tecolote'),
  },
  {
    slug: 'balandra',
    name: 'Balandra',
    category: 'anp',
    municipality: 'La Paz',
    lat: 24.3185,
    lng: -110.3249,
    is_protected_area: true,
    summary: 'Bahía de aguas turquesa y manglar, famosa por su roca El Hongo.',
    description:
      'Bahía protegida de aguas turquesa y poca profundidad, rodeada de manglar y dunas. Es un Área de Protección de Flora y Fauna: el acceso tiene un aforo regulado y hay zonas que no se pueden pisar para cuidar el pasto marino y el manglar. La roca El Hongo es su imagen más conocida.',
    regulations: 'Aforo regulado; zonas de manglar y pasto marino restringidas.',
    highlights: [
      { icon: 'shield', label: 'Área protegida' },
      { icon: 'users', label: 'Aforo regulado' },
      { icon: 'tag', label: 'Entrada libre' },
      { icon: 'car', label: 'Estacionamiento' },
    ],
    care_tips: [
      'Respeta el aforo y las áreas restringidas del manglar.',
      'No subas a la roca El Hongo ni te lleves conchas o arena.',
      'Usa solo bloqueador biodegradable o ropa con protección UV.',
    ],
    images: images('balandra', 'Balandra'),
  },
  {
    slug: 'cabo-pulmo',
    name: 'Cabo Pulmo',
    category: 'anp',
    municipality: 'Los Cabos',
    lat: 23.4333,
    lng: -109.4236,
    is_protected_area: true,
    summary: 'Uno de los arrecifes de coral más importantes del Mar de Cortés.',
    description:
      'Parque Nacional que protege un arrecife de coral de origen muy antiguo en el Golfo de California. Es un sitio muy valorado para el buceo y el snorkel, con gran variedad de peces. La recuperación de su vida marina es un caso reconocido de conservación comunitaria. Se recomienda contratar guías locales autorizados.',
    regulations: 'Pago de acceso al parque; se recomienda contratar guías autorizados.',
    highlights: [
      { icon: 'shield', label: 'Parque Nacional' },
      { icon: 'waves', label: 'Snorkel y buceo' },
      { icon: 'users', label: 'Guías locales' },
      { icon: 'tag', label: 'Pago de acceso al parque' },
    ],
    care_tips: [
      'No toques ni pises el coral.',
      'No alimentes a los peces.',
      'Contrata operadores y guías autorizados.',
    ],
    images: images('cabo-pulmo', 'Cabo Pulmo'),
  },
  {
    slug: 'espiritu-santo',
    name: 'Isla Espíritu Santo',
    category: 'anp',
    municipality: 'La Paz',
    lat: 24.4667,
    lng: -110.3833,
    is_protected_area: true,
    summary: 'Archipiélago de acantilados rojizos, lobos marinos y bahías de cuento.',
    description:
      'Parque Nacional Archipiélago de Espíritu Santo, Patrimonio de la Humanidad dentro de las Islas y Áreas Protegidas del Golfo de California. Se visita en lancha con operadores autorizados. Es famoso por su lobera, por las playas aisladas y por la posibilidad de nadar con lobos marinos de forma responsable.',
    regulations: 'Acceso solo con operadores autorizados por la CONANP.',
    highlights: [
      { icon: 'shield', label: 'Parque Nacional' },
      { icon: 'navigation', label: 'Acceso en lancha' },
      { icon: 'users', label: 'Operadores autorizados' },
      { icon: 'waves', label: 'Nado con lobos marinos' },
    ],
    care_tips: [
      'Mantén la distancia indicada con los lobos marinos.',
      'No dejes residuos ni hagas fogatas.',
      'Elige operadores autorizados por la CONANP.',
    ],
    images: images('espiritu-santo', 'Isla Espíritu Santo'),
  },
  {
    slug: 'todos-santos',
    name: 'Todos Santos',
    category: 'cultura',
    municipality: 'Todos Santos',
    lat: 23.4486,
    lng: -110.2253,
    is_protected_area: false,
    summary: 'Pueblo Mágico de galerías, huertos y arquitectura de misión.',
    description:
      'Pueblo con casonas del siglo XIX, galerías de arte, cafés y huertos orgánicos a pocos minutos del Pacífico. Su centro histórico se recorre a pie. Cada año se celebra un festival de arte y se pueden visitar talleres de artesanos locales. Es una buena parada para apoyar la economía local.',
    highlights: [
      { icon: 'landmark', label: 'Centro histórico' },
      { icon: 'tag', label: 'Entrada libre' },
      { icon: 'car', label: 'Estacionamiento' },
      { icon: 'users', label: 'Sanitarios' },
    ],
    care_tips: [
      'Compra artesanías y productos a productores locales.',
      'Respeta el patrimonio: no pintes ni dañes fachadas.',
      'Camina o usa bicicleta por el centro.',
    ],
    images: images('todos-santos', 'Todos Santos'),
  },
  {
    slug: 'bahia-concepcion',
    name: 'Bahía Concepción',
    category: 'playa',
    municipality: 'Mulegé',
    lat: 26.7,
    lng: -111.9,
    is_protected_area: false,
    summary: 'Bahía larga y serena con playas como Santispac y Requesón.',
    description:
      'Bahía de aguas verdes y calmas sobre el Mar de Cortés, con playas como Santispac, Requesón y El Coyote. Desde la carretera transpeninsular hay varios miradores con vistas amplias. Es un destino popular para acampar y practicar kayak, por lo que la gestión de residuos es clave.',
    highlights: [
      { icon: 'eye', label: 'Miradores' },
      { icon: 'waves', label: 'Kayak y snorkel' },
      { icon: 'tag', label: 'Cuota de campamento' },
      { icon: 'users', label: 'Sanitarios' },
    ],
    care_tips: [
      'Si acampas, empaca todo lo que llevaste.',
      'Evita lavar trastes o ropa en el mar.',
      'No extraigas conchas ni almejas sin permiso.',
    ],
    images: images('bahia-concepcion', 'Bahía Concepción'),
  },
  {
    slug: 'playa-los-cerritos',
    name: 'Playa Los Cerritos',
    category: 'playa',
    municipality: 'El Pescadero',
    lat: 23.3217,
    lng: -110.1778,
    is_protected_area: false,
    summary: 'Olas constantes para surfear y atardeceres sobre el Pacífico.',
    description:
      'Playa abierta al Pacífico, conocida por sus olas aptas para aprender y practicar surf. Las corrientes pueden ser fuertes, así que conviene nadar solo en las zonas señaladas. En temporada de anidación, las tortugas marinas llegan a playas cercanas: si ves una, mantén distancia y reporta el avistamiento.',
    highlights: [
      { icon: 'waves', label: 'Surf' },
      { icon: 'tag', label: 'Entrada libre' },
      { icon: 'car', label: 'Estacionamiento' },
      { icon: 'users', label: 'Sanitarios' },
    ],
    care_tips: [
      'De noche, evita luces y fogatas en la playa.',
      'Si ves una tortuga anidando, no la toques y repórtalo.',
      'Respeta las zonas de nado señaladas.',
    ],
    images: images('playa-los-cerritos', 'Playa Los Cerritos'),
  },
  {
    slug: 'laguna-san-ignacio',
    name: 'Laguna San Ignacio',
    category: 'anp',
    municipality: 'Mulegé',
    lat: 26.8,
    lng: -113.2,
    is_protected_area: true,
    summary: 'Santuario donde la ballena gris llega a reproducirse cada invierno.',
    description:
      'Laguna dentro de la Reserva de la Biósfera El Vizcaíno, donde cada invierno llegan las ballenas grises a parir y criar. La temporada de avistamiento va aproximadamente de enero a abril y se realiza en lanchas autorizadas, con reglas estrictas para no perturbar a los animales. Es un viaje largo pero muy significativo.',
    regulations: 'Avistamiento solo en lanchas autorizadas; temporada aproximada de enero a abril.',
    highlights: [
      { icon: 'shield', label: 'Reserva de la Biósfera' },
      { icon: 'calendar', label: 'Temporada: ene–abr' },
      { icon: 'navigation', label: 'Avistamiento en lancha' },
      { icon: 'users', label: 'Operadores autorizados' },
    ],
    care_tips: [
      'Sigue las instrucciones del guía: no persigas a las ballenas.',
      'No arrojes objetos ni alimentos al agua.',
      'Respeta los horarios y las zonas de avistamiento.',
    ],
    images: images('laguna-san-ignacio', 'Laguna San Ignacio'),
  },
];
