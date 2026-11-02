// A non-sensitive flag (never the token) that tells the next page load whether a refresh cookie
// probably exists, so anonymous visitors do not trigger a pointless 401 on every load.
const KEY = 'td:session';

export const hasSessionHint = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // Storage blocked: fall back to always trying.
  }
};

export const setSessionHint = (active) => {
  try {
    if (active) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the hint is only an optimization.
  }
};
