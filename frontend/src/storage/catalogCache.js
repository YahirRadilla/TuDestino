import { STORES, getAll, getOne, putMany, putOne, replaceAll } from './db.js';

// IndexedDB mirror of the public catalog (PWA-05/08): whatever the user saw online stays available
// offline. Records keep the raw API item so the UI model can evolve without migrating data.

const KEY_FIELD = { destinations: 'slug', events: 'id', edu: 'slug' };

// Per-user or query-dependent fields must never be persisted in a shared, long-lived mirror.
const VOLATILE_FIELDS = ['distance_km', 'attending', 'favorited_at'];
const strip = (item) => {
  const copy = { ...item };
  for (const field of VOLATILE_FIELDS) delete copy[field];
  return copy;
};

const syncKey = (store) => `sync:${store}`;

export async function getSyncedAt(store) {
  return (await getOne(STORES.meta, syncKey(store)))?.value ?? null;
}

const markSynced = (store) => putOne(STORES.meta, { key: syncKey(store), value: new Date().toISOString() });

/**
 * Stores API items. `complete: true` means the list is the whole collection, so anything not in
 * it (unpublished, finished, deleted upstream) is dropped; otherwise records are only upserted.
 * An existing record keeps fields the incoming item lacks (a list item must not erase the
 * description fetched earlier by the detail endpoint).
 */
export async function mirrorItems(store, items, { complete = false } = {}) {
  const keyField = KEY_FIELD[store];
  const records = items.map((item) => ({ key: item[keyField], data: strip(item) }));
  const merge = (existing, record) => ({
    key: record.key,
    data: { ...existing?.data, ...record.data },
  });
  let ok;
  if (complete) {
    const existing = new Map((await getAll(store)).map((row) => [row.key, row]));
    ok = await replaceAll(
      store,
      records.map((record) => merge(existing.get(record.key), record)),
    );
  } else {
    ok = await putMany(store, records, merge);
  }
  if (ok) await markSynced(store);
  return ok;
}

// { items, syncedAt } with items = [] and syncedAt = null when nothing was ever stored.
export async function readMirror(store) {
  const [rows, syncedAt] = await Promise.all([getAll(store), getSyncedAt(store)]);
  return { items: rows.map((row) => row.data), syncedAt };
}

export async function readMirrorItem(store, key) {
  const row = await getOne(store, key);
  return row ? { item: row.data, syncedAt: await getSyncedAt(store) } : null;
}

export const mirrorDestinations = (items, options) => mirrorItems(STORES.destinations, items, options);
export const mirrorEvents = (items, options) => mirrorItems(STORES.events, items, options);
export const mirrorEdu = (items, options) => mirrorItems(STORES.edu, items, options);
