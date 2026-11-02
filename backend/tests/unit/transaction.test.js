import { describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/utils/transaction.js';
import { createFakeDb } from '../helpers/fakeDb.js';

describe('withTransaction', () => {
  it('commits and releases the client when the work succeeds', async () => {
    const db = createFakeDb();
    const result = await withTransaction(db, async (client) => {
      await client.query('SELECT 1');
      return 'done';
    });
    expect(result).toBe('done');
    expect(db.statements()).toEqual(['BEGIN', 'SELECT 1', 'COMMIT']);
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back, rethrows and releases when the work fails', async () => {
    const db = createFakeDb();
    await expect(
      withTransaction(db, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(db.statements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it('still rethrows the original error when ROLLBACK itself fails', async () => {
    const db = createFakeDb([['ROLLBACK', new Error('connection lost')]]);
    await expect(
      withTransaction(db, async () => {
        throw new Error('original');
      }),
    ).rejects.toThrow('original');
    expect(db.release).toHaveBeenCalledTimes(1);
  });
});
