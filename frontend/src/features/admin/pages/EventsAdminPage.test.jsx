import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, json } from '../../../test/apiStub.js';
import { page, renderAdmin, sent } from '../../../test/adminTestUtils.jsx';
import { eventItem } from '../../../test/adminFixtures.js';

const pending = eventItem();
const published = eventItem({ id: 'e-2', title: 'Jornada de reforestación', status: 'published' });
const rejected = eventItem({
  id: 'e-3',
  title: 'Evento repetido',
  status: 'rejected',
  moderation_note: 'Ya existe uno igual.',
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const open = (route = '/admin/eventos', extra = {}) =>
  renderAdmin(route, {
    api: { 'GET /admin/events': page([pending, published, rejected]), ...extra },
  });

describe('events admin and moderation queue', () => {
  it('lists events with their status and who proposed them', async () => {
    open();
    expect(await screen.findByText('Limpieza de playa')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente de revisión').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Propone: Ana Pérez/).length).toBeGreaterThan(0);
    expect(screen.getByText('Motivo registrado: Ya existe uno igual.')).toBeInTheDocument();
  });

  it('opens the pending queue from the summary link and sends the filter', async () => {
    const { calls } = open('/admin/eventos?estado=pending');
    await screen.findByText('Limpieza de playa');
    expect(calls.find((c) => c.path === '/admin/events').query.status).toBe('pending');
    expect(screen.getByRole('button', { name: 'Por revisar' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a friendly empty queue', async () => {
    open('/admin/eventos?estado=pending', { 'GET /admin/events': page([]) });
    expect(await screen.findByText('No hay propuestas por revisar')).toBeInTheDocument();
  });

  it('offers approve / reject only for pending events', async () => {
    open();
    await screen.findByText('Limpieza de playa');
    expect(screen.getByRole('button', { name: 'Aprobar Limpieza de playa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar Limpieza de playa' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Aprobar Jornada de reforestación' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar Jornada de reforestación' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar Evento repetido' })).not.toBeInTheDocument();
  });

  it('approves a proposal with one click', async () => {
    const { calls } = open('/admin/eventos', {
      'PATCH /admin/events/e-1/moderation': { data: eventItem({ status: 'published' }) },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar Limpieza de playa' }));
    expect(await screen.findByText(/se aprobó y ya es pública/)).toBeInTheDocument();
    expect(sent(calls, 'PATCH')[0].body).toEqual({ action: 'approve' });
  });

  it('requires a reason to reject and sends it', async () => {
    const { calls } = open('/admin/eventos', {
      'PATCH /admin/events/e-1/moderation': { data: eventItem({ status: 'rejected' }) },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar Limpieza de playa' }));
    const dialog = screen.getByRole('dialog', { name: 'Rechazar “Limpieza de playa”' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar propuesta' }));
    expect(await within(dialog).findByText(/Escribe un motivo de al menos 3 caracteres/)).toBeInTheDocument();
    expect(sent(calls, 'PATCH')).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Ya existe un evento igual esa semana.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar propuesta' }));
    expect(await screen.findByText(/se rechazó/)).toBeInTheDocument();
    expect(sent(calls, 'PATCH')[0].body).toEqual({
      action: 'reject',
      reason: 'Ya existe un evento igual esa semana.',
    });
  });

  it('cancels a published event with an optional reason', async () => {
    const { calls } = open('/admin/eventos', {
      'PATCH /admin/events/e-2/moderation': { data: eventItem({ id: 'e-2', status: 'cancelled' }) },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar Jornada de reforestación' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancelar “Jornada de reforestación”' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar evento' }));
    expect(await screen.findByText(/se canceló/)).toBeInTheDocument();
    expect(sent(calls, 'PATCH')[0].body).toEqual({ action: 'cancel' });
  });

  it('shows a conflict from the server (someone moderated it first) and refreshes', async () => {
    const { calls } = open('/admin/eventos', {
      'PATCH /admin/events/e-1/moderation': () =>
        apiError(
          409,
          'INVALID_TRANSITION',
          'No se puede aplicar "approve" a un evento en estado "rejected".',
        ),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar Limpieza de playa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede aplicar');
    await waitFor(() =>
      expect(
        calls.filter((c) => c.path === '/admin/events' && c.method === 'GET').length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  describe('create and edit', () => {
    it('refuses past dates in the form (HU-A06) without calling the API', async () => {
      const { calls } = open();
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo evento/ }));
      const dialog = screen.getByRole('dialog', { name: 'Nuevo evento' });
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Limpieza pasada');
      await userEvent.type(within(dialog).getByLabelText('Empieza'), '2020-01-01T10:00');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar evento' }));
      expect(await within(dialog).findByText('No se permiten fechas pasadas.')).toBeInTheDocument();
      expect(sent(calls, 'POST')).toHaveLength(0);
    });

    it('publishes a valid event', async () => {
      const { calls } = open('/admin/eventos', {
        'POST /admin/events': () => json({ data: eventItem({ status: 'published' }) }, 201),
      });
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo evento/ }));
      const dialog = screen.getByRole('dialog', { name: 'Nuevo evento' });
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Limpieza de playa');
      await userEvent.type(within(dialog).getByLabelText('Empieza'), '2099-05-01T10:00');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar evento' }));
      expect(await screen.findByText('Evento publicado.')).toBeInTheDocument();
      expect(sent(calls, 'POST')[0].body).toMatchObject({
        title: 'Limpieza de playa',
        starts_at: new Date('2099-05-01T10:00').toISOString(),
        ends_at: null,
        lat: null,
      });
    });

    it('edits an existing event with its current values', async () => {
      const { calls } = open('/admin/eventos', {
        'PATCH /admin/events/e-2': { data: published },
      });
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Jornada de reforestación' }));
      const dialog = screen.getByRole('dialog', { name: 'Editar Jornada de reforestación' });
      expect(within(dialog).getByLabelText('Título')).toHaveValue('Jornada de reforestación');
      await userEvent.clear(within(dialog).getByLabelText('Título'));
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Jornada de manglar');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
      expect(await screen.findByText('Evento actualizado.')).toBeInTheDocument();
      expect(sent(calls, 'PATCH')[0].body.title).toBe('Jornada de manglar');
    });
  });

  it('asks before deleting and keeps the event on cancel', async () => {
    const { calls } = open('/admin/eventos', {
      'DELETE /admin/events/e-2': () => new Response(null, { status: 204 }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Jornada de reforestación' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(sent(calls, 'DELETE')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Jornada de reforestación' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar evento' }));
    expect(await screen.findByText(/se eliminó/)).toBeInTheDocument();
    expect(sent(calls, 'DELETE')).toHaveLength(1);
  });
});
