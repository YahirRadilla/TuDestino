// An event is over once its end (or its start, when there is no end) has passed.
export function isEnded(event, now = new Date()) {
  const end = Date.parse(event.ends_at ?? event.starts_at);
  return Number.isFinite(end) && end < now.getTime();
}
