import webPushLib from 'web-push';
import * as push from '../models/pushModel.js';
import * as inbox from '../models/notificationModel.js';

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 10_000;
// A push service rejects bodies above ~4 KB; stay far below it.
const MAX_PAYLOAD_BYTES = 2048;
const MAX_TITLE = 90;
const MAX_BODY = 160;

const STATUS_LABELS = Object.freeze({
  pending: 'pendiente',
  in_review: 'en revisión',
  resolved: 'resuelto',
  dismissed: 'descartado',
});

const clip = (text, max) => {
  const value = String(text ?? '').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

// A path inside the app: the service worker only ever navigates to same-origin relative URLs.
const safeUrl = (url) => (typeof url === 'string' && /^\/(?!\/)/.test(url) ? url : '/');

// The wire format of every push. Deliberately tiny and free of sensitive data: no coordinates, no
// descriptions, no staff notes, no tracking code and no account data (RNF03, ADR-03).
export function buildPayload({ title, body = '', url = '/', tag, badge }) {
  const payload = {
    title: clip(title, MAX_TITLE),
    body: clip(body, MAX_BODY),
    url: safeUrl(url),
    tag: clip(tag ?? 'tudestino', 64),
  };
  if (Number.isInteger(badge) && badge >= 0) payload.badge = badge;
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES) {
    throw new RangeError('push payload too large');
  }
  return json;
}

// Runs `worker` over `items` with at most `limit` in flight at once.
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

const eventUrl = (id) => `/eventos/${id}`;

