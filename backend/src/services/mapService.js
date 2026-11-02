import * as pins from '../models/mapModel.js';

const PUBLIC_PRECISION_M = 500;

// Cuts the extra probe row and reports whether the list was longer than the limit.
function page(rows, limit) {
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

const bboxMeta = (bbox) => (bbox ? [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat] : null);

export async function getPublicPins(db, { bbox, limit }) {
  const [destinationRows, reportRows] = await Promise.all([
    pins.findDestinationPins(db, { bbox, limit }),
    pins.findPublicReportPins(db, { bbox, limit }),
  ]);
  const destinations = page(destinationRows, limit);
  const reports = page(reportRows, limit);
  return {
    data: {
      destinations: destinations.items.map((row) => ({
        slug: row.slug,
        name: row.name,
        avg_rating: row.avg_rating,
        reviews_count: row.reviews_count,
        category: { slug: row.category_slug, name: row.category_name },
        location: { lat: row.lat, lng: row.lng },
      })),
      // Whitelist: nothing else from the report row may be added here (see mapModel).
      reports: reports.items.map((row) => ({
        id: row.pin_id,
        type: { slug: row.type_slug, name: row.type_name },
        month: row.month,
        location: { lat: row.lat, lng: row.lng },
        approximate: true,
      })),
    },
    meta: {
      limit,
      bbox: bboxMeta(bbox),
      report_precision_m: PUBLIC_PRECISION_M,
      truncated: { destinations: destinations.truncated, reports: reports.truncated },
    },
  };
}

export async function getAdminPins(db, { bbox, limit, status, type }) {
  const rows = await pins.findAdminReportPins(db, { bbox, limit, status, type });
  const reports = page(rows, limit);
  return {
    data: {
      reports: reports.items.map((row) => ({
        id: row.id,
        folio: row.folio,
        status: row.status,
        type: { slug: row.type_slug, name: row.type_name, is_sensitive: row.is_sensitive },
        created_at: row.created_at,
        location: { lat: row.lat, lng: row.lng },
        detail_path: `/admin/reportes/${row.id}`,
      })),
    },
    meta: { limit, bbox: bboxMeta(bbox), truncated: { reports: reports.truncated } },
  };
}
