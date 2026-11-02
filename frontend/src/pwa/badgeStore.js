import { getOne, putOne, STORES } from '../storage/db.js';
import { BADGE_META_KEY } from './push.js';

// The app-icon badge number, kept in IndexedDB so the worker (which has no memory between pushes)
// and the page agree on it. Storage failures are swallowed by `safely`: the badge is optional.
export const badgeStore = Object.freeze({
  async get() {
    const record = await getOne(STORES.meta, BADGE_META_KEY);
    return Number.isInteger(record?.value) ? record.value : 0;
  },
  async set(value) {
    await putOne(STORES.meta, { key: BADGE_META_KEY, value });
  },
});
