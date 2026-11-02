import pg from 'pg';

export function createPool(databaseUrl, { onError } = {}) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  // An idle client error must not crash the process.
  pool.on('error', (error) => onError?.(error));
  return pool;
}
