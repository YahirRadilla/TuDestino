import pino from 'pino';

// Log method, path and status only: bodies, headers and query strings may carry location or
// credentials. Redaction is a second line of defence if someone logs a request-shaped object:
// no IP address, user agent, cookie, body or query ever reaches a log line (ADR-03).
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["user-agent"]',
  'req.headers["x-forwarded-for"]',
  'req.ip',
  'req.remoteAddress',
  'req.body',
  'req.query',
  'ip',
  'remoteAddress',
  'body',
  'query',
  'headers',
];

export const createLogger = (level = 'info', destination) =>
  pino({ level, redact: { paths: REDACTED_PATHS, censor: '[redacted]' } }, destination);
