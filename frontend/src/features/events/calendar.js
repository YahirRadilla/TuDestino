// Pure calendar helpers (local time zone, weeks start on Monday as in Mexico).

export const WEEKDAYS = [
  { short: 'L', long: 'lunes' },
  { short: 'M', long: 'martes' },
  { short: 'X', long: 'miércoles' },
  { short: 'J', long: 'jueves' },
  { short: 'V', long: 'viernes' },
  { short: 'S', long: 'sábado' },
  { short: 'D', long: 'domingo' },
];

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' in the local time zone: the key of a calendar day.
export const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Weeks (arrays of 7 cells) covering a month; month is 0-11. */
export function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: total }, (_, index) => {
    const date = new Date(year, month, index - offset + 1);
    return { date, key: dayKey(date), inMonth: date.getMonth() === month };
  });
  return Array.from({ length: total / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export function shiftMonth({ year, month }, delta) {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

const MAX_SPAN_DAYS = 31;

/** Map of dayKey -> events happening that day (multi-day events appear on each of their days). */
export function groupEventsByDay(events) {
  const byDay = new Map();
  for (const event of events) {
    const start = new Date(event.starts_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = event.ends_at ? new Date(event.ends_at) : start;
    const last = Number.isNaN(end.getTime()) || end < start ? start : end;
    const cursor = startOfDay(start);
    for (let i = 0; i < MAX_SPAN_DAYS && cursor <= last; i += 1) {
      const key = dayKey(cursor);
      byDay.set(key, [...(byDay.get(key) ?? []), event]);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return byDay;
}
