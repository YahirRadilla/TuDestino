// Client-side checks mirror the API rules (backend/src/validators/auth.js) for instant feedback.
// The server stays the authority; every function returns an error message or '' when valid.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_BYTES = 72;

export function validateEmail(value) {
  const email = value.trim();
  if (!email) return 'Ingresa tu correo.';
  if (email.length > 254 || !EMAIL.test(email)) return 'Ingresa un correo válido, como nombre@correo.com.';
  return '';
}

export function validateFullName(value) {
  const name = value.trim();
  if (!name) return 'Ingresa tu nombre.';
  if (name.length < 2) return 'El nombre debe tener al menos 2 caracteres.';
  if (name.length > 100) return 'El nombre es demasiado largo.';
  return '';
}

export function validateRequiredPassword(value) {
  return value ? '' : 'Ingresa tu contraseña.';
}

export function validateNewPassword(value) {
  if (!value) return 'Crea una contraseña.';
  if (value.length < 8) return 'Usa al menos 8 caracteres.';
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES) {
    return 'La contraseña es demasiado larga (máximo 72 bytes).';
  }
  if (!/\d/.test(value)) return 'Incluye al menos un número.';
  if (!/[^\p{L}\p{N}\s]/u.test(value)) return 'Incluye al menos un símbolo, como ! # $ o ?.';
  return '';
}

export function validatePasswordConfirmation(password, confirmation) {
  if (!confirmation) return 'Repite la contraseña.';
  return password === confirmation ? '' : 'Las contraseñas no coinciden.';
}

// Optional field: empty means "no avatar".
export function validateAvatarUrl(value) {
  const url = value.trim();
  if (!url) return '';
  if (url.length > 500) return 'La dirección es demasiado larga.';
  try {
    return new URL(url).protocol === 'https:' ? '' : 'Usa una dirección que empiece con https://';
  } catch {
    return 'Ingresa una dirección válida que empiece con https://';
  }
}

// Runs { field: validator() } and returns only the failing fields.
export function collectErrors(checks) {
  return Object.fromEntries(Object.entries(checks).filter(([, message]) => message));
}
