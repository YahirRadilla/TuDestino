// Runs `work(client)` inside a single transaction on a dedicated pooled connection.
// Any error rolls everything back; the client always returns to the pool.
export async function withTransaction(db, work) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original error is the one worth reporting; a broken connection is discarded by the pool.
    }
    throw error;
  } finally {
    client.release();
  }
}
