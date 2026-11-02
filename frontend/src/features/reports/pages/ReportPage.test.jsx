import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { json, stubApi } from '../../../test/apiStub.js';
import { listEntries } from '../../../storage/outbox.js';
import { queueReport } from '../../../test/reportFixtures.js';
import ReportPage from './ReportPage.jsx';

const created = (code = 'ABCDE23456') =>
  json({ data: { folio: 'TD-2026-000007', tracking_code: code, replayed: false } }, 201);

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReportPage />
    </MemoryRouter>,
  );

const completeForm = async (user) => {
  await user.click(await screen.findByRole('radio', { name: /Contaminación/ }));
  await user.click(screen.getByRole('button', { name: 'Siguiente' }));
  await user.click(screen.getByText('Ajustar coordenadas a mano'));
  await user.type(screen.getByLabelText('Latitud'), '24.1426');
  await user.type(screen.getByLabelText('Longitud'), '-110.3128');
  await user.click(screen.getByRole('button', { name: 'Siguiente' }));
  await user.type(screen.getByLabelText('Descripción'), 'Basura acumulada en la orilla.');
  await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
};

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ReportPage', () => {
  it('after sending, shows the folio and the one-time code with the warning', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    stubApi({
      'GET /report-types': json({ data: [] }),
      'GET /destinations': json({ data: [] }),
      'POST /reports': () => created(),
    });
    renderPage();
    await completeForm(user);

    expect(await screen.findByRole('heading', { name: 'Reporte enviado' })).toBeInTheDocument();
    expect(screen.getByTestId('receipt-folio')).toHaveTextContent('TD-2026-000007');
    expect(screen.getByTestId('receipt-code')).toHaveTextContent('ABCDE23456');
    expect(screen.getByRole('note')).toHaveTextContent(/no se vuelve a mostrar/);
    expect(screen.getByRole('link', { name: 'Dar seguimiento' })).toHaveAttribute(
      'href',
      '/seguimiento?folio=TD-2026-000007',
    );
    // Nothing secret is written to disk: the outbox entry is gone and the draft too.
    expect(await listEntries()).toEqual([]);
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('ABCDE23456');
  });

  it('copies the code to the clipboard and confirms it', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    stubApi({
      'GET /report-types': json({ data: [] }),
      'GET /destinations': json({ data: [] }),
      'POST /reports': () => created(),
    });
    renderPage();
    await completeForm(user);
    await screen.findByTestId('receipt-code');
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(writeText).toHaveBeenCalledWith('ABCDE23456');
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });

  it('says the copy failed when the clipboard is not available', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    stubApi({
      'GET /report-types': json({ data: [] }),
      'GET /destinations': json({ data: [] }),
      'POST /reports': () => created(),
    });
    renderPage();
    await completeForm(user);
    await screen.findByTestId('receipt-code');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(await screen.findByText(/No pudimos copiar/)).toBeInTheDocument();
  });

  it('a replayed delivery explains that the code is only shown once', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    stubApi({
      'GET /report-types': json({ data: [] }),
      'GET /destinations': json({ data: [] }),
      'POST /reports': () => json({ data: { folio: 'TD-2026-000007', tracking_code: null, replayed: true } }),
    });
    renderPage();
    await completeForm(user);
    expect(await screen.findByTestId('receipt-folio')).toBeInTheDocument();
    expect(screen.queryByTestId('receipt-code')).not.toBeInTheDocument();
    expect(screen.getByText(/solo se muestra una vez/)).toBeInTheDocument();
  });

  it('offline, shows that the report is saved and will be sent when there is a connection', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    stubApi({});
    renderPage();
    await completeForm(user);
    expect(await screen.findByRole('heading', { name: 'Guardado en tu dispositivo' })).toBeInTheDocument();
    expect(screen.getByText(/Se enviará cuando haya conexión/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver pendientes de envío' })).toHaveAttribute(
      'href',
      '/reportar/pendientes',
    );
  });

  it('"Hacer otro reporte" starts over with a new report id', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const api = stubApi({
      'GET /report-types': json({ data: [] }),
      'GET /destinations': json({ data: [] }),
      'POST /reports': () => created(),
    });
    renderPage();
    await completeForm(user);
    await user.click(await screen.findByRole('button', { name: 'Hacer otro reporte' }));
    expect(await screen.findByText(/Paso 1 de 3/)).toBeInTheDocument();
    await completeForm(user);
    await waitFor(() => expect(api.count('POST /reports')).toBe(2));
    const ids = api.calls.filter((c) => c.method === 'POST').map((c) => c.body.get('client_uuid'));
    expect(new Set(ids).size).toBe(2);
  });

  it('shows a badge with the number of pending reports', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await queueReport();
    stubApi({});
    renderPage();
    expect(await screen.findByRole('link', { name: 'Pendientes de envío (1)' })).toHaveAttribute(
      'href',
      '/reportar/pendientes',
    );
  });
});
