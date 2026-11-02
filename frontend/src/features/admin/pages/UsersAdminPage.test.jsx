import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, json } from '../../../test/apiStub.js';
import { page, person, renderAdmin, sent } from '../../../test/adminTestUtils.jsx';
import { adminUser } from '../../../test/adminFixtures.js';

const areas = [
  { id: 1, name: 'PROFEPA' },
  { id: 2, name: 'CONANP' },
];
const me = person('admin');
const self = adminUser({ id: me.id, full_name: 'Admin Pérez', email: me.email, role: 'admin', area: null });
const luis = adminUser();
const inactive = adminUser({
  id: 'u-10',
  full_name: 'Marta Ruiz',
  email: 'marta@example.com',
  is_active: false,
  last_login_at: null,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const open = (extra = {}) =>
  renderAdmin('/admin/usuarios', {
    role: 'admin',
    api: {
      'GET /admin/users': page([self, luis, inactive]),
      'GET /admin/areas': { data: areas },
      ...extra,
    },
  });

describe('users admin', () => {
  it('lists accounts with role, area, state and last access', async () => {
    open();
    expect(await screen.findByText('Luis Soto')).toBeInTheDocument();
    expect(screen.getByText(/luis@example\.com · Autoridad · PROFEPA/)).toBeInTheDocument();
    expect(screen.getByText('Desactivada')).toBeInTheDocument();
    expect(screen.getByText(/Aún no ha entrado/)).toBeInTheDocument();
    expect(screen.getByText('(tú)')).toBeInTheDocument();
  });

  it('filters and searches through the API', async () => {
    const { calls } = open();
    await screen.findByText('Luis Soto');
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'authority');
    await userEvent.selectOptions(screen.getByLabelText('Cuenta'), 'inactive');
    await userEvent.type(screen.getByLabelText('Buscar por nombre o correo'), 'marta');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const last = calls.filter((c) => c.path === '/admin/users').at(-1);
    expect(last.query).toMatchObject({ role: 'authority', status: 'inactive', q: 'marta' });
  });

  describe('create', () => {
    const openForm = async (extra) => {
      const view = open(extra);
      await screen.findByText('Luis Soto');
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo usuario/ }));
      return { ...view, dialog: screen.getByRole('dialog', { name: 'Nuevo usuario' }) };
    };

    it('validates name and email', async () => {
      const { dialog, calls } = await openForm();
      await userEvent.type(within(dialog).getByLabelText('Correo'), 'sin-arroba');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear e invitar' }));
      expect(await within(dialog).findByText('Ingresa un correo válido.')).toBeInTheDocument();
      expect(within(dialog).getByText(/El nombre debe tener entre 2 y 100/)).toBeInTheDocument();
      expect(sent(calls, 'POST')).toHaveLength(0);
    });

    it('creates staff with an invitation and never asks for a password', async () => {
      const { dialog, calls } = await openForm({
        'POST /admin/users': () =>
          json(
            {
              data: adminUser({ id: 'u-11', full_name: 'Nora Díaz', email: 'nora@example.com' }),
              meta: { invitation_sent: true },
            },
            201,
          ),
      });
      expect(within(dialog).queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
      await userEvent.type(within(dialog).getByLabelText('Nombre completo'), 'Nora Díaz');
      await userEvent.type(within(dialog).getByLabelText('Correo'), 'Nora@Example.com');
      await userEvent.selectOptions(within(dialog).getByLabelText('Área (opcional)'), '2');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear e invitar' }));
      expect(await screen.findByText(/Enviamos una invitación a nora@example\.com/)).toBeInTheDocument();
      expect(sent(calls, 'POST')[0].body).toEqual({
        full_name: 'Nora Díaz',
        email: 'nora@example.com',
        role: 'authority',
        area_id: 2,
      });
    });

    it('warns when the invitation email could not be sent', async () => {
      const { dialog } = await openForm({
        'POST /admin/users': () =>
          json({ data: adminUser({ email: 'nora@example.com' }), meta: { invitation_sent: false } }, 201),
      });
      await userEvent.type(within(dialog).getByLabelText('Nombre completo'), 'Nora Díaz');
      await userEvent.type(within(dialog).getByLabelText('Correo'), 'nora@example.com');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear e invitar' }));
      expect(await screen.findByText(/no pudimos enviar el correo/)).toBeInTheDocument();
    });

    it('shows a duplicate email from the server', async () => {
      const { dialog } = await openForm({
        'POST /admin/users': () => apiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.'),
      });
      await userEvent.type(within(dialog).getByLabelText('Nombre completo'), 'Nora Díaz');
      await userEvent.type(within(dialog).getByLabelText('Correo'), 'nora@example.com');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear e invitar' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Ya existe una cuenta con ese correo.',
      );
    });
  });

  describe('role and area', () => {
    it('changes role and area', async () => {
      const { calls } = open({ 'PATCH /admin/users/u-9': { data: { ...luis, role: 'admin' } } });
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Luis Soto' }));
      const dialog = screen.getByRole('dialog', { name: 'Editar a Luis Soto' });
      await userEvent.selectOptions(within(dialog).getByLabelText('Rol'), 'admin');
      await userEvent.selectOptions(within(dialog).getByLabelText('Área'), '2');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
      expect(await screen.findByText('Cambios guardados para Luis Soto.')).toBeInTheDocument();
      expect(sent(calls, 'PATCH')[0].body).toEqual({ role: 'admin', area_id: 2 });
    });

    it('does not let the admin change their own role', async () => {
      open();
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Admin Pérez' }));
      const dialog = screen.getByRole('dialog', { name: 'Editar a Admin Pérez' });
      expect(within(dialog).getByLabelText('Rol')).toBeDisabled();
      expect(within(dialog).getByText(/siempre queda un administrador/)).toBeInTheDocument();
    });

    it('shows the server rule when it still refuses', async () => {
      open({
        'PATCH /admin/users/u-9': () =>
          apiError(409, 'LAST_ADMIN', 'Debe quedar al menos un administrador activo.'),
      });
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Luis Soto' }));
      const dialog = screen.getByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Debe quedar al menos un administrador activo.',
      );
    });
  });

  describe('activate / deactivate', () => {
    it('cannot deactivate your own account', async () => {
      open();
      expect(await screen.findByRole('button', { name: 'Desactivar a Admin Pérez' })).toBeDisabled();
    });

    it('asks for confirmation, explains the consequence and does nothing on cancel', async () => {
      const { calls } = open({ 'PATCH /admin/users/u-9': { data: { ...luis, is_active: false } } });
      await userEvent.click(await screen.findByRole('button', { name: 'Desactivar a Luis Soto' }));
      const dialog = screen.getByRole('alertdialog', { name: '¿Desactivar a Luis Soto?' });
      expect(within(dialog).getByText(/Se cerrarán todas sus sesiones/)).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      expect(sent(calls, 'PATCH')).toHaveLength(0);
    });

    it('deactivates after confirming', async () => {
      const { calls } = open({ 'PATCH /admin/users/u-9': { data: { ...luis, is_active: false } } });
      await userEvent.click(await screen.findByRole('button', { name: 'Desactivar a Luis Soto' }));
      await userEvent.click(screen.getByRole('button', { name: 'Desactivar cuenta' }));
      expect(await screen.findByText('Luis Soto fue desactivada.')).toBeInTheDocument();
      expect(sent(calls, 'PATCH')[0].body).toEqual({ is_active: false });
    });

    it('reactivates a disabled account', async () => {
      const { calls } = open({ 'PATCH /admin/users/u-10': { data: { ...inactive, is_active: true } } });
      await userEvent.click(await screen.findByRole('button', { name: 'Reactivar a Marta Ruiz' }));
      await userEvent.click(screen.getByRole('button', { name: 'Reactivar cuenta' }));
      expect(await screen.findByText('Marta Ruiz fue reactivada.')).toBeInTheDocument();
      expect(sent(calls, 'PATCH')[0].body).toEqual({ is_active: true });
    });
  });

  it('resends an invitation only to active accounts', async () => {
    open({ 'POST /admin/users/u-9/invitation': { data: luis, meta: { invitation_sent: true } } });
    await userEvent.click(await screen.findByRole('button', { name: 'Reenviar invitación a Luis Soto' }));
    expect(await screen.findByText(/Reenviamos la invitación a luis@example\.com/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reenviar invitación a Marta Ruiz' }),
    ).not.toBeInTheDocument();
  });
});
