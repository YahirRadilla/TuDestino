// One place that turns an ApiError into the sentence the person sees. The server's own message
// (Spanish, never technical) is kept for validation and rule violations (400/404/409).
export function adminErrorMessage(error, fallback = 'No se pudo completar la acción. Inténtalo de nuevo.') {
  if (error?.kind === 'offline' || error?.kind === 'network' || error?.kind === 'timeout') {
    return 'Sin conexión: el panel necesita internet. Inténtalo cuando vuelvas a tener señal.';
  }
  if (error?.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo.';
  if (error?.status === 403) return 'No tienes permiso para realizar esta acción.';
  if (error?.status === 429) return 'Demasiadas solicitudes. Espera un momento e inténtalo otra vez.';
  if ([400, 404, 409].includes(error?.status) && error.message) return error.message;
  return fallback;
}

export const isForbidden = (error) => error?.status === 403;
export const isOffline = (error) => error?.kind === 'offline';
