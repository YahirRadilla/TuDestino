// Report types. The API (GET /report-types) is the source of truth for the slugs and names; the
// icons and the help text live here, and the whole list works offline as a fallback.
export const REPORT_TYPES = Object.freeze([
  {
    slug: 'tortuga-anidando',
    name: 'Tortuga anidando',
    icon: 'leaf',
    help: 'Una tortuga sube a la playa a anidar o hay un nido.',
  },
  {
    slug: 'animal-varado',
    name: 'Animal varado',
    icon: 'waves',
    help: 'Fauna marina herida, enredada o varada.',
  },
  {
    slug: 'contaminacion',
    name: 'Contaminación',
    icon: 'shield',
    help: 'Basura, derrames, aguas sucias o residuos.',
  },
  {
    slug: 'actividad-sospechosa',
    name: 'Actividad sospechosa',
    icon: 'eye',
    help: 'Caza, extracción o perturbación de fauna.',
  },
]);

const BY_SLUG = Object.fromEntries(REPORT_TYPES.map((type) => [type.slug, type]));

// Merges what the API returns with the local metadata; unknown slugs still render.
export function withTypeMeta(apiTypes) {
  return apiTypes.map((type) => ({
    icon: 'flag',
    help: '',
    ...BY_SLUG[type.slug],
    ...type,
  }));
}

export const typeLabel = (slug) => BY_SLUG[slug]?.name ?? 'Reporte';

export const STATUS_LABELS = Object.freeze({
  pending: 'Pendiente',
  in_review: 'En revisión',
  resolved: 'Resuelto',
  dismissed: 'Descartado',
});
