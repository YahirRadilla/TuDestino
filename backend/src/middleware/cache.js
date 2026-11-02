// HTTP caching for read endpoints. Express already adds a weak ETag to every JSON body and
// answers If-None-Match with 304; these headers let browsers and the service worker reuse
// responses (SWR) without asking the API on every navigation.
export const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';
export const SHORT_PUBLIC_CACHE = 'public, max-age=15, stale-while-revalidate=60';

export const publicCache =
  (value = PUBLIC_CACHE) =>
  (_req, res, next) => {
    res.set('Cache-Control', value);
    next();
  };

// Responses that depend on who is asking: shared caches must never store them.
export const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

// For public resources that gain per-user fields when a session is present (e.g. `attending`).
// Run after `optionalAuthenticate`: anonymous requests stay cacheable, authenticated ones do not.
export const cacheUnlessAuthenticated =
  (value = PUBLIC_CACHE) =>
  (req, res, next) => {
    res.vary('Authorization');
    res.set('Cache-Control', req.user ? 'private, no-store' : value);
    next();
  };
