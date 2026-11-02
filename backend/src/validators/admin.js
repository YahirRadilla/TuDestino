import { z } from 'zod';
import { paginationShape, searchText, slug } from './common.js';
import { email, fullName } from './auth.js';

export const idParams = z.object({ id: z.uuid() });

const nonEmpty = (value) => Object.keys(value).length > 0;
const NON_EMPTY_MESSAGE = { message: 'Indica al menos un campo para actualizar.' };

// Optional text that may be cleared with null or an empty string.
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

// ---------- Reports ----------

export const REPORT_STATUSES = ['pending', 'in_review', 'resolved', 'dismissed'];

const escapeFolioInput = z
  .string()
  .trim()
  .max(20)
  .regex(/^[A-Za-z0-9-]+$/, 'solo letras, números y guiones')
  .transform((value) => value.toUpperCase());

export const listAdminReportsQuery = z.object({
  ...paginationShape,
  status: z.enum(REPORT_STATUSES).optional(),
  type: slug.optional(),
  folio: z.preprocess((value) => (value === '' ? undefined : value), escapeFolioInput.optional()),
});

export const reportIdParams = idParams;

export const evidenceParams = z.object({
  id: z.uuid(),
  evidenceId: z.string().regex(/^\d{1,15}$/, 'evidencia inválida'),
});

export const NOTE_MIN = 3;
export const NOTE_MAX = 1000;

export const changeReportStatusBody = z.strictObject({
  status: z.enum(REPORT_STATUSES),
  note: z
    .string({ error: 'La nota es obligatoria.' })
    .trim()
    .min(NOTE_MIN, `La nota debe tener al menos ${NOTE_MIN} caracteres.`)
    .max(NOTE_MAX, `La nota no puede superar ${NOTE_MAX} caracteres.`),
});

// ---------- Destinations ----------

const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => /^\/img\/[\w./-]+$/.test(value) || isHttps(value), {
    message: 'debe ser una URL https o una ruta /img/…',
  });

function isHttps(value) {
  return URL.canParse(value) && new URL(value).protocol === 'https:';
}

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine(isHttps, { message: 'debe ser una URL https válida' });

const destinationImage = z.strictObject({
  url: imageUrl,
  alt_text: optionalText(200).optional(),
});

const destinationShape = {
  name: z.string().trim().min(2).max(120),
  slug: slug.optional(),
  summary: z.string().trim().max(300),
  description: z.string().trim().max(5000),
  category: slug,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  municipality: optionalText(100),
  regulations: optionalText(2000),
  care_tips: z.array(z.string().trim().min(1).max(200)).max(10),
  is_protected_area: z.boolean(),
  status: z.enum(['draft', 'published']),
  images: z.array(destinationImage).max(8),
};

export const createDestinationBody = z.strictObject({
  ...destinationShape,
  summary: destinationShape.summary.optional(),
  description: destinationShape.description.optional(),
  municipality: destinationShape.municipality.optional(),
  regulations: destinationShape.regulations.optional(),
  care_tips: destinationShape.care_tips.optional(),
  is_protected_area: destinationShape.is_protected_area.optional(),
  status: destinationShape.status.optional(),
  images: destinationShape.images.optional(),
});

export const updateDestinationBody = z
  .strictObject(destinationShape)
  .partial()
  .refine(nonEmpty, NON_EMPTY_MESSAGE)
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'lat y lng deben indicarse juntos',
    path: ['lat'],
  });

export const listAdminDestinationsQuery = z.object({
  ...paginationShape,
  status: z.enum(['draft', 'published']).optional(),
  q: searchText,
});

// ---------- Events ----------

const PAST_TOLERANCE_MS = 5 * 60_000;
const isoDate = z.string().datetime({ offset: true });

const eventShape = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(3000),
  starts_at: isoDate,
  ends_at: isoDate.nullable(),
  location_name: optionalText(150),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  destination_slug: slug.nullable(),
  image_url: httpsUrl.nullable(),
  capacity: z.number().int().min(1).max(100_000).nullable(),
};

