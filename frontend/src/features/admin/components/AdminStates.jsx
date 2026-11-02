import ErrorState from '../../../shared/components/ErrorState.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { adminErrorMessage, isForbidden, isOffline } from '../adminErrors.js';

export function AdminLoading({ label = 'Cargando…' }) {
  return (
    <div role="status" aria-live="polite" className="admin-loading">
      <div className="skeleton skeleton--row" />
      <div className="skeleton skeleton--row" />
      <div className="skeleton skeleton--row" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// 403 from the server (the role changed after the page loaded) gets its own explanation.
export function AdminError({ error, onRetry, title = 'No pudimos cargar la información' }) {
  if (isForbidden(error)) {
    return (
      <StateCard icon="shield" title="No tienes permiso para ver esto">
        Tu cuenta ya no tiene acceso a esta sección. Si crees que es un error, contacta a un administrador.
      </StateCard>
    );
  }
  return (
    <ErrorState title={isOffline(error) ? 'Sin conexión' : title} onRetry={onRetry}>
      {adminErrorMessage(error, 'Revisa tu conexión e inténtalo de nuevo.')}
    </ErrorState>
  );
}
