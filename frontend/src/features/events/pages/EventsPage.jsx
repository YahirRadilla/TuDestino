import { Link, useSearchParams } from 'react-router-dom';
import DataNotice from '../../../shared/components/DataNotice.jsx';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import LoadingGrid from '../../../shared/components/LoadingGrid.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import EventCard from '../components/EventCard.jsx';
import EventsCalendar from '../components/EventsCalendar.jsx';
import { useEvents } from '../hooks/useEvents.js';

const VIEWS = [
  { id: 'lista', label: 'Lista' },
  { id: 'calendario', label: 'Calendario' },
];

function ViewSwitch({ view, onChange }) {
  return (
    <div className="chips" role="group" aria-label="Vista de eventos">
      {VIEWS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="chip"
          aria-pressed={view === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function EventsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('vista') === 'calendario' ? 'calendario' : 'lista';
  const result = useEvents();
  const setView = (next) => setParams(next === 'lista' ? {} : { vista: next }, { replace: true });
  // Attendance can only be changed against the API; a saved copy is read-only.
  const readOnly = result.source !== 'api';

  return (
    <div className="container page">
      <PageHeader
        title="Eventos"
        action={
          <Link to="/eventos/proponer" className="btn btn--ghost btn--small">
            Proponer un evento
          </Link>
        }
      />
      <ViewSwitch view={view} onChange={setView} />

      {result.status === 'loading' && <LoadingGrid label="Cargando eventos…" count={3} />}
      {result.status === 'error' && (
        <ErrorState
          title={result.error?.kind === 'offline' ? 'Eventos sin conexión' : 'No pudimos cargar los eventos'}
          onRetry={result.reload}
        >
          {result.error?.kind === 'offline'
            ? 'Todavía no hay eventos guardados en este dispositivo. Conéctate una vez para verlos aquí.'
            : result.error?.message}
        </ErrorState>
      )}
      {result.status === 'ready' && (
        <>
          <DataNotice source={result.source} reason={result.reason} syncedAt={result.syncedAt} />
          {view === 'calendario' ? (
            <EventsCalendar events={result.data} readOnly={readOnly} />
          ) : result.data.length === 0 ? (
            <StateCard icon="calendar" title="No hay eventos próximos">
              Cuando se publiquen limpiezas de playa o jornadas, las verás aquí.
            </StateCard>
          ) : (
            <div className="event-list">
              {result.data.map((event) => (
                <EventCard key={event.id} event={event} readOnly={readOnly} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
