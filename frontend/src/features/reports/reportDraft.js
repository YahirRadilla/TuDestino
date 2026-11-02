// The report form draft lives in SessionStorage (PWA-05): it survives a reload of the tab but not
// closing it. Photos are not part of it (they stay in memory until the report is queued).
const KEY = 'td:report-draft';

export const emptyDraft = () => ({
  clientUuid: crypto.randomUUID(),
  step: 1,
  type: '',
  description: '',
  lat: '',
  lng: '',
  accuracy_m: null,
  destination_slug: '',
  // null = the user has not chosen yet (the default depends on the session).
  anonymous: null,
});

export function readDraft() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw);
    return { ...emptyDraft(), ...parsed, clientUuid: parsed.clientUuid || crypto.randomUUID() };
  } catch {
    return emptyDraft();
  }
}

export function writeDraft(draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode or full storage: the draft just is not kept.
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up.
  }
}
