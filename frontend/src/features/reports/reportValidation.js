export const MIN_DESCRIPTION = 10;
export const MAX_DESCRIPTION = 2000;
export const FOLIO_PATTERN = /^TD-\d{4}-\d{6}$/;

const NUMBER = /^-?\d+(\.\d+)?$/;

// Accepts "24,14" typed on a Spanish keyboard.
export function parseCoordinate(value, { min, max }) {
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!NUMBER.test(text)) return null;
  const number = Number(text);
  return number >= min && number <= max ? number : null;
}

export const parseLat = (value) => parseCoordinate(value, { min: -90, max: 90 });
export const parseLng = (value) => parseCoordinate(value, { min: -180, max: 180 });

/** Errors for one step of the form: an object { field: message } (empty = valid). */
export function validateStep(step, values) {
  const errors = {};
  if (step === 1 && !values.type) errors.type = 'Elige qué quieres reportar.';
  if (step === 2) {
    if (parseLat(values.lat) === null) errors.lat = 'Latitud entre -90 y 90.';
    if (parseLng(values.lng) === null) errors.lng = 'Longitud entre -180 y 180.';
  }
  if (step === 3) {
    const length = values.description.trim().length;
    if (length < MIN_DESCRIPTION) {
      errors.description = `Cuéntanos un poco más (mínimo ${MIN_DESCRIPTION} caracteres).`;
    } else if (length > MAX_DESCRIPTION) {
      errors.description = `Máximo ${MAX_DESCRIPTION} caracteres.`;
    }
  }
  return errors;
}

export function normalizeFolio(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

export function normalizeCode(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

export function validateTracking({ folio, code }) {
  const errors = {};
  if (!FOLIO_PATTERN.test(normalizeFolio(folio))) errors.folio = 'El folio tiene el formato TD-2026-000123.';
  if (normalizeCode(code).length < 6) errors.code = 'Escribe el código de seguimiento completo.';
  return errors;
}
