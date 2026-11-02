// Status machine of a citizen report (HU-A04). Pure: no I/O, easy to test.
//
//   pending   -> in_review | dismissed
//   in_review -> resolved | dismissed | pending
//   resolved  -> (terminal) ; an admin may reopen it to in_review
//   dismissed -> (terminal) ; an admin may reopen it to in_review
const FLOW = Object.freeze({
  pending: ['in_review', 'dismissed'],
  in_review: ['resolved', 'dismissed', 'pending'],
  resolved: [],
  dismissed: [],
});

const REOPEN = Object.freeze({
  resolved: ['in_review'],
  dismissed: ['in_review'],
});

// Valid next statuses for `from` as seen by `role` (authority or admin).
export function allowedTransitions(from, role) {
  const base = FLOW[from] ?? [];
  const reopen = role === 'admin' ? (REOPEN[from] ?? []) : [];
  return [...base, ...reopen];
}

export const canTransition = (from, to, role) => allowedTransitions(from, role).includes(to);
