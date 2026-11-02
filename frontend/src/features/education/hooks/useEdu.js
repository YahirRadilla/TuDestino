import { useEffect, useState } from 'react';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { fetchEduCategories, fetchEduContents } from '../api/eduApi.js';
import { loadEduCategoriesOffline, loadEduOffline } from '../data/offlineEdu.js';

export function useEduContents({ category = null, type = null, q = '' } = {}) {
  const filters = { category: category ?? undefined, type: type ?? undefined, q: q || undefined };
  return useRemoteData({
    key: JSON.stringify(filters),
    load: (signal) => fetchEduContents(filters, signal),
    fallback: () => loadEduOffline(filters),
  });
}

export function useEduCategories() {
  return useRemoteData({
    key: 'edu-categories',
    load: (signal) => fetchEduCategories(signal),
    fallback: () => loadEduCategoriesOffline(),
  });
}

// Returns `value` only after it stopped changing for `delayMs` (keeps typing from firing requests).
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
