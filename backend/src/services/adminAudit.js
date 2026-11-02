// Audit trail of administrative actions (status changes, create/delete, role changes).
// Only identifiers, enums and booleans are logged: never notes, descriptions, emails, names,
// tokens or IP addresses. `details` values that are not primitives are dropped.
const SAFE_TYPES = new Set(['string', 'number', 'boolean']);
const SAFE_VALUE = /^[\w:.\- ]{0,80}$/;

function sanitize(details = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(details)) {
    if (value == null) continue;
    if (!SAFE_TYPES.has(typeof value)) continue;
    if (typeof value === 'string' && !SAFE_VALUE.test(value)) continue;
    clean[key] = value;
  }
  return clean;
}

export function createAdminAudit(logger) {
  return {
    record(action, actor, details) {
      logger?.info(
        {
          audit: `admin.${action}`,
          actorId: actor?.id,
          actorRole: actor?.role,
          ...sanitize(details),
        },
        'admin action',
      );
    },
  };
}
