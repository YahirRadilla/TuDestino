import { createHmac } from 'node:crypto';

// Security audit trail. Never log passwords, tokens or full email addresses: the email is
// reduced to a keyed, truncated digest that still lets operators correlate repeated attempts.
export function createAudit(logger, secret = 'audit') {
  const pseudonym = (email) =>
    email
      ? createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 12)
      : undefined;

  return {
    pseudonym,
    // Suspicious events (failed login, refresh reuse).
    warn(name, { email, userId, ip, reason } = {}) {
      logger.warn(
        { audit: name, userId, ip, reason, emailRef: pseudonym(email) },
        'security event',
      );
    },
    // Normal security-relevant events (login, password reset).
    info(name, { email, userId, ip } = {}) {
      logger.info({ audit: name, userId, ip, emailRef: pseudonym(email) }, 'security event');
    },
  };
}
