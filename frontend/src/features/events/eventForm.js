import { parseLat, parseLng } from '../reports/reportValidation.js';

// Shared by the staff form and the "propose an event" form (D-01): same fields, same rules as
// the API (a new event cannot start in the past; the end cannot precede the start).

const PAST_TOLERANCE_MS = 5 * 60_000;
const LOCAL_UPLOAD_PATH = /^\/api\/v1\/uploads\/public\/[\w./-]+$/;

export const emptyEventForm = () => ({
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  location_name: '',
  lat: '',
  lng: '',
  image_url: '',
  capacity: '',
});

const pad = (n) => String(n).padStart(2, '0');

// <input type="datetime-local"> wants local time without zone: YYYY-MM-DDTHH:mm.
export function toLocalInput(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function eventToForm(event) {
  return {
    title: event.title,
    description: event.description ?? '',
    starts_at: toLocalInput(event.starts_at),
    ends_at: event.ends_at ? toLocalInput(event.ends_at) : '',
    location_name: event.location_name ?? '',
    lat: event.location ? String(event.location.lat) : '',
    lng: event.location ? String(event.location.lng) : '',
    image_url: event.image_url ?? '',
    capacity: event.capacity ? String(event.capacity) : '',
  };
}

const time = (local) => new Date(local).getTime();

/** `isNew` forbids past start dates (HU-A06); editing may keep a date that already passed. */
export function validateEventForm(values, { isNew = true, now = Date.now() } = {}) {
  const errors = {};
  const title = values.title.trim();
  if (title.length < 3 || title.length > 120) errors.title = 'El título debe tener entre 3 y 120 caracteres.';
  if (values.description.trim().length > 3000) errors.description = 'Máximo 3000 caracteres.';
  if (!values.starts_at || Number.isNaN(time(values.starts_at))) {
    errors.starts_at = 'Indica cuándo empieza.';
  } else if (isNew && time(values.starts_at) < now - PAST_TOLERANCE_MS) {
    errors.starts_at = 'No se permiten fechas pasadas.';
  }
  if (values.ends_at) {
    if (Number.isNaN(time(values.ends_at))) errors.ends_at = 'Fecha de término inválida.';
    else if (!errors.starts_at && time(values.ends_at) < time(values.starts_at)) {
      errors.ends_at = 'El evento no puede terminar antes de empezar.';
    }
  }
  const hasLat = values.lat.trim() !== '';
  const hasLng = values.lng.trim() !== '';
  if (hasLat || hasLng) {
    if (parseLat(values.lat) === null) errors.lat = 'Latitud entre -90 y 90 (o deja ambos campos vacíos).';
    if (parseLng(values.lng) === null) errors.lng = 'Longitud entre -180 y 180 (o deja ambos campos vacíos).';
  }
  if (values.location_name.trim().length > 150) errors.location_name = 'Máximo 150 caracteres.';
  const image = values.image_url.trim();
  if (
    image &&
    !(
      LOCAL_UPLOAD_PATH.test(image) ||
      (URL.canParse(image) && new URL(image).protocol === 'https:')
    )
  ) {
    errors.image_url = 'Sube una imagen válida o usa una URL que empiece con https://';
  }
  const capacity = values.capacity.trim();
  if (capacity && !(/^\d+$/.test(capacity) && Number(capacity) >= 1 && Number(capacity) <= 100000)) {
    errors.capacity = 'Indica un número entero entre 1 y 100 000.';
  }
  return errors;
}

export function eventPayload(values) {
  const hasPoint = values.lat.trim() !== '' && values.lng.trim() !== '';
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    starts_at: new Date(values.starts_at).toISOString(),
    ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null,
    location_name: values.location_name.trim() || null,
    lat: hasPoint ? parseLat(values.lat) : null,
    lng: hasPoint ? parseLng(values.lng) : null,
    image_url: values.image_url.trim() || null,
    capacity: values.capacity.trim() ? Number(values.capacity) : null,
  };
}
