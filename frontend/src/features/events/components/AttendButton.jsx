import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import { useSession } from '../../auth/authContext.js';
import { attendEvent, cancelAttendance } from '../api/eventsApi.js';

const plural = (count) => `${count} ${count === 1 ? 'persona asistirá' : 'personas asistirán'}`;

function problemFor(error) {
  if (error?.kind === 'offline' || error?.kind === 'network' || error?.kind === 'timeout') {
    return 'Sin conexión: no se pudo actualizar tu asistencia.';
  }
  if (error?.code === 'EVENT_NOT_OPEN') return 'Este evento ya terminó.';
  return 'No se pudo actualizar tu asistencia. Inténtalo de nuevo.';
}

/**
 * "Asistiré" (HU-T07). Optimistic: the button flips at once and goes back if the server says no.
 * `readOnly` is for data that did not come from the API (saved copy): attendance needs the network.
 */
export default function AttendButton({ event, ended = false, readOnly = false }) {
  const { status, isAuthenticated } = useSession();
  const location = useLocation();
  const [attending, setAttending] = useState(Boolean(event.attending));
  const [count, setCount] = useState(event.attendees_count ?? 0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const toggle = async () => {
    if (busy) return;
    const wanted = !attending;
    const previous = { attending, count };
    setBusy(true);
    setProblem('');
    setAttending(wanted);
    setCount((n) => Math.max(0, n + (wanted ? 1 : -1)));
    try {
      const result = await (wanted ? attendEvent(event.id) : cancelAttendance(event.id));
      setAttending(result.attending);
      setCount(result.attendeesCount);
    } catch (error) {
      setAttending(previous.attending);
      setCount(previous.count);
      setProblem(problemFor(error));
    } finally {
      setBusy(false);
    }
  };

  let action;
  if (ended) {
    action = (
      <button type="button" className="btn btn--ghost" disabled>
        Evento finalizado
      </button>
    );
  } else if (status === 'anonymous') {
    action = (
      <Link to="/login" state={{ from: location }} className="btn btn--ghost">
        Inicia sesión para asistir
      </Link>
    );
  } else {
    action = (
      <button
        type="button"
        className={`btn ${attending ? 'btn--primary' : 'btn--ghost'}`}
        aria-pressed={attending}
        aria-busy={busy}
        disabled={busy || readOnly || !isAuthenticated}
        onClick={toggle}
      >
        {attending && <Icon name="check" size={18} />}
        Asistiré
      </button>
    );
  }

  return (
    <div className="attend">
      {action}
      <p className="muted attend__count">{plural(count)}</p>
      {readOnly && !ended && isAuthenticated && (
        <p className="muted attend__note">Necesitas conexión para marcar tu asistencia.</p>
      )}
      {problem && (
        <p className="form-alert" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