// Sends Web Push messages and keeps the in-app inbox in sync. Everything here is best effort and
// runs AFTER the request that caused it has been answered: `enqueue` never throws and never makes
// an HTTP response wait for a push service.
export function createNotifier({
  db,
  logger,
  vapid,
  webPush = webPushLib,
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const pending = new Set();
  const log = logger ?? { warn() {}, error() {}, info() {} };
  const enabled = Boolean(vapid?.publicKey && vapid?.privateKey && vapid?.subject);

  // Delivers one prepared payload to many subscriptions. 404/410 means the browser revoked the
  // subscription: it is removed. Any other failure is logged WITHOUT the payload or the endpoint.
  async function sendToSubscriptions(
    subscriptions,
    payloadJson,
    { ttl = 86_400, urgency = 'normal' } = {},
  ) {
    const stats = { sent: 0, removed: 0, failed: 0 };
    if (!enabled || subscriptions.length === 0) return stats;
    await mapLimit(subscriptions, concurrency, async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payloadJson,
          { vapidDetails: vapid, TTL: ttl, urgency, timeout: timeoutMs },
        );
        stats.sent += 1;
      } catch (error) {
        const status = error?.statusCode;
        if (status === 404 || status === 410) {
          stats.removed += 1;
          await push.deleteById(db, subscription.id).catch((dbError) => {
            log.error(
              { err: dbError, subscriptionId: subscription.id },
              'push: no se pudo borrar la suscripción',
            );
          });
        } else {
          stats.failed += 1;
          log.warn(
            { status: status ?? null, code: error?.code ?? null, subscriptionId: subscription.id },
            'push: envío fallido',
          );
        }
      }
    });
    return stats;
  }

  // Adds one inbox row per user and pushes to that user's devices with their unread count (badge).
  async function notifyUsers(userIds, message, options) {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return { users: 0 };
    const subscriptions = await push.findByUserIds(db, unique);
    const byUser = new Map();
    for (const subscription of subscriptions) {
      byUser.set(subscription.user_id, [...(byUser.get(subscription.user_id) ?? []), subscription]);
    }
    await mapLimit(unique, concurrency, async (userId) => {
      await inbox.insert(db, {
        userId,
        type: message.type,
        title: clip(message.title, MAX_TITLE),
        body: clip(message.body, MAX_BODY),
        url: safeUrl(message.url),
      });
      const devices = byUser.get(userId) ?? [];
      if (devices.length === 0) return;
      const badge = await inbox.count(db, userId, { unreadOnly: true });
      await sendToSubscriptions(devices, buildPayload({ ...message, badge }), options);
    });
    return { users: unique.length };
  }

  // Detached work: errors are logged, never propagated. Tracked so tests (and shutdown) can await it.
  function enqueue(label, work) {
    const task = Promise.resolve()
      .then(work)
      .catch((error) =>
        log.error({ err: error, task: label }, 'push: tarea en segundo plano fallida'),
      )
      .finally(() => pending.delete(task));
    pending.add(task);
    return task;
  }

  async function reportStatusChanged({ reportId }) {
    const { rows } = await db.query(
      'SELECT id, folio, status, reporter_id FROM reports WHERE id = $1',
      [reportId],
    );
    const report = rows[0];
    if (!report) return;
    const message = {
      type: 'report_status',
      title: `Tu reporte ${report.folio} cambió de estado`,
      body: `Ahora está «${STATUS_LABELS[report.status] ?? report.status}».`,
      url: `/seguimiento?folio=${encodeURIComponent(report.folio)}`,
      tag: `report-${report.folio}`,
    };
    const options = { urgency: 'high' };
    // The reporter with an account gets an inbox row; anonymous followers only get the push.
    const accountDevices = report.reporter_id
      ? await push.findByUserIds(db, [report.reporter_id])
      : [];
    const followers = await push.findFollowers(db, reportId);
    const accountIds = new Set(accountDevices.map((device) => device.id));
    const followerOnly = followers.filter((device) => !accountIds.has(device.id));
    if (report.reporter_id) await notifyUsers([report.reporter_id], message, options);
    await sendToSubscriptions(followerOnly, buildPayload(message), options);
  }

  async function eventModerated({ eventId, action, actorId }) {
    const { rows } = await db.query('SELECT id, title, organizer_id FROM events WHERE id = $1', [
      eventId,
    ]);
    const event = rows[0];
    if (!event) return;
    const title = clip(event.title, 70);
    const notOrganizer =
      event.organizer_id && event.organizer_id !== actorId ? [event.organizer_id] : [];
    if (action === 'approve') {
      await notifyUsers(notOrganizer, {
        type: 'event_approved',
        title: 'Tu evento fue aprobado',
        body: `«${title}» ya aparece en el calendario.`,
        url: eventUrl(event.id),
        tag: `event-${event.id}`,
      });
    } else if (action === 'reject') {
      await notifyUsers(notOrganizer, {
        type: 'event_rejected',
        title: 'Tu evento no fue aprobado',
        body: `Revisa los comentarios sobre «${title}».`,
        url: '/perfil/propuestas',
        tag: `event-${event.id}`,
      });
    } else if (action === 'cancel') {
      const attendees = await db.query(
        'SELECT user_id FROM event_attendances WHERE event_id = $1',
        [event.id],
      );
      const recipients = new Set([...notOrganizer, ...attendees.rows.map((row) => row.user_id)]);
      recipients.delete(actorId);
      await notifyUsers([...recipients], {
        type: 'event_cancelled',
        title: 'Evento cancelado',
        body: `«${title}» fue cancelado.`,
        url: '/eventos',
        tag: `event-${event.id}`,
      });
    }
  }

  // `reminders`: rows { user_id, event_id, title } already claimed by the reminder job.
  async function eventReminders(reminders) {
    await mapLimit(reminders, concurrency, (reminder) =>
      notifyUsers(
        [reminder.user_id],
        {
          type: 'event_reminder',
          title: 'Recordatorio de evento',
          body: `«${clip(reminder.title, 70)}» empieza en menos de 24 horas.`,
          url: eventUrl(reminder.event_id),
          tag: `reminder-${reminder.event_id}`,
        },
        { ttl: 6 * 3600 },
      ),
    );
  }

  return {
    enabled,
    sendToSubscriptions,
    notifyUsers,
    enqueue,
    reportStatusChanged: (args) => enqueue('report-status', () => reportStatusChanged(args)),
    eventModerated: (args) => enqueue('event-moderated', () => eventModerated(args)),
    eventReminders,
    idle: async () => {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
  };
}

// Used where no push service is configured (catalog-only setups, unit tests).
export const noopNotifier = Object.freeze({
  enabled: false,
  reportStatusChanged: () => Promise.resolve(),
  eventModerated: () => Promise.resolve(),
  eventReminders: () => Promise.resolve(),
  idle: () => Promise.resolve(),
});
