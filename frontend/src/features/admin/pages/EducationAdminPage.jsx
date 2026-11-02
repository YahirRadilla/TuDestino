import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../../../shared/components/ConfirmDialog.jsx';
import { SelectField } from '../../../shared/components/FieldControls.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import Modal from '../../../shared/components/Modal.jsx';
import Pagination from '../../../shared/components/Pagination.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { formatSyncTime } from '../../../shared/utils/dates.js';
import FormField from '../../auth/components/FormField.jsx';
import {
  createEduContent,
  deleteEduContent,
  fetchAdminEdu,
  fetchEduCategories,
  updateEduContent,
} from '../api/adminApi.js';
import { adminErrorMessage } from '../adminErrors.js';
import { EDU_TYPE_LABELS } from '../adminLabels.js';
import { AdminError, AdminLoading } from '../components/AdminStates.jsx';
import EduForm from '../components/EduForm.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { eduToForm } from '../formValidation.js';

const PAGE_SIZE = 10;
const TYPE_OPTIONS = Object.entries(EDU_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const PUBLISHED_OPTIONS = [
  { value: 'true', label: 'Publicados' },
  { value: 'false', label: 'Sin publicar' },
];

function Actions({ content, busy, onToggle, onEdit, onDelete }) {
  return (
    <div className="row-actions">
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => onToggle(content)}
        disabled={busy}
        aria-label={`${content.is_published ? 'Despublicar' : 'Publicar'} ${content.title}`}
      >
        {content.is_published ? 'Despublicar' : 'Publicar'}
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => onEdit(content)}
        aria-label={`Editar ${content.title}`}
      >
        Editar
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--small btn--danger-text"
        onClick={() => onDelete(content)}
        aria-label={`Eliminar ${content.title}`}
      >
        Eliminar
      </button>
    </div>
  );
}

// HU-A07 / RF15: educational content, with publish / unpublish.
export default function EducationAdminPage() {
  const [params, setParams] = useSearchParams();
  const publicado = params.get('publicado') ?? '';
  const tipo = params.get('tipo') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const [draft, setDraft] = useState(q);
  const [dialog, setDialog] = useState(null); // { kind: 'form', content? } | { kind: 'delete', content }
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const result = useRemoteData({
    key: `admin-edu:${publicado}:${tipo}:${q}:${page}`,
    load: (signal) => fetchAdminEdu({ published: publicado, type: tipo, q, page, limit: PAGE_SIZE }, signal),
  });
  const categories = useRemoteData({ key: 'edu-categories', load: fetchEduCategories });

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

  const toggle = async (content) => {
    setBusyId(content.id);
    setNotice({ kind: '', text: '' });
    try {
      await updateEduContent(content.id, { is_published: !content.is_published });
      done(content.is_published ? `“${content.title}” se despublicó.` : `“${content.title}” se publicó.`);
    } catch (error) {
      setNotice({ kind: 'error', text: adminErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const save = async (payload) => {
    const editing = dialog.content;
    try {
      if (editing) await updateEduContent(editing.id, payload);
      else await createEduContent(payload);
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    done(editing ? 'Contenido actualizado.' : 'Contenido creado.');
  };

  const remove = async () => {
    try {
      await deleteEduContent(dialog.content.id);
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    done(`“${dialog.content.title}” se eliminó.`);
  };

  const items = result.data?.items ?? [];
  const filtered = Boolean(publicado || tipo || q);
  const stateBadge = (content) => (
    <StatusBadge tone={content.is_published ? 'ok' : 'muted'}>
      {content.is_published ? 'Publicado' : 'Sin publicar'}
    </StatusBadge>
  );

  return (
    <div className="admin-section">
      <div className="admin-section__head">
        <h2 className="admin__heading">Educación ambiental</h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setDialog({ kind: 'form' })}
          disabled={categories.status !== 'ready'}
        >
          <Icon name="plus" size={18} />
          Nuevo contenido
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
        aria-label="Filtrar contenido"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: draft.trim() });
        }}
      >
        <SelectField
          id="edu-filter-published"
          label="Estado"
          placeholder="Todos"
          options={PUBLISHED_OPTIONS}
          value={publicado}
          onChange={(event) => update({ publicado: event.target.value })}
        />
        <SelectField
          id="edu-filter-type"
          label="Tipo"
          placeholder="Todos"
          options={TYPE_OPTIONS}
          value={tipo}
          onChange={(event) => update({ tipo: event.target.value })}
        />
        <FormField
          id="edu-filter-q"
          label="Buscar por título"
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

      {result.status === 'loading' && <AdminLoading label="Cargando contenido…" />}
      {result.status === 'error' && <AdminError error={result.error} onRetry={result.reload} />}
      {result.status === 'ready' && items.length === 0 && (
        <StateCard icon="book" title={filtered ? 'Ningún contenido coincide' : 'Aún no hay contenido'}>
          {filtered ? 'Prueba con otros filtros.' : 'Crea el primer artículo con “Nuevo contenido”.'}
        </StateCard>
      )}
      {result.status === 'ready' && items.length > 0 && (
        <>
          <ul className="record-list">
            {items.map((content) => (
              <li key={content.id} className="record-card">
                <div className="record-card__head">
                  <h3 className="record-card__title">{content.title}</h3>
                  {stateBadge(content)}
                </div>
                <p className="muted record-card__meta">
                  {EDU_TYPE_LABELS[content.type]} · {content.category.name} ·{' '}
                  {formatSyncTime(content.updated_at)}
                </p>
                <Actions
                  content={content}
                  busy={busyId === content.id}
                  onToggle={toggle}
                  onEdit={(target) => setDialog({ kind: 'form', content: target })}
                  onDelete={(target) => setDialog({ kind: 'delete', content: target })}
                />
              </li>
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
          title={dialog.content ? `Editar ${dialog.content.title}` : 'Nuevo contenido'}
          size="lg"
          onClose={() => setDialog(null)}
        >
          <EduForm
            categories={categories.data ?? []}
            isEdit={Boolean(dialog.content)}
            initialValues={dialog.content ? eduToForm(dialog.content) : undefined}
            onSubmit={save}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="¿Eliminar este contenido?"
          danger
          confirmLabel="Eliminar contenido"
          busyLabel="Eliminando…"
          onConfirm={remove}
          onCancel={() => setDialog(null)}
        >
          “{dialog.content.title}” dejará de verse en la app. Si solo quieres ocultarlo por un tiempo, usa
          “Despublicar”.
        </ConfirmDialog>
      )}
    </div>
  );
}
