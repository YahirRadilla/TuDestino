// Web Share API with clipboard fallback (PWA-15).
// Returns 'shared' | 'copied' | 'cancelled' | 'failed'.
export async function shareOrCopy({ title, text, url }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
      // otherwise fall through to the clipboard fallback
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function normalizeText(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
