import { parseLat, parseLng } from '../reports/reportValidation.js';

// Client-side checks mirror the API's zod schemas so the person sees the problem before sending;
// the server stays the authority (its messages are shown when it disagrees).

export const MAX_IMAGES = 8;
export const MAX_CARE_TIPS = 10;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LOCAL_UPLOAD_PATH = /^\/api\/v1\/uploads\/public\/[\w./-]+$/;

export const isHttps = (value) => URL.canParse(value) && new URL(value).protocol === 'https:';
// Same rule as the API: an https URL, a bundled /img/ asset or an image uploaded through the API.
export const isImageUrl = (value) =>
  /^\/img\/[\w./-]+$/.test(value) || LOCAL_UPLOAD_PATH.test(value) || isHttps(value);

const lengthBetween = (value, min, max) => {
  const length = String(value ?? '').trim().length;
  return length >= min && length <= max;
};

// ---------- destinations ----------

export const emptyDestination = () => ({
  name: '',
  slug: '',
  summary: '',
  description: '',
  category: '',
  lat: '',
  lng: '',
  municipality: '',
  regulations: '',
  care_tips: '',
  is_protected_area: false,
  status: 'draft',
  images: [],
});

export function destinationToForm(destination) {
  return {
    name: destination.name,
    slug: destination.slug,
    summary: destination.summary ?? '',
    description: destination.description ?? '',
    category: destination.category.slug,
    lat: String(destination.location.lat),
    lng: String(destination.location.lng),
    municipality: destination.municipality ?? '',
    regulations: destination.regulations ?? '',
    care_tips: (destination.care_tips ?? []).join('\n'),
    is_protected_area: destination.is_protected_area,
    status: destination.status,
    images: destination.images.map((image) => ({ url: image.url, alt_text: image.alt_text ?? '' })),
  };
}

const careTipsOf = (text) =>
  String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export function validateDestination(values) {
  const errors = {};
  if (!lengthBetween(values.name, 2, 120)) errors.name = 'El nombre debe tener entre 2 y 120 caracteres.';
  if (values.slug.trim() && !SLUG.test(values.slug.trim())) {
    errors.slug = 'Usa minúsculas, números y guiones (por ejemplo playa-balandra).';
  }
  if (!values.category) errors.category = 'Elige una categoría.';
  if (parseLat(values.lat) === null) errors.lat = 'Latitud entre -90 y 90.';
  if (parseLng(values.lng) === null) errors.lng = 'Longitud entre -180 y 180.';
  if (values.summary.trim().length > 300) errors.summary = 'Máximo 300 caracteres.';
  if (values.description.trim().length > 5000) errors.description = 'Máximo 5000 caracteres.';
  if (values.municipality.trim().length > 100) errors.municipality = 'Máximo 100 caracteres.';
  if (values.regulations.trim().length > 2000) errors.regulations = 'Máximo 2000 caracteres.';
  const tips = careTipsOf(values.care_tips);
  if (tips.length > MAX_CARE_TIPS) errors.care_tips = `Máximo ${MAX_CARE_TIPS} consejos.`;
  else if (tips.some((tip) => tip.length > 200))
    errors.care_tips = 'Cada consejo admite hasta 200 caracteres.';
  const badImage = values.images.findIndex((image) => !isImageUrl(image.url.trim()));
  if (values.images.length > MAX_IMAGES) errors.images = `Máximo ${MAX_IMAGES} imágenes.`;
  else if (badImage !== -1) {
    errors.images = `La imagen ${badImage + 1} necesita una imagen subida, una URL https o una ruta /img/…`;
  }
  return errors;
}

export function destinationPayload(values) {
  return {
    name: values.name.trim(),
    ...(values.slug.trim() && { slug: values.slug.trim() }),
    summary: values.summary.trim(),
    description: values.description.trim(),
    category: values.category,
    lat: parseLat(values.lat),
    lng: parseLng(values.lng),
    municipality: values.municipality.trim() || null,
    regulations: values.regulations.trim() || null,
    care_tips: careTipsOf(values.care_tips),
    is_protected_area: values.is_protected_area,
    status: values.status,
    images: values.images.map((image) => ({
      url: image.url.trim(),
      alt_text: image.alt_text.trim() || null,
    })),
  };
}

// ---------- education ----------

export const emptyEdu = () => ({
  title: '',
  slug: '',
  type: 'article',
  body: '',
  media_url: '',
  cover_url: '',
  category: '',
  is_published: false,
});

export function eduToForm(content) {
  return {
    title: content.title,
    slug: content.slug,
    type: content.type,
    body: content.body ?? '',
    media_url: content.media_url ?? '',
    cover_url: content.cover_url ?? '',
    category: content.category.slug,
    is_published: content.is_published,
  };
}

export function validateEdu(values) {
  const errors = {};
  if (!lengthBetween(values.title, 3, 160)) errors.title = 'El título debe tener entre 3 y 160 caracteres.';
  if (values.slug.trim() && !SLUG.test(values.slug.trim())) {
    errors.slug = 'Usa minúsculas, números y guiones.';
  }
  if (!values.category) errors.category = 'Elige una categoría.';
  const media = values.media_url.trim();
  if ((values.type === 'video' || values.type === 'link') && !media) {
    errors.media_url = 'Los videos y enlaces necesitan una URL https.';
  } else if (media && !isHttps(media)) {
    errors.media_url = 'Debe ser una URL que empiece con https://';
  }
  const cover = values.cover_url.trim();
  if (cover && !isImageUrl(cover)) errors.cover_url = 'Sube una imagen o usa una URL https.';
  if (values.body.trim().length > 20000) errors.body = 'Máximo 20 000 caracteres.';
  return errors;
}

export function eduPayload(values) {
  return {
    title: values.title.trim(),
    ...(values.slug.trim() && { slug: values.slug.trim() }),
    type: values.type,
    body: values.body.trim(),
    media_url: values.media_url.trim() || null,
    cover_url: values.cover_url.trim() || null,
    category: values.category,
    is_published: values.is_published,
  };
}

// ---------- users ----------

export const emptyUser = () => ({ full_name: '', email: '', role: 'authority', area_id: '' });

export function validateNewUser(values) {
  const errors = {};
  if (!lengthBetween(values.full_name, 2, 100))
    errors.full_name = 'El nombre debe tener entre 2 y 100 caracteres.';
  const email = values.email.trim();
  if (!EMAIL.test(email) || email.length > 254) errors.email = 'Ingresa un correo válido.';
  if (!['authority', 'admin'].includes(values.role)) errors.role = 'Elige un rol.';
  return errors;
}

export const newUserPayload = (values) => ({
  full_name: values.full_name.trim(),
  email: values.email.trim().toLowerCase(),
  role: values.role,
  area_id: values.area_id ? Number(values.area_id) : null,
});
