import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-only-secret-change-me-before-deploying-0000';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

// DEVELOPMENT / TEST ONLY. A fixed pair keeps push subscriptions valid across restarts of a local
// API. The private half is public in this repository, so production refuses to start with it
// (generate a pair with `npm run vapid:generate`).
export const DEV_VAPID_KEYS = Object.freeze({
  publicKey:
    'BK_xnJ2zOHALlYoTFexdga1RUSzRMNyP9xx4-MUeGPXUs5wT0yGjM-ArLyJ65jpKolR4_1kkMDI-OR_agjuiHMs',
  privateKey: 'WPU6VuL8ewtH_4TRp-VzK_T_eh_hZJlJfbly5Qd7lTk',
  subject: 'mailto:dev@tudestino.local',
});

// Push services we accept subscriptions from in production (SSRF guard: the API POSTs to these).
export const DEFAULT_PUSH_HOSTS = Object.freeze([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'push.apple.com',
  'notify.windows.com',
]);

// base64url, as produced by `web-push generate-vapid-keys` (public: 65-byte point, private: 32).
const vapidPublic = z.string().regex(/^[A-Za-z0-9_-]{86,88}$/, 'clave pública VAPID inválida');
const vapidPrivate = z.string().regex(/^[A-Za-z0-9_-]{42,44}$/, 'clave privada VAPID inválida');
const vapidSubject = z
  .string()
  .regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/, 'debe ser mailto: o https:');

// Compose passes unset variables as empty strings; treat them as absent.
const optionalEnvString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  // 'false', 'true' (one proxy hop) or the number of proxy hops in front of the API.
  TRUST_PROXY: z
    .string()
    .regex(/^(true|false|\d{1,2})$/, "debe ser 'true', 'false' o un número de saltos")
    .default('false'),
  JWT_SECRET: z.string().min(1).optional(),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  SMTP_URL: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).default('TuDestino <no-reply@tudestino.local>'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  // Where report evidence and public images are stored. Defaults to 'cloudinary' in production,
  // 'local' elsewhere. CLOUDINARY_URL or the three separate values are accepted.
  STORAGE_DRIVER: z.enum(['local', 'cloudinary']).optional(),
  CLOUDINARY_URL: optionalEnvString,
  CLOUDINARY_CLOUD_NAME: optionalEnvString,
  CLOUDINARY_API_KEY: optionalEnvString,
  CLOUDINARY_API_SECRET: optionalEnvString,
  UPLOADS_DIR: z.string().min(1).optional(),
  REPORT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  REPORT_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(60),
  TRACK_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  TRACK_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  VAPID_PUBLIC_KEY: vapidPublic.optional(),
  VAPID_PRIVATE_KEY: vapidPrivate.optional(),
  VAPID_SUBJECT: vapidSubject.optional(),
  // Comma-separated host suffixes. Defaults to the known push services in production, any host
  // elsewhere (local tests use a fake push server).
  PUSH_ALLOWED_HOSTS: z.string().optional(),
  PUSH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  PUSH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(60),
  REMINDERS_ENABLED: z.enum(['true', 'false']).default('true'),
  REMINDERS_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
});

const BACKEND_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const parseTrustProxy = (value) => {
  if (value === 'false') return false;
  if (value === 'true') return 1;
  return Number(value) || false;
};

