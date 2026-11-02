// Marker artwork as inline SVG strings (no Leaflet default images, which break under bundlers).
// Pure on purpose: `leafletIcons.js` wraps these strings in L.divIcon. Shape AND glyph differ per
// variant, so the meaning never depends on colour alone.

const GLYPHS = {
  // Destinations: a map pin with a star.
  destination: '<path d="m12 6.2 1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3L7.7 9.3l3-.4z" fill="#fff"/>',
  // Report types.
  'report-contaminacion':
    '<path d="M12 7c2.5 3 3.6 4.7 3.6 6.2A3.6 3.6 0 0 1 12 16.8a3.6 3.6 0 0 1-3.6-3.6C8.4 11.7 9.5 10 12 7z" fill="#fff"/>',
  'report-animal-varado':
    '<path d="M6.5 13.5c1.5-3 4-4.5 7-4.5l3 1.8-2 .8c.3 1.2 0 2.6-1 3.4-2.4.5-5 0-7-1.5z" fill="#fff"/>',
  'report-tortuga-anidando': '<ellipse cx="12" cy="12" rx="4.6" ry="3.6" fill="#fff"/>',
  'report-actividad-sospechosa':
    '<circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="1.2" fill="#fff"/>',
  'report-other':
    '<path d="M9 8v8M9 8h6l-1.4 2L15 12H9" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
  // Staff map: one glyph per status.
  'status-pending':
    '<circle cx="12" cy="12" r="4.4" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M12 9.6V12l1.7 1" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
  'status-in_review':
    '<circle cx="11" cy="11" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><path d="m13.5 13.5 3 3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  'status-resolved':
    '<path d="m8.5 12.3 2.4 2.4 4.6-4.9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  'status-dismissed': '<path d="m9 9 6 6M15 9l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  picker: '<circle cx="12" cy="12" r="2.6" fill="#fff"/>',
  user: '<circle cx="12" cy="12" r="3" fill="#fff"/>',
};

export const COLORS = {
  destination: '#d6246e', // pink (brand accent, darkened for contrast)
  'report-contaminacion': '#7c3aed',
  'report-animal-varado': '#0e7490',
  'report-tortuga-anidando': '#15803d',
  'report-actividad-sospechosa': '#b45309',
  'report-other': '#475569',
  'status-pending': '#b45309',
  'status-in_review': '#1d4ed8',
  'status-resolved': '#15803d',
  'status-dismissed': '#475569',
  picker: '#1f4fff',
  user: '#1f4fff',
};

export const VARIANTS = Object.freeze(Object.keys(COLORS));

export const reportVariant = (typeSlug) =>
  `report-${typeSlug}` in COLORS ? `report-${typeSlug}` : 'report-other';
export const statusVariant = (status) => (`status-${status}` in COLORS ? `status-${status}` : 'report-other');

const isReport = (variant) => variant.startsWith('report-');
const isStatus = (variant) => variant.startsWith('status-');

/** Size [w, h] and anchor of the icon for a variant. */
export function iconGeometry(variant) {
  if (variant === 'user') return { size: [22, 22], anchor: [11, 11] };
  if (variant === 'destination' || variant === 'picker') return { size: [34, 42], anchor: [17, 42] };
  return { size: [32, 32], anchor: [16, 16] };
}

// Destinations/picker: teardrop. Reports: rounded-square badge with a DASHED ring ("approximate").
// Staff statuses: solid circle. The user position: a halo dot.
export function markerSvg(variant) {
  const color = COLORS[variant] ?? COLORS['report-other'];
  const glyph = GLYPHS[variant] ?? GLYPHS['report-other'];
  if (variant === 'destination' || variant === 'picker') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 30" width="34" height="42" aria-hidden="true" focusable="false"><path d="M12 29C12 29 2 18.5 2 11.5a10 10 0 0 1 20 0C22 18.5 12 29 12 29z" fill="${color}" stroke="#fff" stroke-width="1.6"/><g transform="translate(0 -0.5)">${glyph}</g></svg>`;
  }
  if (variant === 'user') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="${color}" fill-opacity=".25"/><circle cx="12" cy="12" r="6" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  }
  if (isReport(variant)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="${color}" stroke="#fff" stroke-width="1.6"/><rect x="1" y="1" width="22" height="22" rx="7.5" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="3 2.4"/>${glyph}</svg>`;
  }
  const radius = isStatus(variant) ? 10 : 9;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="${radius}" fill="${color}" stroke="#fff" stroke-width="1.8"/>${glyph}</svg>`;
}

// Legend entries (used by the page): the same artwork, so the key always matches the map.
export const LEGEND_LABELS = Object.freeze({
  destination: 'Destino',
  'report-contaminacion': 'Contaminación (aproximado)',
  'report-animal-varado': 'Animal varado (aproximado)',
  'report-tortuga-anidando': 'Tortuga anidando',
  'report-actividad-sospechosa': 'Actividad sospechosa',
  'report-other': 'Reporte (aproximado)',
  'status-pending': 'Pendiente',
  'status-in_review': 'En revisión',
  'status-resolved': 'Resuelto',
  'status-dismissed': 'Descartado',
  picker: 'Ubicación elegida',
  user: 'Tu ubicación',
});
