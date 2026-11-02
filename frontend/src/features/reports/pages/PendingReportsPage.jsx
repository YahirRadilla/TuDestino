import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus.js';
import { formatSyncTime } from '../../../shared/utils/dates.js';
import { OUTBOX_STATUS, removeEntry, retryEntry } from '../../../storage/outbox.js';
import ReceiptCard from '../components/ReceiptCard.jsx';
import { notifyOutboxChanged } from '../outboxEvents.js';
import { flushOutbox } from '../reportQueue.js';
import { typeLabel } from '../reportTypes.js';
import { useOutbox } from '../useOutbox.js';

const STATUS_TEXT = {
  [OUTBOX_STATUS.queued]: 'En cola · Se enviará cuando haya conexión',
  [OUTBOX_STATUS.sending]: 'Enviando…',
  [OUTBOX_STATUS.failed]: 'No se pudo enviar',
  [OUTBOX_STATUS.sent]: 'Enviado',
};

function PendingItem({ entry, online, busy, onRetry, onDiscard, onAcknowledge }) {
  const title = typeLabel(entry.payload?.type);
  return (
    <li className={`pending-item pending-item--${entry.status}`}>
      <div className="pending-item__head">
        <strong>{title}</strong>
        <span className="pending-item__status">{STATUS_TEXT[entry.status]}</span>
      </div>
      <p className="muted pending-item__meta">
        Creado: {formatSyncTime(new Date(entry.createdAt).toISOString())}
        {entry.photos.length > 0 &&
          ` · ${entry.photos.length} ${entry.photos.length === 1 ? 'foto' : 'fotos'}`}
      </p>

      {entry.status === OUTBOX_STATUS.failed && (
        <p className="form-alert" role="alert">
          {entry.lastError || 'El servidor no aceptó este reporte.'}
        </p>
      )}
      {entry.status === OUTBOX_STATUS.queued && entry.lastError && (
        <p className="muted pending-item__meta">Último intento: {entry.lastError}</p>
      )}

      {entry.status === OUTBOX_STATUS.sent && entry.receipt && (
        <ReceiptCard receipt={entry.receipt} onAcknowledge={() => onAcknowledge(entry.id)} />
      )}

      {entry.status !== OUTBOX_STATUS.sent && (
        <div className="pending-item__actions">
          {entry.status === OUTBOX_STATUS.failed && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onRetry(entry.id)}
              disabled={busy || !online}
            >
              Reintentar
            </button>
          )}
          {entry.status !== OUTBOX_STATUS.sending && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onDiscard(entry.id)}
              disabled={busy}
            >
              Descartar
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export default function PendingReportsPage() {
  const { loading, entries } = useOutbox();
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const retryAll = async () => {
    setBusy(true);
    try {
      await flushOutbox({ onChange: notifyOutboxChanged });
    } finally {
      setBusy(false);
      notifyOutboxChanged();
    }
  };
  const retryOne = async (id) => {
    await retryEntry(id);
    notifyOutboxChanged();
    await retryAll();
  };
  const discard = async (id) => {
    await removeEntry(id);
    setConfirming(null);
    notifyOutboxChanged();
  };
  const acknowledge = async (id) => {
    await removeEntry(id);
    notifyOutboxChanged();
  };

  const waiting = entries.filter((entry) => entry.status === OUTBOX_STATUS.queued).length;

  return (
    <div className="container page report">
      <PageHeader title="Pendientes de envío" />

      {loading ? (
        <div className="skeleton skeleton--card" aria-hidden="true" />
      ) : entries.length === 0 ? (
        <StateCard icon="check" title="No tienes reportes pendientes">
          Los reportes que hagas sin conexión aparecerán aquí hasta que se envíen.
          <br />
          <Link to="/reportar" className="btn btn--primary">
            Hacer un reporte
          </Link>
        </StateCard>
      ) : (
        <>
          <section className="pending-summary" aria-live="polite">
            {!online && (
              <p className="data-notice" role="status">
                <Icon name="wifiOff" size={16} /> Sin conexión · Se enviarán cuando haya conexión.
              </p>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={retryAll}
              disabled={busy || !online || waiting === 0}
            >
              <Icon name="refresh" size={18} />
              {busy ? 'Enviando…' : 'Reintentar ahora'}
            </button>
          </section>
          <ul className="pending-list" aria-label="Reportes en este dispositivo">
            {entries.map((entry) =>
              confirming === entry.id ? (
                <li key={entry.id} className="pending-item">
                  <p>¿Descartar este reporte? No se enviará y no se puede recuperar.</p>
                  <div className="pending-item__actions">
                    <button type="button" className="btn btn--primary" onClick={() => discard(entry.id)}>
                      Sí, descartar
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setConfirming(null)}>
                      Cancelar
                    </button>
                  </div>
                </li>
              ) : (
                <PendingItem
                  key={entry.id}
                  entry={entry}
                  online={online}
                  busy={busy}
                  onRetry={retryOne}
                  onDiscard={setConfirming}
                  onAcknowledge={acknowledge}
                />
              ),
            )}
          </ul>
        </>
      )}
    </div>
  );
}
