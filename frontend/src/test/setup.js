import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { closeDb, DB_NAME } from '../storage/db.js';
import { resetFavoritesStoreForTests } from '../storage/favoritesStore.js';

// Every test starts with an empty IndexedDB and a fresh in-memory favorites store.
afterEach(async () => {
  cleanup();
  resetFavoritesStoreForTests();
  await closeDb();
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});
