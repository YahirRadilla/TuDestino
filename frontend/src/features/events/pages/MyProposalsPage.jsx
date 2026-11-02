import { Link } from 'react-router-dom';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import LoadingGrid from '../../../shared/components/LoadingGrid.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { formatLongDay, formatTime } from '../../../shared/utils/dates.js';
import { EVENT_STATUS_LABELS } from '../../admin/adminLabels.js';
import StatusBadge, { EVENT_TONES } from '../../admin/components/StatusBadge.jsx';
import { useMyProposals } from '../hooks/useEvents.js';

const STATUS_HELP = {
  pending: 'Una autoridad la está revisando.',
  published: 'Ya es pública: aparece en la lista de eventos.',
  rejected: 'Esta propuesta no fue aprobada.',
  cancelled: 'Esta propuesta se canceló.',
};

// RF20: the proposer follows the moderation status of each proposal; a rejection shows the reason.
export default function MyProposalsPage() {
  const result = useMyProposals();

  return (
    <div className="container page">
      <PageHeader title="Mis propuestas" />
      {result.status === 'loading' && <LoadingGrid label="Cargando tus propuestas…" count={2} />}
      {result.status === 'error' && (
        <ErrorState
          title={result.error?.kind === 'offline' ? 'Sin conexión' : 'No pudimos cargar tus propuestas'}
          onRetry={result.reload}
        >
          {result.error?.kind === 'offline'
            ? 'Tus propuestas se consultan en línea. Vuelve a intentarlo cuando tengas señal.'
            : result.error?.message}
        </ErrorState>
      )}
      {result.status === 'ready' && result.data.length === 0 && (
        <StateCard
          icon="calendar"
          title="Aún no has propuesto eventos"
          action={
            <Link to="/eventos/proponer" className="btn btn--primary">
              Proponer un evento
            </Link>
          }
        >
          ¿Quieres organizar una limpieza o una jornada? Envíanos tu propuesta.
        </StateCard>
      )}
      {result.status === 'ready' && result.data.length > 0 && (
        <ul className="record-list">
          {result.data.map((proposal) => (
            <li key={proposal.id} className="record-card">
              <div className="record-card__head">
                <h2 className="record-card__title">{proposal.title}</h2>
                <StatusBadge tone={EVENT_TONES[proposal.status]}>
                  {EVENT_STATUS_LABELS[proposal.status] ?? proposal.status}
                </StatusBadge>
              </div>
              <p className="muted record-card__meta">
                {formatLongDay(proposal.starts_at)} · {formatTime(proposal.starts_at)}
                {proposal.location_name ? ` · ${proposal.location_name}` : ''}
              </p>
              {['rejected', 'cancelled'].includes(proposal.status) && proposal.moderation_note ? (
                <p>
                  <strong>Motivo:</strong> {proposal.moderation_note}
                </p>
              ) : (
                <p className="muted">{STATUS_HELP[proposal.status]}</p>
              )}
              {proposal.status === 'published' && <Link to={`/eventos/${proposal.id}`}>Ver el evento</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
