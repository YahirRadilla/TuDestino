import { useMemo, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import { formatMonth } from '../../../shared/utils/dates.js';
import { WEEKDAYS, buildMonthGrid, dayKey, groupEventsByDay, shiftMonth } from '../calendar.js';
import EventCard from './EventCard.jsx';

const dayLabel = (date, count) => {
  const text = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(date);
  return count ? `${text}, ${count} ${count === 1 ? 'evento' : 'eventos'}` : text;
};

/**
 * Accessible month grid: a real table (column headers with full weekday names); only the days
 * with events are buttons, so keyboard users tab between meaningful stops. Selecting a day lists
 * its events below, announced politely.
 */
export default function EventsCalendar({ events, readOnly, initialDate = new Date() }) {
  const [cursor, setCursor] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() });
  const [selected, setSelected] = useState(null);
  const byDay = useMemo(() => groupEventsByDay(events), [events]);
  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const todayKey = dayKey(new Date());
  const monthTitle = formatMonth(new Date(cursor.year, cursor.month, 1));
  const dayEvents = selected ? (byDay.get(selected) ?? []) : [];

  const move = (delta) => {
    setCursor((current) => shiftMonth(current, delta));
    setSelected(null);
  };

  return (
    <section className="calendar" aria-label="Calendario de eventos">
      <div className="calendar__nav">
        <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="Mes anterior">
          <Icon name="back" />
        </button>
        <h2 className="calendar__month" aria-live="polite">
          {monthTitle}
        </h2>
        <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="Mes siguiente">
          <Icon name="chevronRight" />
        </button>
      </div>

      <table className="calendar__grid">
        <caption className="sr-only">{`Eventos de ${monthTitle}`}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day.long} scope="col" abbr={day.long}>
                <span aria-hidden="true">{day.short}</span>
                <span className="sr-only">{day.long}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].key}>
              {week.map(({ date, key, inMonth }) => {
                const count = byDay.get(key)?.length ?? 0;
                const className = [
                  'calendar__cell',
                  inMonth ? '' : 'is-outside',
                  key === todayKey ? 'is-today' : '',
                  count ? 'has-events' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <td key={key} className={className}>
                    {count && inMonth ? (
                      <button
                        type="button"
                        className="calendar__day"
                        aria-pressed={selected === key}
                        aria-label={dayLabel(date, count)}
                        onClick={() => setSelected((current) => (current === key ? null : key))}
                      >
                        {date.getDate()}
                        <span className="calendar__dot" aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="calendar__day calendar__day--idle" aria-hidden={!inMonth}>
                        {date.getDate()}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="calendar__selection" aria-live="polite">
        {selected && dayEvents.length > 0 && (
          <>
            <h3 className="section-title">{dayLabel(new Date(`${selected}T12:00:00`), 0)}</h3>
            <div className="event-list">
              {dayEvents.map((event) => (
                <EventCard key={event.id} event={event} readOnly={readOnly} headingLevel={4} />
              ))}
            </div>
          </>
        )}
        {!selected && <p className="muted">Elige un día marcado para ver sus eventos.</p>}
      </div>
    </section>
  );
}
