import { createQueryBuilder } from './sql.js';

// Grid of the public report pins, in degrees (ADR-04): 0.005 deg is ~550 m of latitude, so the
// published point is never closer than ~250 m to the real one and many reports share a cell.
export const PUBLIC_GRID_DEGREES = 0.005;

const envelope = (builder, { minLng, minLat, maxLng, maxLat }) =>
  `ST_MakeEnvelope(${builder.bind(minLng)}, ${builder.bind(minLat)}, ${builder.bind(maxLng)}, ${builder.bind(maxLat)}, 4326)`;

// Published destinations (exact coordinates: they are public places). One extra row is requested
// so the service can tell the client that the list was truncated.
export async function findDestinationPins(db, { bbox, limit }) {
  const builder = createQueryBuilder();
  builder.where(`d.status = 'published'`);
  builder.where('d.deleted_at IS NULL');
  if (bbox) builder.where(`d.location && ${envelope(builder, bbox)}::geography`);
  const limitParam = builder.bind(limit + 1);
  const { rows } = await db.query(
    `SELECT d.slug, d.name, d.avg_rating::float8 AS avg_rating, d.reviews_count,
            c.slug AS category_slug, c.name AS category_name,
            ST_Y(d.location::geometry) AS lat, ST_X(d.location::geometry) AS lng
     FROM destinations d
     JOIN destination_categories c ON c.id = d.category_id
     ${builder.whereClause()}
     ORDER BY d.name ASC, d.id ASC
     LIMIT ${limitParam}`,
    builder.values,
  );
  return rows;
}

// Public view of citizen reports (RNF03 / ADR-04). The privacy rules live in this one query:
//  - only `resolved` reports of types that are not sensitive;
//  - the coordinate is snapped to a grid IN SQL, so the original never reaches Node;
//  - the bbox is applied to the SNAPPED point, so filtering cannot be used to locate a report;
//  - the only columns selected are the type, the month and an opaque id (a hash of the key):
//    no description, evidence, reporter, folio, client_uuid or exact timestamp.
export async function findPublicReportPins(db, { bbox, limit }) {
  const builder = createQueryBuilder();
  const grid = builder.bind(PUBLIC_GRID_DEGREES);
  builder.where(`r.status = 'resolved'`);
  builder.where('t.is_sensitive = false');
  if (bbox) {
    builder.where(
      `ST_SnapToGrid(r.location::geometry, ${grid}::float8) && ${envelope(builder, bbox)}`,
    );
  }
  const limitParam = builder.bind(limit + 1);
  const { rows } = await db.query(
    `SELECT left(encode(sha256(convert_to(r.id::text, 'UTF8')), 'hex'), 16) AS pin_id,
            t.slug AS type_slug, t.name AS type_name,
            to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
            ST_Y(ST_SnapToGrid(r.location::geometry, ${grid}::float8)) AS lat,
            ST_X(ST_SnapToGrid(r.location::geometry, ${grid}::float8)) AS lng
     FROM reports r
     JOIN report_types t ON t.id = r.type_id
     ${builder.whereClause()}
     ORDER BY r.occurred_at DESC, r.id ASC
     LIMIT ${limitParam}`,
    builder.values,
  );
  return rows;
}

// Staff view: every status and type, exact coordinates. Only authenticated staff reach this.
export async function findAdminReportPins(db, { bbox, limit, status, type }) {
  const builder = createQueryBuilder();
  if (status) builder.where(`r.status = ${builder.bind(status)}`);
  if (type) builder.where(`t.slug = ${builder.bind(type)}`);
  if (bbox) builder.where(`r.location && ${envelope(builder, bbox)}::geography`);
  const limitParam = builder.bind(limit + 1);
  const { rows } = await db.query(
    `SELECT r.id, r.folio, r.status, t.slug AS type_slug, t.name AS type_name,
            t.is_sensitive, r.created_at,
            ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng
     FROM reports r
     JOIN report_types t ON t.id = r.type_id
     ${builder.whereClause()}
     ORDER BY r.created_at DESC, r.id ASC
     LIMIT ${limitParam}`,
    builder.values,
  );
  return rows;
}
