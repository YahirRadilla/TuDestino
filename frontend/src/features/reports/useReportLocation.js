import { useCallback, useRef, useState } from 'react';

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;
const TIMEOUT_MS = 15_000;

const round5 = (value) => Math.round(value * 100_000) / 100_000; // ~1 m

/**
 * Geolocation for the report form (PWA-14), behind an explicit button.
 * status: 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'error'
 * On success it calls `onFix({ lat, lng, accuracy_m })`.
 */
export function useReportLocation({ onFix } = {}) {
  const [status, setStatus] = useState('idle');
  const [accuracy, setAccuracy] = useState(null);
  const latestOnFix = useRef(onFix);
  latestOnFix.current = onFix;

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const fix = {
          lat: round5(coords.latitude),
          lng: round5(coords.longitude),
          accuracy_m: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null,
        };
        setAccuracy(fix.accuracy_m);
        setStatus('ready');
        latestOnFix.current?.(fix);
      },
      (error) => {
        setAccuracy(null);
        if (error?.code === PERMISSION_DENIED) setStatus('denied');
        else if (error?.code === POSITION_UNAVAILABLE) setStatus('unavailable');
        else if (error?.code === TIMEOUT) setStatus('timeout');
        else setStatus('error');
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 30_000 },
    );
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setAccuracy(null);
  }, []);

  return { status, accuracy, request, reset };
}

export const LOCATION_MESSAGES = {
  locating: 'Buscando tu ubicación…',
  denied: 'No diste permiso para usar tu ubicación. Puedes ajustarla a mano o elegir un destino cercano.',
  unavailable: 'No pudimos determinar tu ubicación. Ajústala a mano o elige un destino cercano.',
  timeout: 'Tardó demasiado en responder. Inténtalo de nuevo, ajústala a mano o elige un destino.',
  unsupported: 'Este navegador no ofrece ubicación. Ajústala a mano o elige un destino cercano.',
  error: 'No pudimos obtener tu ubicación. Ajústala a mano o elige un destino cercano.',
};
