import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/**
 * status: 'loading' (restoring the session) | 'authenticated' | 'anonymous'.
 * Exposes user, login, register, logout, updateProfile and isAuthenticated.
 */
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return value;
}

const ANONYMOUS_SESSION = Object.freeze({
  status: 'anonymous',
  user: null,
  isAuthenticated: false,
});

/**
 * Read-only view of the session for components that also work for anonymous visitors
 * (favorites, reviews, attendance). Outside an <AuthProvider> it behaves as "anonymous".
 */
export function useSession() {
  return useContext(AuthContext) ?? ANONYMOUS_SESSION;
}
