import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../../../shared/components/ConfirmDialog.jsx';
import { SelectField } from '../../../shared/components/FieldControls.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import Modal from '../../../shared/components/Modal.jsx';
import Pagination from '../../../shared/components/Pagination.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { useForm } from '../../../shared/hooks/useForm.js';
import { formatSyncTime } from '../../../shared/utils/dates.js';
import FormField from '../../auth/components/FormField.jsx';
import { useAuth } from '../../auth/authContext.js';
import { createUser, fetchAreas, fetchUsers, resendInvitation, updateUser } from '../api/adminApi.js';
import { adminErrorMessage } from '../adminErrors.js';
import { ROLE_LABELS } from '../adminLabels.js';
import { AdminError, AdminLoading } from '../components/AdminStates.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { emptyUser, newUserPayload, validateNewUser } from '../formValidation.js';

const PAGE_SIZE = 10;
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const STAFF_OPTIONS = ROLE_OPTIONS.filter((option) => option.value !== 'user');
const STATUS_OPTIONS = [
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Desactivadas' },
];

const areaOptions = (areas) => areas.map((area) => ({ value: String(area.id), label: area.name }));

function NewUserForm({ areas, onSubmit, onCancel }) {
  const form = useForm({
    initialValues: emptyUser(),
    idPrefix: 'new-user',
    validate: validateNewUser,
    onSubmit: (values) => onSubmit(newUserPayload(values)),
  });
  const { field } = form;
  return (
    <form
      ref={form.formRef}
      className="form"
      onSubmit={form.handleSubmit}
      noValidate
      aria-busy={form.submitting}
    >
      <p className="muted">
        La persona recibirá un correo para crear su propia contraseña; tú nunca la verás.
      </p>
      <FormField {...field('full_name')} label="Nombre completo" autoComplete="off" />
      <FormField
        {...field('email')}
        label="Correo"
        type="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      <div className="form__row">
        <SelectField {...field('role')} label="Rol" options={STAFF_OPTIONS} />
        <SelectField
          {...field('area_id')}
          label="Área (opcional)"
          placeholder="Sin área"
          options={areaOptions(areas)}
        />
      </div>
      {form.formError && (
        <p role="alert" className="form-alert">
          {form.formError}
        </p>
      )}
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={form.submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={form.submitting}>
          {form.submitting ? 'Creando…' : 'Crear e invitar'}
        </button>
      </div>
    </form>
  );
}

function EditUserForm({ user, areas, isSelf, onSubmit, onCancel }) {
  const form = useForm({
    initialValues: { role: user.role, area_id: user.area ? String(user.area.id) : '' },
    idPrefix: 'edit-user',
    validate: () => ({}),
    onSubmit: (values) =>
      onSubmit({ role: values.role, area_id: values.area_id ? Number(values.area_id) : null }),
  });
  const { field } = form;
  return (
    <form
      ref={form.formRef}
      className="form"
      onSubmit={form.handleSubmit}
      noValidate
      aria-busy={form.submitting}
    >
      <p className="muted">
        {user.full_name} · {user.email}
      </p>
      <SelectField
        {...field('role')}
        label="Rol"
        options={ROLE_OPTIONS}
        disabled={isSelf}
        hint={
          isSelf
            ? 'No puedes cambiar tu propio rol: así siempre queda un administrador.'
            : 'Al cambiar el rol se cierran sus sesiones.'
        }
      />
      <SelectField {...field('area_id')} label="Área" placeholder="Sin área" options={areaOptions(areas)} />
      {form.formError && (
        <p role="alert" className="form-alert">
          {form.formError}
        </p>
      )}
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={form.submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={form.submitting}>
          {form.submitting ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

// HU-A08 / RF16: admin only. Accounts are created by invitation, deactivation closes sessions.
export default function UsersAdminPage() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const rol = params.get('rol') ?? '';
  const estado = params.get('estado') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const [draft, setDraft] = useState(q);
  const [dialog, setDialog] = useState(null); // { kind: 'new' | 'edit' | 'toggle', user? }
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const result = useRemoteData({
    key: `admin-users:${rol}:${estado}:${q}:${page}`,
    load: (signal) => fetchUsers({ role: rol, status: estado, q, page, limit: PAGE_SIZE }, signal),
  });
  const areas = useRemoteData({ key: 'admin-areas', load: fetchAreas });

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

  const create = async (payload) => {
    let outcome;
    try {
      outcome = await createUser(payload);
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    done(
      outcome.invitationSent
        ? `Cuenta creada. Enviamos una invitación a ${outcome.user.email}.`
        : `Cuenta creada, pero no pudimos enviar el correo a ${outcome.user.email}. Usa “Reenviar invitación”.`,
    );
  };

  const edit = async (changes) => {
    try {
      await updateUser(dialog.user.id, changes);
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    done(`Cambios guardados para ${dialog.user.full_name}.`);
  };

  const toggleActive = async () => {
    const target = dialog.user;
    try {
      await updateUser(target.id, { is_active: !target.is_active });
    } catch (error) {
      throw new Error(adminErrorMessage(error));
    }
    done(target.is_active ? `${target.full_name} fue desactivada.` : `${target.full_name} fue reactivada.`);
  };

  const invite = async (target) => {
    setBusyId(target.id);
    setNotice({ kind: '', text: '' });
    try {
      const outcome = await resendInvitation(target.id);
      setNotice(
        outcome.invitationSent
          ? { kind: 'ok', text: `Reenviamos la invitación a ${target.email}.` }
          : { kind: 'error', text: `No pudimos enviar el correo a ${target.email}. Inténtalo de nuevo.` },
      );
    } catch (error) {
      setNotice({ kind: 'error', text: adminErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const items = result.data?.items ?? [];
  const filtered = Boolean(rol || estado || q);
  const ready = areas.status === 'ready';

  return (
    <div className="admin-section">
      <div className="admin-section__head">
        <h2 className="admin__heading">Usuarios</h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setDialog({ kind: 'new' })}
          disabled={!ready}
        >
          <Icon name="plus" size={18} />
          Nuevo usuario
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
        aria-label="Filtrar usuarios"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: draft.trim() });
        }}
      >
        <SelectField
          id="user-filter-role"
          label="Rol"
          placeholder="Todos"
          options={ROLE_OPTIONS}
          value={rol}
          onChange={(event) => update({ rol: event.target.value })}
        />
        <SelectField
          id="user-filter-status"
          label="Cuenta"
          placeholder="Todas"
          options={STATUS_OPTIONS}
          value={estado}
          onChange={(event) => update({ estado: event.target.value })}
        />
        <FormField
          id="user-filter-q"
          label="Buscar por nombre o correo"
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

      {result.status === 'loading' && <AdminLoading label="Cargando usuarios…" />}
      {result.status === 'error' && <AdminError error={result.error} onRetry={result.reload} />}
      {result.status === 'ready' && items.length === 0 && (
        <StateCard icon="users" title="Ningún usuario coincide">
          Prueba con otros filtros.
        </StateCard>
      )}
      {result.status === 'ready' && items.length > 0 && (
        <>
          <ul className="record-list">
            {items.map((person) => {
              const isSelf = person.id === me?.id;
              return (
                <li key={person.id} className="record-card">
                  <div className="record-card__head">
                    <h3 className="record-card__title">
                      {person.full_name}
                      {isSelf && <span className="muted"> (tú)</span>}
                    </h3>
                    <StatusBadge tone={person.is_active ? 'ok' : 'muted'}>
                      {person.is_active ? 'Activa' : 'Desactivada'}
                    </StatusBadge>
                  </div>
                  <p className="muted record-card__meta">
                    {person.email} · {ROLE_LABELS[person.role]}
                    {person.area ? ` · ${person.area.name}` : ''}
                    {' · '}
                    {person.last_login_at
                      ? `Último acceso ${formatSyncTime(person.last_login_at)}`
                      : 'Aún no ha entrado'}
                  </p>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => setDialog({ kind: 'edit', user: person })}
                      disabled={!ready}
                      aria-label={`Editar ${person.full_name}`}
                    >
                      Editar rol y área
                    </button>
                    {person.is_active && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => invite(person)}
                        disabled={busyId === person.id}
                        aria-label={`Reenviar invitación a ${person.full_name}`}
                      >
                        Reenviar invitación
                      </button>
                    )}
                    <button
                      type="button"
                      className={
                        person.is_active
                          ? 'btn btn--ghost btn--small btn--danger-text'
                          : 'btn btn--ghost btn--small'
                      }
                      onClick={() => setDialog({ kind: 'toggle', user: person })}
                      disabled={isSelf && person.is_active}
                      aria-label={`${person.is_active ? 'Desactivar' : 'Reactivar'} a ${person.full_name}`}
                    >
                      {person.is_active ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {filtered && <p className="muted">Los filtros están activos.</p>}
          <Pagination
            meta={result.data.meta}
            onPage={(next) => update({ pagina: next > 1 ? String(next) : '' })}
          />
        </>
      )}

      {dialog?.kind === 'new' && (
        <Modal title="Nuevo usuario" onClose={() => setDialog(null)}>
          <NewUserForm areas={areas.data ?? []} onSubmit={create} onCancel={() => setDialog(null)} />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title={`Editar a ${dialog.user.full_name}`} onClose={() => setDialog(null)}>
          <EditUserForm
            user={dialog.user}
            areas={areas.data ?? []}
            isSelf={dialog.user.id === me?.id}
            onSubmit={edit}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
      {dialog?.kind === 'toggle' && (
        <ConfirmDialog
          title={
            dialog.user.is_active
              ? `¿Desactivar a ${dialog.user.full_name}?`
              : `¿Reactivar a ${dialog.user.full_name}?`
          }
          danger={dialog.user.is_active}
          confirmLabel={dialog.user.is_active ? 'Desactivar cuenta' : 'Reactivar cuenta'}
          busyLabel="Guardando…"
          onConfirm={toggleActive}
          onCancel={() => setDialog(null)}
        >
          {dialog.user.is_active
            ? 'Se cerrarán todas sus sesiones y no podrá volver a entrar hasta que la reactives. Sus datos se conservan.'
            : 'Podrá iniciar sesión de nuevo con su contraseña.'}
        </ConfirmDialog>
      )}
    </div>
  );
}
