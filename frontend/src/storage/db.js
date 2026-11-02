import { openDB } from 'idb';

// IndexedDB (PWA-05): content mirrors for offline use, favorites and the report outbox.
export const DB_NAME = 'tudestino';
export const DB_VERSION = 1;

export const STORES = Object.freeze({
  destinations: 'destinations', // key: slug     -> { key, data (raw API item) }
  events: 'events', //             key: id       -> { key, data (raw API item) }
  edu: 'edu', //                   key: slug     -> { key, data (raw API item) }
  favorites: 'favorites', //       key: slug     -> { slug, addedAt }
  outbox: 'outbox', //             key: id (autoIncrement). Created now; filled by the report queue (F5).
  meta: 'meta', //                 key: key      -> { key, value } (last sync times, schema notes)
});

// Each step upgrades from version N-1 to N. Add a new entry (and bump DB_VERSION) to change the
// schema; never edit a released step, because users may already be at that version.
export const MIGRATIONS = [
  function v1(db) {
    db.createObjectStore(STORES.destinations, { keyPath: 'key' });
    db.createObjectStore(STORES.events, { keyPath: 'key' });
    db.createObjectStore(STORES.edu, { keyPath: 'key' });
    db.createObjectStore(STORES.favorites, { keyPath: 'slug' });
    const outbox = db.createObjectStore(STORES.outbox, { keyPath: 'id', autoIncrement: true });
    outbox.createIndex('createdAt', 'createdAt');
    db.createObjectStore(STORES.meta, { keyPath: 'key' });
  },
];

export function upgradeDatabase(db, oldVersion, newVersion, transaction) {
  for (let version = oldVersion; version < (newVersion ?? DB_VERSION); version += 1) {
    MIGRATIONS[version](db, transaction);
  }
}

let connection = null;

// One shared connection. `idb` is unavailable in some private modes: callers treat a rejected
// promise as "no local storage" and keep working with the network only.
export function getDb() {
  connection ??= openDB(DB_NAME, DB_VERSION, {
    upgrade: upgradeDatabase,
    terminated() {
      connection = null;
    },
  }).catch((error) => {
    connection = null;
    throw error;
  });
  return connection;
}

// Test helper: closes the shared connection so a test can delete the database.
export async function closeDb() {
  if (!connection) return;
  const db = await connection.catch(() => null);
  connection = null;
  db?.close();
}

// Never throws: local storage is an optimisation, not a requirement.
export async function safely(task, fallback) {
  try {
    return await task(await getDb());
  } catch {
    return fallback;
  }
}

export const getAll = (store) => safely((db) => db.getAll(store), []);
export const getOne = (store, key) => safely((db) => db.get(store, key), undefined);
export const putOne = (store, value) => safely((db) => db.put(store, value), undefined);

// Replaces the whole store content atomically (used for complete snapshots and favorites).
export function replaceAll(store, values) {
  return safely(async (db) => {
    const tx = db.transaction(store, 'readwrite');
    await tx.store.clear();
    await Promise.all(values.map((value) => tx.store.put(value)));
    await tx.done;
    return true;
  }, false);
}

// Upserts many records in one transaction; `merge` combines an existing record with the new one.
export function putMany(store, values, merge = (_existing, incoming) => incoming) {
  return safely(async (db) => {
    const tx = db.transaction(store, 'readwrite');
    const keyPath = tx.store.keyPath;
    await Promise.all(
      values.map(async (value) => {
        const existing = await tx.store.get(value[keyPath]);
        await tx.store.put(merge(existing, value));
      }),
    );
    await tx.done;
    return true;
  }, false);
}

export const deleteOne = (store, key) => safely((db) => db.delete(store, key), undefined);
