import { useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import LoadingGrid from '../../../shared/components/LoadingGrid.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import EventCard from '../components/EventCard.jsx';
import { useMyEvents } from '../hooks/useEvents.js';

const SCOPES = [
  { id: 'upcoming', label: 'Próximos' },
  { id: 'past', label: 'Pasados' },
];

// HU-T07: the events the person marked "Asistiré". Account data, so it needs the network.
export default function MyEventsPage() {
  const [scope, setScope] = useState('upcoming');
  const result = useMyEvents(scope);

  return (
    <div className="container page">
      <PageHeader title="Mis eventos" />
      <div className="chips" role="group" aria-label="Filtrar mis eventos">
        {SCOPES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={scope === id}
            onClick={() => setScope(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {result.status === 'loading' && <LoadingGrid label="Cargando tus eventos…" count={2} />}
      {result.status === 'error' && (
        <ErrorState
          title={result.error?.kind === 'offline' ? 'Sin conexión' : 'No pudimos cargar tus eventos'}
          onRetry={result.reload}
        >
          {result.error?.kind === 'offline'
            ? 'Tus eventos se consultan en línea. Vuelve a intentarlo cuando tengas señal.'
            : result.error?.message}
        </ErrorState>
      )}
      {result.status === 'ready' && result.data.length === 0 && (
        <StateCard
          icon="calendar"
          title={scope === 'upcoming' ? 'Aún no vas a ningún evento' : 'Todavía no tienes eventos pasados'}
          action={
            <Link to="/eventos" className="btn btn--primary">
              Ver eventos
            </Link>
          }
        >
          Marca “Asistiré” en un evento y aparecerá aquí.
        </StateCard>
      )}
      {result.status === 'ready' && result.data.length > 0 && (
        <div className="event-list">
          {result.data.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
