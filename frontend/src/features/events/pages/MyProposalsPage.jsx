import { useState } from 'react';
import { Link } from 'react-router-dom';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import LoadingGrid from '../../../shared/components/LoadingGrid.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus.js';
import { formatLongDay, formatTime } from '../../../shared/utils/dates.js';
import { OUTBOX_STATUS, removeProposalEntry, retryProposalEntry } from '../../../storage/proposalOutbox.js';
import { EVENT_STATUS_LABELS } from '../../admin/adminLabels.js';
import StatusBadge, { EVENT_TONES } from '../../admin/components/StatusBadge.jsx';
import { notifyOutboxChanged } from '../../reports/outboxEvents.js';
import { useMyProposals } from '../hooks/useEvents.js';
import { flushProposalOutbox } from '../proposalQueue.js';
import { useProposalOutbox } from '../useProposalOutbox.js';

const STATUS_HELP = {
  pending: 'Una autoridad la está revisando.',
  published: 'Ya es pública: aparece en la lista de eventos.',
  rejected: 'Esta propuesta no fue aprobada.',
  cancelled: 'Esta propuesta se canceló.',
};

const QUEUE_STATUS = {
  [OUTBOX_STATUS.queued]: 'Guardada · se enviará cuando haya conexión',
  [OUTBOX_STATUS.sending]: 'Enviando…',
  [OUTBOX_STATUS.failed]: 'No se pudo enviar',
};

// RF20: the proposer follows the moderation status of each proposal; a rejection shows the reason.
// Proposals saved offline are shown here too, before the server copy exists.
export default function MyProposalsPage() {
  const result = useMyProposals();
  const local = useProposalOutbox();
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(null);

  const retry = async (id) => {
    setBusy(id);
    try {
      await retryProposalEntry(id);
      notifyOutboxChanged();
      await flushProposalOutbox({ onChange: notifyOutboxChanged });
    } finally {
      setBusy(null);
    }
  };

  const discard = async (id) => {
    setBusy(id);
    try {
      await removeProposalEntry(id);
      notifyOutboxChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container page">
      <PageHeader title="Mis propuestas" />
      {local.entries.length > 0 && (
        <section aria-labelledby="local-proposals-title" className="stack">
          <h2 id="local-proposals-title" className="section-title">
            Guardadas en este dispositivo
          </h2>
          <ul className="record-list">
            {local.entries.map((entry) => (
              <li key={entry.id} className="record-card">
                <div className="record-card__head">
                  <h3 className="record-card__title">{entry.payload.title}</h3>
                  <StatusBadge tone={entry.status === OUTBOX_STATUS.failed ? 'danger' : 'warn'}>
                    {QUEUE_STATUS[entry.status] ?? entry.status}
                  </StatusBadge>
                </div>
                <p className="muted record-card__meta">
                  {formatLongDay(entry.payload.starts_at)} · {formatTime(entry.payload.starts_at)}
                  {entry.payload.location_name ? ` · ${entry.payload.location_name}` : ''}
                </p>
                {entry.lastError && (
                  <p className="form-alert" role="alert">
                    {entry.lastError}
                  </p>
                )}
                <div className="form__actions">
                  <button
                    type="button"
                    className="btn btn--surface btn--small"
                    disabled={!online || busy === entry.id}
                    onClick={() => retry(entry.id)}
                  >
                    {busy === entry.id ? 'Enviando…' : 'Reintentar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={busy === entry.id}
                    onClick={() => discard(entry.id)}
                  >
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
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
