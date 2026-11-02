import { render } from '@testing-library/react';
import { MemoryRouter, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider.jsx';

export const LocationDisplay = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{pathname + search}</p>;
};

/**
 * Renders `routes` (a list of <Route>) inside a router and a real AuthProvider.
 * Seed a session beforehand with localStorage 'td:session' + a stubbed POST /auth/refresh.
 */
export function renderWithAuth(routes, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Routes>{routes}</Routes>
        <LocationDisplay />
      </AuthProvider>
    </MemoryRouter>,
  );
}
