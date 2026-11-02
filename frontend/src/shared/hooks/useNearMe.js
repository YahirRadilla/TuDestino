import { useCallback, useState } from 'react';

const PERMISSION_DENIED = 1;
const round = (value) => Math.round(value * 10_000) / 10_000;

// Geolocation (PWA-14) behind an explicit user action; ~10 m precision is enough for sorting.
export function useNearMe() {
  const [state, setState] = useState({ status: 'idle', coords: null });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ status: 'unsupported', coords: null });
      return;
    }
    setState({ status: 'locating', coords: null });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setState({
          status: 'active',
          coords: { lat: round(coords.latitude), lng: round(coords.longitude) },
        }),
      (error) => setState({ status: error.code === PERMISSION_DENIED ? 'denied' : 'error', coords: null }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const clear = useCallback(() => setState({ status: 'idle', coords: null }), []);
  return { ...state, request, clear };
}
