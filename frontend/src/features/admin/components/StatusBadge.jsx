// Colored pill for a status. The text is always present (color is never the only signal).
export default function StatusBadge({ tone, children }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}

export const REPORT_TONES = {
  pending: 'warn',
  in_review: 'info',
  resolved: 'ok',
  dismissed: 'muted',
};

export const EVENT_TONES = {
  pending: 'warn',
  published: 'ok',
  cancelled: 'muted',
  rejected: 'danger',
};
