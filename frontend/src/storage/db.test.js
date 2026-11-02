import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  MIGRATIONS,
  STORES,
  closeDb,
  getAll,
  getDb,
  getOne,
  putMany,
  putOne,
  replaceAll,
} from './db.js';

describe('IndexedDB schema', () => {
  it('creates every store, including the outbox reserved for the report queue', async () => {
    const db = await getDb();
    expect([...db.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());
    expect(db.version).toBe(DB_VERSION);
    const tx = db.transaction(STORES.outbox);
    expect(tx.store.autoIncrement).toBe(true);
    expect([...tx.store.indexNames]).toContain('createdAt');
  });

  it('has one migration step per schema version', () => {
    expect(MIGRATIONS).toHaveLength(DB_VERSION);
  });

  it('keeps its data when closed and reopened (same version, no upgrade needed)', async () => {
    // A hypothetical version 0 -> 1 upgrade is the only one that exists today; this verifies the
    // runner by opening a pre-seeded database that already holds the v1 stores.
    await closeDb();
    const seeded = await openDB(DB_NAME, 1, { upgrade: (db, o, n, tx) => MIGRATIONS[0](db, tx) });
    await seeded.put(STORES.favorites, { slug: 'balandra', addedAt: 'x' });
    seeded.close();
    expect(await getAll(STORES.favorites)).toEqual([{ slug: 'balandra', addedAt: 'x' }]);
  });
});

describe('helpers', () => {
  it('puts, reads and replaces records', async () => {
    await putOne(STORES.meta, { key: 'a', value: 1 });
    expect(await getOne(STORES.meta, 'a')).toEqual({ key: 'a', value: 1 });
    await replaceAll(STORES.meta, [{ key: 'b', value: 2 }]);
    expect(await getAll(STORES.meta)).toEqual([{ key: 'b', value: 2 }]);
  });

  it('putMany merges with the existing record', async () => {
    await putOne(STORES.meta, { key: 'a', value: { x: 1 } });
    await putMany(STORES.meta, [{ key: 'a', value: { y: 2 } }], (existing, incoming) => ({
      ...incoming,
      value: { ...existing.value, ...incoming.value },
    }));
    expect((await getOne(STORES.meta, 'a')).value).toEqual({ x: 1, y: 2 });
  });

  it('degrades to the fallback instead of throwing when IndexedDB fails', async () => {
    const original = globalThis.indexedDB;
    await closeDb();
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
    try {
      expect(await getAll(STORES.meta)).toEqual([]);
      expect(await getOne(STORES.meta, 'a')).toBeUndefined();
      expect(await replaceAll(STORES.meta, [{ key: 'a' }])).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true });
    }
  });
});
