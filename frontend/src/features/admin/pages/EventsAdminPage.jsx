import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../../../shared/components/ConfirmDialog.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import Modal from '../../../shared/components/Modal.jsx';
import Pagination from '../../../shared/components/Pagination.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { formatLongDay, formatTime } from '../../../shared/utils/dates.js';
import EventForm from '../../events/components/EventForm.jsx';
import { eventToForm } from '../../events/eventForm.js';
import { createEvent, deleteEvent, fetchAdminEvents, moderateEvent, updateEvent } from '../api/adminApi.js';
import { adminErrorMessage } from '../adminErrors.js';
import { EVENT_STATUS_LABELS } from '../adminLabels.js';
import { AdminError, AdminLoading } from '../components/AdminStates.jsx';
import ReasonDialog from '../components/ReasonDialog.jsx';
import StatusBadge, { EVENT_TONES } from '../components/StatusBadge.jsx';

const PAGE_SIZE = 10;
const FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'pending', label: 'Por revisar' },
  { id: 'published', label: 'Publicados' },
  { id: 'cancelled', label: 'Cancelados' },
  { id: 'rejected', label: 'Rechazados' },
];

function EventRow({ event, busy, onApprove, onReject, onCancel, onEdit, onDelete }) {
  return (
    <li className="record-card">
      <div className="record-card__head">
        <h3 className="record-card__title">{event.title}</h3>
        <StatusBadge tone={EVENT_TONES[event.status]}>{EVENT_STATUS_LABELS[event.status]}</StatusBadge>
      </div>
      <p className="muted record-card__meta">
        <Icon name="calendar" size={14} /> {formatLongDay(event.starts_at)} · {formatTime(event.starts_at)}
        {event.location_name ? ` · ${event.location_name}` : ''}
        {event.organizer ? ` · Propone: ${event.organizer.full_name}` : ''}
      </p>
      {event.moderation_note && (
        <p className="muted record-card__meta">Motivo registrado: {event.moderation_note}</p>
      )}
      <div className="row-actions">
        {event.status === 'pending' && (
          <>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => onApprove(event)}
              disabled={busy}
              aria-label={`Aprobar ${event.title}`}
            >
              Aprobar
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onReject(event)}
              disabled={busy}
              aria-label={`Rechazar ${event.title}`}
            >
              Rechazar
            </button>
          </>
        )}
        {(event.status === 'pending' || event.status === 'published') && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onCancel(event)}
            disabled={busy}
            aria-label={`Cancelar ${event.title}`}
          >
            Cancelar evento
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => onEdit(event)}
          aria-label={`Editar ${event.title}`}
        >
          Editar
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small btn--danger-text"
          onClick={() => onDelete(event)}
          aria-label={`Eliminar ${event.title}`}
        >
          Eliminar
        </button>
      </div>
    </li>
  );
}

