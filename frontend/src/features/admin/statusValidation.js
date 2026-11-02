export const NOTE_MIN = 3;
export const NOTE_MAX = 1000;

/** Errors for the status-change form: { field: message } (empty = valid). */
export function validateStatusChange({ status, note }, allowed) {
  const errors = {};
  if (!status || !allowed.includes(status)) errors.status = 'Elige el nuevo estado.';
  const length = String(note ?? '').trim().length;
  if (length < NOTE_MIN) {
    errors.note = `Escribe una nota de al menos ${NOTE_MIN} caracteres: queda en el historial.`;
  } else if (length > NOTE_MAX) {
    errors.note = `La nota no puede superar ${NOTE_MAX} caracteres.`;
  }
  return errors;
}
