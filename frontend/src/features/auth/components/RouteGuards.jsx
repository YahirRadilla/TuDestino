import { Navigate, useLocation } from 'react-router-dom';
import AccessDenied from '../../../shared/components/AccessDenied.jsx';
import { useAuth } from '../authContext.js';

function SessionLoading() {
  return (
    <div className="container page" role="status" aria-live="polite">
      <div className="skeleton skeleton--title" />
      <span className="sr-only">Verificando tu sesión…</span>
    </div>
  );
}

// Sends anonymous visitors to /login and remembers where they were going.
export function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <SessionLoading />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

// Authenticated users with the wrong role see an access-denied screen (the server enforces it too).
export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  return <RequireAuth>{user && roles.includes(user.role) ? children : <AccessDenied />}</RequireAuth>;
}