// Fails fast with a readable message when the environment is invalid.
export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${details}`);
  }
  const values = parsed.data;
  const isProduction = values.NODE_ENV === 'production';
  if (!values.DATABASE_URL && values.NODE_ENV !== 'test') {
    throw new Error('Configuración inválida: DATABASE_URL es obligatoria.');
  }
  if (isProduction) {
    const secret = values.JWT_SECRET ?? '';
    if (secret.length < MIN_PRODUCTION_SECRET_LENGTH || secret.startsWith('change-me')) {
      throw new Error(
        `Configuración inválida: JWT_SECRET es obligatoria en producción (mínimo ${MIN_PRODUCTION_SECRET_LENGTH} caracteres aleatorios).`,
      );
    }
    if (!values.SMTP_URL) {
      throw new Error('Configuración inválida: SMTP_URL es obligatoria en producción.');
    }
  }
  const vapidGiven = [values.VAPID_PUBLIC_KEY, values.VAPID_PRIVATE_KEY, values.VAPID_SUBJECT];
  const vapidCount = vapidGiven.filter(Boolean).length;
  if (vapidCount !== 0 && vapidCount !== 3) {
    throw new Error(
      'Configuración inválida: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT van juntas.',
    );
  }
  if (
    isProduction &&
    (vapidCount !== 3 || values.VAPID_PRIVATE_KEY === DEV_VAPID_KEYS.privateKey)
  ) {
    throw new Error(
      'Configuración inválida: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT propias son obligatorias en producción (npm run vapid:generate).',
    );
  }
  const pushHosts = values.PUSH_ALLOWED_HOSTS
    ? values.PUSH_ALLOWED_HOSTS.split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    : isProduction
      ? [...DEFAULT_PUSH_HOSTS]
      : null;
  const storageDriver = values.STORAGE_DRIVER ?? (isProduction ? 'cloudinary' : 'local');
  const cloudinaryParts = [
    values.CLOUDINARY_CLOUD_NAME,
    values.CLOUDINARY_API_KEY,
    values.CLOUDINARY_API_SECRET,
  ];
  const cloudinaryCount = cloudinaryParts.filter(Boolean).length;
  if (cloudinaryCount !== 0 && cloudinaryCount !== 3) {
    throw new Error(
      'Configuración inválida: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET van juntas.',
    );
  }
  const cloudinaryUrl =
    values.CLOUDINARY_URL ??
    (cloudinaryCount === 3
      ? `cloudinary://${encodeURIComponent(values.CLOUDINARY_API_KEY)}:${encodeURIComponent(
          values.CLOUDINARY_API_SECRET,
        )}@${values.CLOUDINARY_CLOUD_NAME}`
      : undefined);
  if (storageDriver === 'cloudinary' && !cloudinaryUrl) {
    throw new Error(
      'Configuración inválida: CLOUDINARY_URL o las tres variables CLOUDINARY_* son obligatorias con STORAGE_DRIVER=cloudinary (por defecto en producción).',
    );
  }
  return {
    port: values.PORT,
    clientOrigin: values.CLIENT_ORIGIN,
    nodeEnv: values.NODE_ENV,
    databaseUrl: values.DATABASE_URL,
    logLevel: values.LOG_LEVEL,
    rateLimitPerMinute: values.RATE_LIMIT_PER_MINUTE,
    trustProxy: parseTrustProxy(values.TRUST_PROXY),
    auth: {
      jwtSecret: values.JWT_SECRET ?? DEV_JWT_SECRET,
      bcryptRounds: values.BCRYPT_ROUNDS,
      refreshTtlSeconds: values.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      // Secure cookies everywhere except development unless explicitly overridden.
      cookieSecure: values.COOKIE_SECURE
        ? values.COOKIE_SECURE === 'true'
        : values.NODE_ENV !== 'development',
      cookieDomain: values.COOKIE_DOMAIN,
      rateLimit: {
        limit: values.AUTH_RATE_LIMIT_MAX,
        windowMs: values.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      },
    },
    mail: { smtpUrl: values.SMTP_URL, from: values.MAIL_FROM },
    push: {
      vapid: {
        publicKey: values.VAPID_PUBLIC_KEY ?? DEV_VAPID_KEYS.publicKey,
        privateKey: values.VAPID_PRIVATE_KEY ?? DEV_VAPID_KEYS.privateKey,
        subject: values.VAPID_SUBJECT ?? DEV_VAPID_KEYS.subject,
      },
      allowedHosts: pushHosts,
      rateLimit: {
        limit: values.PUSH_RATE_LIMIT_MAX,
        windowMs: values.PUSH_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      },
      remindersEnabled: values.REMINDERS_ENABLED === 'true',
      remindersIntervalMs: values.REMINDERS_INTERVAL_MINUTES * 60_000,
    },
    reports: {
      storage: {
        driver: storageDriver,
        cloudinaryUrl,
        uploadsDir: path.resolve(BACKEND_ROOT, values.UPLOADS_DIR ?? 'uploads'),
      },
      rateLimit: {
        limit: values.REPORT_RATE_LIMIT_MAX,
        windowMs: values.REPORT_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      },
      trackRateLimit: {
        limit: values.TRACK_RATE_LIMIT_MAX,
        windowMs: values.TRACK_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      },
    },
  };
}
