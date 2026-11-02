import { useEffect, useState } from 'react';

export const DESKTOP_QUERY = '(min-width: 768px)';

function match(query) {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => match(query));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
