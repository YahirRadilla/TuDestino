// The public catalog is cached by the browser and by the service worker. After a write that
// changes aggregate fields (for example a review), the next catalog request must use a new URL
// so neither cache can answer with the old rating/count.
const STORAGE_KEY = 'td:catalog:revision';

// Fallback for environments where localStorage is unavailable.
let memoryRevision;

export function catalogRevision() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) || memoryRevision;
  } catch {
    return memoryRevision;
  }
}

export function markCatalogStale() {
  const revision = String(Date.now());
  memoryRevision = revision;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, revision);
  } catch {
    // Storage can be unavailable (private mode, restricted embeds); the in-memory revision still
    // makes the next request use a new URL for this session.
  }
}

// Query params that force the browser and the service worker to miss their cached public copy
// once after a write. Use it in every public catalogue read (destinations, events, education,
// map pins).
export function freshnessParams() {
  const revision = catalogRevision();
  return revision ? { _r: revision } : {};
}
