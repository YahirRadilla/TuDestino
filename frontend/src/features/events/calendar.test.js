import { describe, expect, it } from 'vitest';
import { WEEKDAYS, buildMonthGrid, dayKey, groupEventsByDay, shiftMonth } from './calendar.js';
import { isEnded } from './eventTime.js';

// Local-time constructor so the tests do not depend on the machine's time zone.
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h).toISOString();

describe('buildMonthGrid', () => {
  it('starts weeks on Monday and pads with the neighbouring months (October 2026 starts on a Thursday)', () => {
    const weeks = buildMonthGrid(2026, 9);
    expect(WEEKDAYS[0].long).toBe('lunes');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0].key).toBe('2026-09-28');
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][3]).toMatchObject({ key: '2026-10-01', inMonth: true });
    expect(weeks.at(-1).at(-1).key).toBe('2026-11-01');
    expect(weeks.flat().filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it('adds a sixth week when the month needs it and handles February', () => {
    expect(buildMonthGrid(2026, 7)).toHaveLength(6); // August 2026 starts on a Saturday
    expect(
      buildMonthGrid(2026, 1)
        .flat()
        .filter((c) => c.inMonth),
    ).toHaveLength(28);
    expect(
      buildMonthGrid(2028, 1)
        .flat()
        .filter((c) => c.inMonth),
    ).toHaveLength(29);
  });
});

describe('shiftMonth', () => {
  it('crosses year boundaries in both directions', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe('groupEventsByDay', () => {
  it('groups by local day and keeps several events on one day', () => {
    const a = { id: 'a', starts_at: at(2026, 10, 17, 9), ends_at: at(2026, 10, 17, 12) };
    const b = { id: 'b', starts_at: at(2026, 10, 17, 16), ends_at: null };
    const byDay = groupEventsByDay([a, b]);
    expect(byDay.get('2026-10-17').map((e) => e.id)).toEqual(['a', 'b']);
    expect(byDay.size).toBe(1);
  });

  it('shows a multi-day event on every day it spans', () => {
    const trip = { id: 't', starts_at: at(2026, 10, 30), ends_at: at(2026, 11, 2) };
    expect([...groupEventsByDay([trip]).keys()]).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('ignores invalid dates and bounds a runaway end date', () => {
    expect(groupEventsByDay([{ id: 'x', starts_at: 'nope' }]).size).toBe(0);
    const forever = { id: 'f', starts_at: at(2026, 1, 1), ends_at: at(2030, 1, 1) };
    expect(groupEventsByDay([forever]).size).toBe(31);
  });
});

describe('dayKey / isEnded', () => {
  it('zero-pads', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('uses the end when there is one, or the end of the start day otherwise', () => {
    const now = new Date(2026, 9, 17, 12);
    expect(isEnded({ starts_at: at(2026, 10, 17, 9), ends_at: at(2026, 10, 17, 11) }, now)).toBe(true);
    expect(isEnded({ starts_at: at(2026, 10, 17, 9), ends_at: at(2026, 10, 17, 13) }, now)).toBe(false);
    expect(isEnded({ starts_at: at(2026, 10, 17, 9), ends_at: null }, now)).toBe(false);
    expect(isEnded({ starts_at: at(2026, 10, 16, 9), ends_at: null }, now)).toBe(true);
    expect(isEnded({ starts_at: at(2026, 10, 18, 9), ends_at: null }, now)).toBe(false);
  });
});
