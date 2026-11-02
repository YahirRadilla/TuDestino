import { reportVariant, statusVariant } from './markerIcons.js';
import { REPORT_STATUS_LABELS } from '../admin/adminLabels.js';

// Pure translation between API/catalog payloads and the provider-neutral marker the MapView takes:
//   { id, kind, variant, position: {lat, lng}, title, lines: string[], href?, linkLabel?,
//     approximate?, categorySlug?, typeSlug?, status? }

export const PUBLIC_PRECISION_LABEL = 'Ubicación aproximada (unos 500 m)';

const MONTH_FORMAT = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// 'YYYY-MM' -> 'septiembre de 2026'; anything unexpected is shown as-is.
export function monthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!match) return month ?? '';
  return MONTH_FORMAT.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

const ratingLine = (rating, reviews) =>
  Number(reviews) > 0
    ? `${Number(rating).toFixed(1)} · ${reviews} ${reviews === 1 ? 'reseña' : 'reseñas'}`
    : null;

// From GET /map/pins.
export function destinationMarker(item) {
  return {
    id: `d:${item.slug}`,
    kind: 'destination',
    variant: 'destination',
    position: { lat: item.location.lat, lng: item.location.lng },
    title: item.name,
    lines: [ratingLine(item.avg_rating, item.reviews_count), item.category.name].filter(Boolean),
    categorySlug: item.category.slug,
    categoryName: item.category.name,
    href: `/destinos/${item.slug}`,
    linkLabel: 'Ver detalle',
  };
}

// From the catalog model (API list or the IndexedDB mirror, see destinationsApi.toDestination).
export function catalogDestinationMarker(destination) {
  return destinationMarker({
    slug: destination.slug,
    name: destination.name,
    avg_rating: destination.rating,
    reviews_count: destination.reviews,
    category: { slug: destination.categories[0], name: destination.tag },
    location: destination.coords,
  });
}

export function publicReportMarker(item) {
  return {
    id: `r:${item.id}`,
    kind: 'report',
    variant: reportVariant(item.type.slug),
    position: { lat: item.location.lat, lng: item.location.lng },
    title: item.type.name,
    lines: [`Reporte resuelto · ${monthLabel(item.month)}`, PUBLIC_PRECISION_LABEL],
    typeSlug: item.type.slug,
    typeName: item.type.name,
    approximate: true,
  };
}

export function adminReportMarker(item) {
  return {
    id: `a:${item.id}`,
    kind: 'adminReport',
    variant: statusVariant(item.status),
    position: { lat: item.location.lat, lng: item.location.lng },
    title: item.folio,
    lines: [item.type.name, REPORT_STATUS_LABELS[item.status] ?? item.status],
    typeSlug: item.type.slug,
    typeName: item.type.name,
    status: item.status,
    href: item.detail_path,
    linkLabel: 'Ver reporte',
  };
}

/**
 * layers: { destinations: bool, reports: bool }; category filters destinations, type filters
 * reports; both are slugs or '' for "all".
 */
export function filterMarkers(markers, { layers = {}, category = '', type = '', status = '' } = {}) {
  return markers.filter((marker) => {
    if (marker.kind === 'destination') {
      return layers.destinations !== false && (!category || marker.categorySlug === category);
    }
    if (marker.kind === 'report') {
      return layers.reports !== false && (!type || marker.typeSlug === type);
    }
    return (!type || marker.typeSlug === type) && (!status || marker.status === status);
  });
}

// Distinct { slug, name } pairs found in the markers for the given key pair.
export function uniqueOptions(markers, slugKey, nameKey, kind) {
  const found = new Map();
  for (const marker of markers) {
    if (marker.kind === kind && marker[slugKey] && !found.has(marker[slugKey])) {
      found.set(marker[slugKey], marker[nameKey]);
    }
  }
  return [...found]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
