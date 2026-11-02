import { describe, expect, it, vi } from 'vitest';
import { buildPayload, createNotifier, noopNotifier } from '../../src/services/notify.js';

const VAPID = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:test@example.com' };

const sub = (id, extra = {}) => ({
  id,
  user_id: null,
  endpoint: `https://push.example.com/send/${id}`,
  p256dh: 'p256dh-key',
  auth: 'auth-secret',
  ...extra,
});

const pushError = (statusCode) => Object.assign(new Error('push failed'), { statusCode });

function setup({ sendNotification = vi.fn(async () => ({ statusCode: 201 })), query } = {}) {
  const db = { query: query ?? vi.fn(async () => ({ rows: [], rowCount: 0 })) };
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  const notifier = createNotifier({ db, logger, vapid: VAPID, webPush: { sendNotification } });
  return { db, logger, notifier, sendNotification };
}

describe('buildPayload', () => {
  it('serialises only title, body, relative url, tag and an optional badge', () => {
    const json = JSON.parse(
      buildPayload({ title: 'Hola', body: 'Cuerpo', url: '/eventos/1', tag: 'x', badge: 3 }),
    );
    expect(json).toEqual({ title: 'Hola', body: 'Cuerpo', url: '/eventos/1', tag: 'x', badge: 3 });
  });

  it('never carries unknown fields such as notes, codes or coordinates', () => {
    const json = JSON.parse(
      buildPayload({ title: 'T', body: 'B', note: 'secreto', tracking_code: 'ABC123', lat: 24.1 }),
    );
    expect(Object.keys(json).sort()).toEqual(['body', 'tag', 'title', 'url']);
  });

  it('falls back to "/" for absolute or protocol-relative urls', () => {
    expect(JSON.parse(buildPayload({ title: 'T', url: 'https://evil.example/' })).url).toBe('/');
    expect(JSON.parse(buildPayload({ title: 'T', url: '//evil.example/' })).url).toBe('/');
  });

  it('clips long texts so the payload stays small', () => {
    const json = JSON.parse(buildPayload({ title: 'a'.repeat(500), body: 'b'.repeat(500) }));
    expect(json.title.length).toBeLessThanOrEqual(90);
    expect(json.body.length).toBeLessThanOrEqual(160);
  });
});

describe('sendToSubscriptions', () => {
  it('sends the payload with VAPID details, TTL, urgency and a timeout', async () => {
    const { notifier, sendNotification } = setup();
    const stats = await notifier.sendToSubscriptions([sub(1)], '{"title":"x"}', {
      ttl: 60,
      urgency: 'high',
    });
    expect(stats).toEqual({ sent: 1, removed: 0, failed: 0 });
    const [target, body, options] = sendNotification.mock.calls[0];
    expect(target).toEqual({
      endpoint: 'https://push.example.com/send/1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
    });
    expect(body).toBe('{"title":"x"}');
    expect(options).toMatchObject({
      vapidDetails: VAPID,
      TTL: 60,
      urgency: 'high',
      timeout: expect.any(Number),
    });
  });

  it.each([404, 410])(
    'deletes the subscription when the push service answers %i',
    async (status) => {
      const { notifier, db } = setup({
        sendNotification: vi.fn(async () => {
          throw pushError(status);
        }),
      });
      const stats = await notifier.sendToSubscriptions([sub(7)], '{}');
      expect(stats).toEqual({ sent: 0, removed: 1, failed: 0 });
      expect(db.query).toHaveBeenCalledWith('DELETE FROM push_subscriptions WHERE id = $1', [7]);
    },
  );

  it('keeps the subscription and logs without payload or endpoint on other failures', async () => {
    const { notifier, db, logger } = setup({
      sendNotification: vi.fn(async () => {
        throw pushError(500);
      }),
    });
    const stats = await notifier.sendToSubscriptions([sub(3)], '{"title":"Dato sensible"}');
    expect(stats).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect(db.query).not.toHaveBeenCalled();
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toContain('Dato sensible');
    expect(logged).not.toContain('push.example.com');
    expect(logged).not.toContain('auth-secret');
  });

  it('keeps going after one device fails', async () => {
    const sendNotification = vi.fn(async (target) => {
      if (target.endpoint.endsWith('/1')) throw pushError(410);
      return { statusCode: 201 };
    });
    const { notifier } = setup({ sendNotification });
    const stats = await notifier.sendToSubscriptions([sub(1), sub(2), sub(3)], '{}');
    expect(stats).toEqual({ sent: 2, removed: 1, failed: 0 });
  });

  it('limits how many deliveries run at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const sendNotification = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });
    const db = { query: vi.fn() };
    const notifier = createNotifier({
      db,
      vapid: VAPID,
      webPush: { sendNotification },
      concurrency: 3,
    });
    await notifier.sendToSubscriptions(
      Array.from({ length: 12 }, (_, i) => sub(i + 1)),
      '{}',
    );
    expect(sendNotification).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('does nothing without VAPID keys', async () => {
    const sendNotification = vi.fn();
    const notifier = createNotifier({
      db: { query: vi.fn() },
      vapid: null,
      webPush: { sendNotification },
    });
    expect(await notifier.sendToSubscriptions([sub(1)], '{}')).toEqual({
      sent: 0,
      removed: 0,
      failed: 0,
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe('background work', () => {
  it('enqueue returns immediately and never rejects', async () => {
    const { notifier, logger } = setup();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const task = notifier.enqueue('slow', () =>
      gate.then(() => {
        throw new Error('boom');
      }),
    );
    // The caller is not blocked: the task is still running.
    let settled = false;
    task.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await expect(task).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'slow' }),
      expect.any(String),
    );
  });

  it('idle() waits for queued work', async () => {
    const { notifier } = setup();
    let done = false;
    notifier.enqueue('a', async () => {
      await new Promise((r) => setTimeout(r, 10));
      done = true;
    });
    await notifier.idle();
    expect(done).toBe(true);
  });

  it('reportStatusChanged does not leak the staff note and returns before the push completes', async () => {
    const sendNotification = vi.fn(() => new Promise(() => {})); // a push service that never answers
    const query = vi.fn(async (sql) => {
      if (sql.includes('FROM reports'))
        return {
          rows: [{ id: 'r1', folio: 'TD-2026-000001', status: 'in_review', reporter_id: null }],
        };
      if (sql.includes('FROM report_followers')) return { rows: [sub(1)] };
      return { rows: [] };
    });
    const { notifier } = setup({ sendNotification, query });
    const started = notifier.reportStatusChanged({ reportId: 'r1' });
    expect(started).toBeInstanceOf(Promise); // returned synchronously; nothing awaited it
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalled());
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.title).toContain('TD-2026-000001');
    expect(payload.body).toContain('en revisión');
    expect(payload.url).toBe('/seguimiento?folio=TD-2026-000001');
    expect(Object.keys(payload).sort()).toEqual(['body', 'tag', 'title', 'url']);
  });
});

describe('noopNotifier', () => {
  it('accepts every call and resolves', async () => {
    await expect(noopNotifier.reportStatusChanged({})).resolves.toBeUndefined();
    await expect(noopNotifier.eventModerated({})).resolves.toBeUndefined();
    await expect(noopNotifier.idle()).resolves.toBeUndefined();
  });
});