// HU-A06 / RF14 / RF20: manage events and moderate the proposals of users (approve / reject /
// cancel). Only `published` events are public.
export default function EventsAdminPage() {
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const [dialog, setDialog] = useState(null); // { kind: 'form', event? } | { kind: 'reject'|'cancel', event } | { kind: 'delete', event }
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const result = useRemoteData({
    key: `admin-events:${estado}:${page}`,
    load: (signal) => fetchAdminEvents({ status: estado, page, limit: PAGE_SIZE }, signal),
  });

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ pagina: undefined, ...changes })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const done = (text) => {
    setNotice({ kind: 'ok', text });
    setDialog(null);
    result.reload();
  };

  const approve = async (event) => {
    setBusyId(event.id);
    setNotice({ kind: '', text: '' });
    try {
      await moderateEvent(event.id, { action: 'approve' });
      done(`“${event.title}” se aprobó y ya es pública.`);
    } catch (error) {
      setNotice({ kind: 'error', text: adminErrorMessage(error) });
      result.reload();
    } finally {
      setBusyId(null);
    }
  };

  const moderate = (action, doneText) => async (reason) => {
    try {
      await moderateEvent(dialog.event.id, { action, reason });
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    done(doneText(dialog.event));
  };

  const save = async (payload) => {
    const editing = dialog.event;
    try {
      if (editing) await updateEvent(editing.id, payload);
      else await createEvent(payload);
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    done(editing ? 'Evento actualizado.' : 'Evento publicado.');
  };

  const remove = async () => {
    try {
      await deleteEvent(dialog.event.id);
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    done(`“${dialog.event.title}” se eliminó.`);
  };

  const items = result.data?.items ?? [];

  return (
    <div className="admin-section">
      <div className="admin-section__head">
        <h2 className="admin__heading">Eventos</h2>
        <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'form' })}>
          <Icon name="plus" size={18} />
          Nuevo evento
        </button>
      </div>

      {notice.text && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={notice.kind === 'error' ? 'form-alert' : 'form-success'}
        >
          {notice.text}
        </p>
      )}

      <div className="chips" role="group" aria-label="Filtrar eventos por estado">
        {FILTERS.map((filter) => (
          <button
            key={filter.id || 'all'}
            type="button"
            className="chip"
            aria-pressed={estado === filter.id}
            onClick={() => update({ estado: filter.id })}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {result.status === 'loading' && <AdminLoading label="Cargando eventos…" />}
      {result.status === 'error' && <AdminError error={result.error} onRetry={result.reload} />}
      {result.status === 'ready' && items.length === 0 && (
        <StateCard
          icon="calendar"
          title={estado === 'pending' ? 'No hay propuestas por revisar' : 'No hay eventos aquí'}
        >
          {estado === 'pending'
            ? 'Cuando alguien proponga un evento, lo verás en esta cola.'
            : 'Crea un evento con “Nuevo evento” o cambia el filtro.'}
        </StateCard>
      )}
      {result.status === 'ready' && items.length > 0 && (
        <>
          <ul className="record-list">
            {items.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                busy={busyId === event.id}
                onApprove={approve}
                onReject={(target) => setDialog({ kind: 'reject', event: target })}
                onCancel={(target) => setDialog({ kind: 'cancel', event: target })}
                onEdit={(target) => setDialog({ kind: 'form', event: target })}
                onDelete={(target) => setDialog({ kind: 'delete', event: target })}
              />
            ))}
          </ul>
          <Pagination
            meta={result.data.meta}
            onPage={(next) => update({ pagina: next > 1 ? String(next) : '' })}
          />
        </>
      )}

      {dialog?.kind === 'form' && (
        <Modal
          title={dialog.event ? `Editar ${dialog.event.title}` : 'Nuevo evento'}
          size="lg"
          onClose={() => setDialog(null)}
        >
          <EventForm
            idPrefix="admin-event"
            isNew={!dialog.event}
            initialValues={dialog.event ? eventToForm(dialog.event) : undefined}
            submitLabel={dialog.event ? 'Guardar cambios' : 'Publicar evento'}
            onSubmit={save}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
      {dialog?.kind === 'reject' && (
        <ReasonDialog
          title={`Rechazar “${dialog.event.title}”`}
          intro="La persona que lo propuso verá este motivo."
          confirmLabel="Rechazar propuesta"
          danger
          onSubmit={moderate('reject', (event) => `“${event.title}” se rechazó.`)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <ReasonDialog
          title={`Cancelar “${dialog.event.title}”`}
          intro="El evento dejará de mostrarse en la app."
          required={false}
          confirmLabel="Cancelar evento"
          danger
          onSubmit={moderate('cancel', (event) => `“${event.title}” se canceló.`)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="¿Eliminar este evento?"
          danger
          confirmLabel="Eliminar evento"
          busyLabel="Eliminando…"
          onConfirm={remove}
          onCancel={() => setDialog(null)}
        >
          “{dialog.event.title}” se eliminará de la lista y de la app.
        </ConfirmDialog>
      )}
    </div>
  );
}
