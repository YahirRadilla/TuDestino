import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../../../shared/components/ConfirmDialog.jsx';
import { SelectField } from '../../../shared/components/FieldControls.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import Modal from '../../../shared/components/Modal.jsx';
import Pagination from '../../../shared/components/Pagination.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { useIsDesktop } from '../../../shared/hooks/useMediaQuery.js';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { formatSyncTime } from '../../../shared/utils/dates.js';
import FormField from '../../auth/components/FormField.jsx';
import {
  createDestination,
  deleteDestination,
  fetchAdminDestination,
  fetchAdminDestinations,
  fetchDestinationCategories,
  updateDestination,
} from '../api/adminApi.js';
import { adminErrorMessage } from '../adminErrors.js';
import { DESTINATION_STATUS_LABELS } from '../adminLabels.js';
import { AdminError, AdminLoading } from '../components/AdminStates.jsx';
import DestinationForm from '../components/DestinationForm.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { destinationToForm } from '../formValidation.js';

const PAGE_SIZE = 10;
const STATUS_OPTIONS = Object.entries(DESTINATION_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const TONES = { draft: 'muted', published: 'ok' };

function RowActions({ destination, busy, onEdit, onDelete }) {
  return (
    <div className="row-actions">
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => onEdit(destination)}
        disabled={busy}
        aria-label={`Editar ${destination.name}`}
      >
        {busy ? 'Abriendo…' : 'Editar'}
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--small btn--danger-text"
        onClick={() => onDelete(destination)}
        aria-label={`Eliminar ${destination.name}`}
      >
        Eliminar
      </button>
    </div>
  );
}

// HU-A05 / RF13: create, edit and (logically) delete destinations.
export default function DestinationsAdminPage() {
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const [draft, setDraft] = useState(q);
  const [dialog, setDialog] = useState(null); // { mode: 'create' } | { mode: 'edit', destination }
  const [deleting, setDeleting] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const result = useRemoteData({
    key: `admin-destinations:${estado}:${q}:${page}`,
    load: (signal) => fetchAdminDestinations({ status: estado, q, page, limit: PAGE_SIZE }, signal),
  });
  const categories = useRemoteData({ key: 'destination-categories', load: fetchDestinationCategories });

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ pagina: undefined, ...changes })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const openEdit = async (destination) => {
    setOpeningId(destination.id);
    setNotice({ kind: '', text: '' });
    try {
      setDialog({ mode: 'edit', destination: await fetchAdminDestination(destination.id) });
    } catch (error) {
      setNotice({ kind: 'error', text: adminErrorMessage(error) });
    } finally {
      setOpeningId(null);
    }
  };

  const save = async (payload) => {
    try {
      if (dialog.mode === 'edit') await updateDestination(dialog.destination.id, payload);
      else await createDestination(payload);
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    setNotice({
      kind: 'ok',
      text: dialog.mode === 'edit' ? 'Destino actualizado.' : 'Destino creado.',
    });
    setDialog(null);
    result.reload();
  };

  const confirmDelete = async () => {
    try {
      await deleteDestination(deleting.id);
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    setNotice({ kind: 'ok', text: `“${deleting.name}” se eliminó.` });
    setDeleting(null);
    result.reload();
  };

  const items = result.data?.items ?? [];
  const filtered = Boolean(estado || q);

  return (
    <div className="admin-section">
      <div className="admin-section__head">
        <h2 className="admin__heading">Destinos</h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setDialog({ mode: 'create' })}
          disabled={categories.status !== 'ready'}
        >
          <Icon name="plus" size={18} />
          Nuevo destino
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

      <form
        className="admin-toolbar"
        role="search"
        aria-label="Filtrar destinos"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: draft.trim() });
        }}
      >
        <SelectField
          id="dest-filter-status"
          label="Estado"
          placeholder="Todos"
          options={STATUS_OPTIONS}
          value={estado}
          onChange={(event) => update({ estado: event.target.value })}
        />
        <FormField
          id="dest-filter-q"
          label="Buscar por nombre"
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="admin-toolbar__actions">
          <button type="submit" className="btn btn--primary">
            <Icon name="search" size={18} />
            Buscar
          </button>
        </div>
      </form>

      {result.status === 'loading' && <AdminLoading label="Cargando destinos…" />}
      {result.status === 'error' && <AdminError error={result.error} onRetry={result.reload} />}
      {result.status === 'ready' && items.length === 0 && (
        <StateCard icon="pin" title={filtered ? 'Ningún destino coincide' : 'Aún no hay destinos'}>
          {filtered ? 'Prueba con otros filtros.' : 'Crea el primero con “Nuevo destino”.'}
        </StateCard>
      )}
      {result.status === 'ready' && items.length > 0 && (
        <>
          {isDesktop ? (
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Destinos</caption>
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Actualizado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((destination) => (
                    <tr key={destination.id}>
                      <th scope="row">{destination.name}</th>
                      <td>{destination.category.name}</td>
                      <td>
                        <StatusBadge tone={TONES[destination.status]}>
                          {DESTINATION_STATUS_LABELS[destination.status]}
                        </StatusBadge>
                      </td>
                      <td>{formatSyncTime(destination.updated_at)}</td>
                      <td>
                        <RowActions
                          destination={destination}
                          busy={openingId === destination.id}
                          onEdit={openEdit}
                          onDelete={setDeleting}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="record-list">
              {items.map((destination) => (
                <li key={destination.id} className="record-card">
                  <div className="record-card__head">
                    <h3 className="record-card__title">{destination.name}</h3>
                    <StatusBadge tone={TONES[destination.status]}>
                      {DESTINATION_STATUS_LABELS[destination.status]}
                    </StatusBadge>
                  </div>
                  <p className="muted record-card__meta">
                    {destination.category.name} · {formatSyncTime(destination.updated_at)}
                  </p>
                  <RowActions
                    destination={destination}
                    busy={openingId === destination.id}
                    onEdit={openEdit}
                    onDelete={setDeleting}
                  />
                </li>
              ))}
            </ul>
          )}
          <Pagination
            meta={result.data.meta}
            onPage={(next) => update({ pagina: next > 1 ? String(next) : '' })}
          />
        </>
      )}

      {dialog && (
        <Modal
          title={dialog.mode === 'edit' ? `Editar ${dialog.destination.name}` : 'Nuevo destino'}
          size="lg"
          onClose={() => setDialog(null)}
        >
          <DestinationForm
            categories={categories.data ?? []}
            isEdit={dialog.mode === 'edit'}
            initialValues={dialog.mode === 'edit' ? destinationToForm(dialog.destination) : undefined}
            onSubmit={save}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="¿Eliminar este destino?"
          danger
          confirmLabel="Eliminar destino"
          busyLabel="Eliminando…"
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          “{deleting.name}” dejará de verse en la app. Sus reseñas y favoritos se conservan por si necesitas
          recuperarlo.
        </ConfirmDialog>
      )}
    </div>
  );
}