const bothOrNeitherCoordinate = (value) =>
  (value.lat === undefined || value.lat === null) ===
  (value.lng === undefined || value.lng === null);
const COORDINATE_MESSAGE = { message: 'lat y lng deben indicarse juntos', path: ['lat'] };
const endsAfterStart = (value) =>
  !value.ends_at ||
  !value.starts_at ||
  new Date(value.ends_at).getTime() >= new Date(value.starts_at).getTime();
const ENDS_MESSAGE = { message: 'ends_at no puede ser anterior a starts_at', path: ['ends_at'] };

// HU-A06: an event cannot be created in the past. The same validator serves the staff form and
// the proposals of signed-in users (D-01).
export const createEventBody = z
  .strictObject({
    ...eventShape,
    description: eventShape.description.optional(),
    ends_at: eventShape.ends_at.optional(),
    location_name: eventShape.location_name.optional(),
    lat: eventShape.lat.optional(),
    lng: eventShape.lng.optional(),
    destination_slug: eventShape.destination_slug.optional(),
    image_url: eventShape.image_url.optional(),
    capacity: eventShape.capacity.optional(),
  })
  .refine((value) => new Date(value.starts_at).getTime() >= Date.now() - PAST_TOLERANCE_MS, {
    message: 'no se permiten fechas pasadas',
    path: ['starts_at'],
  })
  .refine(endsAfterStart, ENDS_MESSAGE)
  .refine(bothOrNeitherCoordinate, COORDINATE_MESSAGE);

// Editing may keep a date that already passed; the service re-checks ends_at against the stored start.
export const updateEventBody = z
  .strictObject(eventShape)
  .partial()
  .refine(nonEmpty, NON_EMPTY_MESSAGE)
  .refine(endsAfterStart, ENDS_MESSAGE);

export const EVENT_STATUSES = ['pending', 'published', 'cancelled', 'rejected'];

export const listAdminEventsQuery = z.object({
  ...paginationShape,
  status: z.enum(EVENT_STATUSES).optional(),
  q: searchText,
});

export const moderateEventBody = z
  .strictObject({
    action: z.enum(['approve', 'reject', 'cancel']),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((value) => value.action !== 'reject' || Boolean(value.reason), {
    message: 'Indica el motivo del rechazo.',
    path: ['reason'],
  });

// ---------- Education ----------

const eduShape = {
  title: z.string().trim().min(3).max(160),
  slug: slug.optional(),
  type: z.enum(['article', 'video', 'link']),
  body: z.string().trim().max(20_000),
  media_url: httpsUrl.nullable(),
  cover_url: imageUrl.nullable(),
  category: slug,
  is_published: z.boolean(),
};

export const createEduBody = z.strictObject({
  ...eduShape,
  body: eduShape.body.optional(),
  media_url: eduShape.media_url.optional(),
  cover_url: eduShape.cover_url.optional(),
  is_published: eduShape.is_published.optional(),
});

export const updateEduBody = z.strictObject(eduShape).partial().refine(nonEmpty, NON_EMPTY_MESSAGE);

export const listAdminEduQuery = z.object({
  ...paginationShape,
  published: z.enum(['true', 'false']).optional(),
  type: z.enum(['article', 'video', 'link']).optional(),
  q: searchText,
});

// ---------- Users ----------

export const USER_ROLES = ['user', 'authority', 'admin'];

export const listAdminUsersQuery = z.object({
  ...paginationShape,
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  q: searchText,
});

export const createAdminUserBody = z.strictObject({
  full_name: fullName,
  email,
  role: z.enum(['authority', 'admin']),
  area_id: z.number().int().min(1).max(2_147_483_647).nullable().optional(),
});

export const updateAdminUserBody = z
  .strictObject({
    full_name: fullName,
    role: z.enum(USER_ROLES),
    area_id: z.number().int().min(1).max(2_147_483_647).nullable(),
    is_active: z.boolean(),
  })
  .partial()
  .refine(nonEmpty, NON_EMPTY_MESSAGE);
