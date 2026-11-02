import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createPool } from './config/db.js';
import { createLogger } from './config/logger.js';
import { createMailer } from './services/mailer.js';
import { createStorage } from './services/storage.js';
import { createNotifier } from './services/notify.js';
import { createReminderScheduler } from './services/reminders.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const logger = createLogger(config.logLevel);
const pool = createPool(config.databaseUrl, {
  onError: (error) => logger.error({ err: error }, 'idle database client error'),
});
const notifier = createNotifier({ db: pool, logger, vapid: config.push.vapid });
const app = createApp({
  push: {
    vapid: config.push.vapid,
    allowedHosts: config.push.allowedHosts,
    rateLimit: config.push.rateLimit,
    notifier,
  },
  clientOrigin: config.clientOrigin,
  db: pool,
  logger,
  rateLimitPerMinute: config.rateLimitPerMinute,
  trustProxy: config.trustProxy,
  reports: {
    storage: createStorage(config.reports.storage),
    rateLimit: config.reports.rateLimit,
    trackRateLimit: config.reports.trackRateLimit,
  },
  auth: {
    ...config.auth,
    mailer: createMailer({
      smtpUrl: config.mail.smtpUrl,
      from: config.mail.from,
      clientOrigin: config.clientOrigin,
      nodeEnv: config.nodeEnv,
      logger,
    }),
  },
});

const reminders = createReminderScheduler({
  db: pool,
  notifier,
  logger,
  intervalMs: config.push.remindersIntervalMs,
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'TuDestino API escuchando');
  if (config.push.remindersEnabled) reminders.start();
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'cerrando servidor');
  const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
  force.unref();
  server.close(async () => {
    // Let the reminder pass and any push in flight finish before the pool goes away.
    await reminders.stop();
    await notifier.idle();
    await pool.end().catch((error) => logger.error({ err: error }, 'error al cerrar el pool'));
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
