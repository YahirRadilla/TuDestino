import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { apiError, json, stubApi } from '../../../test/apiStub.js';
import { claimEntry, getEntry, listEntries, markFailed, markSent } from '../../../storage/outbox.js';
import { UUID_A, UUID_B, photoFile, queueReport, sentReceipt } from '../../../test/reportFixtures.js';
import PendingReportsPage from './PendingReportsPage.jsx';

const renderPage = () =>
  render(
    <MemoryRouter>
      <PendingReportsPage />
    </MemoryRouter>,
  );

const created = (folio) => json({ data: { folio, tracking_code: 'ZXCVB23456', replayed: false } }, 201);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PendingReportsPage', () => {
  it('shows an empty state with a way to make a report', async () => {
    renderPage();
    expect(await screen.findByText('No tienes reportes pendientes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hacer un reporte' })).toHaveAttribute('href', '/reportar');
  });

  it('lists queued reports with the "se enviará cuando haya conexión" message', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await queueReport({ photos: [photoFile(), photoFile('b.jpg')] });
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reportes en este dispositivo' });
    const [item] = within(list).getAllByRole('listitem');
    expect(item).toHaveTextContent('Contaminación');
    expect(item).toHaveTextContent('En cola · Se enviará cuando haya conexión');
    expect(item).toHaveTextContent('2 fotos');
    expect(screen.getByRole('status')).toHaveTextContent(/Sin conexión/);
    expect(screen.getByRole('button', { name: 'Reintentar ahora' })).toBeDisabled();
  });

  it('"Reintentar ahora" delivers the queue and shows the receipt with the code', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const api = stubApi({ 'POST /reports': () => created('TD-2026-000011') });
    const id = await queueReport();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Reintentar ahora' }));

    expect(await screen.findByTestId('receipt-folio')).toHaveTextContent('TD-2026-000011');
    expect(screen.getByTestId('receipt-code')).toHaveTextContent('ZXCVB23456');
    expect(screen.getByText(/no se vuelve a mostrar/)).toBeInTheDocument();
    expect(api.count('POST /reports')).toBe(1);
    expect((await getEntry(id)).status).toBe('sent');
  });

  it('keeps the code until the user confirms they saved it, then forgets it', async () => {
    const user = userEvent.setup({ delay: null });
    const id = await queueReport();
    await claimEntry(id);
    await markSent(id, sentReceipt({ folio: 'TD-2026-000021' }));
    renderPage();
    expect(await screen.findByTestId('receipt-code')).toHaveTextContent('ABCDE23456');
    await user.click(screen.getByRole('button', { name: 'Ya lo guardé' }));
    await waitFor(async () => expect(await listEntries()).toEqual([]));
    expect(await screen.findByText('No tienes reportes pendientes')).toBeInTheDocument();
  });

  it('shows why a report failed and lets the user retry it', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const api = stubApi({ 'POST /reports': () => created('TD-2026-000031') });
    const id = await queueReport();
    await claimEntry(id);
    await markFailed(id, 'Solo se aceptan fotos válidas.');
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo se aceptan fotos válidas.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('receipt-folio')).toHaveTextContent('TD-2026-000031');
    expect(api.count('POST /reports')).toBe(1);
  });

  it('a retried report that is refused again goes back to "failed" and is not retried forever', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const api = stubApi({
      'POST /reports': apiError(400, 'VALIDATION_ERROR', 'description: demasiado corta'),
    });
    const id = await queueReport();
    await claimEntry(id);
    await markFailed(id, 'antes');
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('description: demasiado corta')).toBeInTheDocument();
    expect(api.count('POST /reports')).toBe(1);
    expect((await getEntry(id)).status).toBe('failed');
  });

  it('asks before discarding and removes the report only after confirming', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await queueReport({ clientUuid: UUID_A });
    await queueReport({ clientUuid: UUID_B });
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Descartar' });
    await user.click(buttons[0]);
    expect(screen.getByText(/¿Descartar este reporte\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await listEntries()).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Descartar' })[0]);
    await user.click(screen.getByRole('button', { name: 'Sí, descartar' }));
    await waitFor(async () => expect(await listEntries()).toHaveLength(1));
  });

  it('refreshes by itself when another context changes the outbox', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderPage();
    expect(await screen.findByText('No tienes reportes pendientes')).toBeInTheDocument();
    await queueReport();
    const channel = new BroadcastChannel('td-outbox');
    channel.postMessage('changed');
    channel.close();
    expect(await screen.findByText('En cola · Se enviará cuando haya conexión')).toBeInTheDocument();
  });
});
