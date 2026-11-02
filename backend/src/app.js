import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createApiRouter } from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createLogger } from './config/logger.js';

export function createApp({
  clientOrigin,
  db,
  logger = createLogger('silent'),
  rateLimitPerMinute,
  trustProxy = false,
  auth,
  reports,
  admin,
  push,
} = {}) {
  const app = express();
  app.locals.logger = logger;
  app.disable('x-powered-by');
  // true = one hop; a number = that many proxy hops; false = trust none (req.ip is the socket).
  if (trustProxy) app.set('trust proxy', trustProxy === true ? 1 : trustProxy);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, origin === clientOrigin),
      credentials: true,
    }),
  );
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    '/api/v1',
    createApiRouter({ db, rateLimitPerMinute, auth, logger, reports, admin, push }),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
