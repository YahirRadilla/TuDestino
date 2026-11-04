// An event with an explicit end is over when that end passes. Without one, it stays "today's
// event" until the end of its start day, so an approved proposal scheduled earlier today does not
// disappear (and can still receive attendance) minutes after it starts.
export function isEnded(event, now = new Date()) {
  if (event.ends_at) {
    const end = Date.parse(event.ends_at);
    return Number.isFinite(end) && end < now.getTime();
  }
  const start = Date.parse(event.starts_at);
  if (!Number.isFinite(start)) return false;
  const endOfDay = new Date(start);
  endOfDay.setHours(24, 0, 0, 0);
  return endOfDay.getTime() < now.getTime();
}
