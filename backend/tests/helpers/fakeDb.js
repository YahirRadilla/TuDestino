import { vi } from 'vitest';

// A scripted database for route/service tests: each handler is [pattern, result | (params) => result].
// The first pattern found in the SQL text wins; unmatched statements resolve to no rows.
// `connect()` hands out a client that shares the same script and records BEGIN/COMMIT/ROLLBACK.
export function createFakeDb(script = []) {
  const log = [];
  const run = async (text, params = []) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    log.push({ text: normalized, params });
    for (const [pattern, result] of script) {
      if (normalized.includes(pattern)) {
        const value = typeof result === 'function' ? await result(params) : result;
        if (value instanceof Error) throw value;
        return value;
      }
    }
    return { rows: [], rowCount: 0 };
  };
  const query = vi.fn(run);
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return {
    query,
    connect,
    release,
    log,
    statements: () => log.map((entry) => entry.text),
    has: (needle) => log.some((entry) => entry.text.includes(needle)),
  };
}

export const rows = (...items) => ({ rows: items, rowCount: items.length });
