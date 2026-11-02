import { useCallback, useState } from 'react';
import { readString, writeString } from '../../storage/localStore.js';

export const THEME_KEY = 'td.theme';

export function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => (readString(THEME_KEY) === 'dark' ? 'dark' : 'light'));

  const setTheme = useCallback((next) => {
    writeString(THEME_KEY, next);
    applyTheme(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
