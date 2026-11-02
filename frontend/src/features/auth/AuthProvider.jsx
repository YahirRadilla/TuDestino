import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { setAuthHandlers } from '../../api/client.js';
import * as authApi from './api/authApi.js';
import { AuthContext } from './authContext.js';
import { hasSessionHint, setSessionHint } from './sessionHint.js';

// Serializes refreshes across browser tabs: the refresh token rotates, so two tabs refreshing at
// once would look like a replayed token and sign the user out everywhere.
const withCrossTabLock = (task) =>
  typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('td-auth-refresh', task)
    : task();

/**
 * Keeps the session. The access token lives only in a ref (memory): it is never written to
 * localStorage/sessionStorage. The refresh token is an httpOnly cookie the page cannot read.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });
  const tokenRef = useRef(null);
  const refreshRef = useRef(null);
  const bootedRef = useRef(false);

  const startSession = useCallback((data) => {
    tokenRef.current = data.access_token;
    setSessionHint(true);
    setState({ status: 'authenticated', user: data.user });
    return data.access_token;
  }, []);

  const endSession = useCallback(() => {
    tokenRef.current = null;
    setSessionHint(false);
    setState({ status: 'anonymous', user: null });
  }, []);

  // One in-flight refresh shared by every caller (boot, concurrent 401s, StrictMode double effects).
  const refreshSession = useCallback(() => {
    refreshRef.current ??= withCrossTabLock(() => authApi.refresh())
      .then(startSession)
      .catch((error) => {
        // Only a rejected token ends the session; a network blip keeps the stored hint.
        if (error?.kind === 'http' && error.status === 401) endSession();
        else
          setState((current) =>
            current.status === 'loading' ? { status: 'anonymous', user: null } : current,
          );
        throw error;
      })
      .finally(() => {
        refreshRef.current = null;
      });
    return refreshRef.current;
  }, [startSession, endSession]);

  // Layout effects run before any child's passive effect, so the first authenticated fetch is covered.
  useLayoutEffect(
    () => setAuthHandlers({ getAccessToken: () => tokenRef.current, refresh: refreshSession }),
    [refreshSession],
  );

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (!hasSessionHint()) {
      setState({ status: 'anonymous', user: null });
      return;
    }
    refreshSession().catch(() => {});
  }, [refreshSession]);

  const login = useCallback(
    async (credentials) => startSession(await authApi.login(credentials)),
    [startSession],
  );
  const register = useCallback(
    async (details) => startSession(await authApi.register(details)),
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Offline or server down: the local session still ends; the server token expires on its own.
    }
    endSession();
  }, [endSession]);

  const updateProfile = useCallback(async (changes) => {
    const user = await authApi.updateMe(changes);
    setState((current) => ({ ...current, user }));
    return user;
  }, []);

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
      isAuthenticated: state.status === 'authenticated',
      login,
      register,
      logout,
      updateProfile,
    }),
    [state, login, register, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
