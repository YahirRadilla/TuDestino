import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../../api/client.js';
import { apiError, json, stubApi } from '../../../test/apiStub.js';
import TrackingPage, { trackingErrorMessage } from './TrackingPage.jsx';

const tracked = {
  data: {
    folio: 'TD-2026-000007',
    status: 'in_review',
    created_at: '2026-10-17T15:00:00.000Z',
    updated_at: '2026-10-18T09:30:00.000Z',
    history: [
      {
        from_status: null,
        to_status: 'pending',
        note: 'Reporte recibido',
        created_at: '2026-10-17T15:00:00.000Z',
      },
      {
        from_status: 'pending',
        to_status: 'in_review',
        note: 'Una brigada visitará la playa.',
        created_at: '2026-10-18T09:30:00.000Z',
      },
    ],
  },
};

const renderPage = (route = '/seguimiento') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <TrackingPage />
    </MemoryRouter>,
  );

const fill = async (user, folio = 'td-2026-000007', code = 'abcde-23456') => {
  await user.clear(screen.getByLabelText('Folio'));
  await user.type(screen.getByLabelText('Folio'), folio);
  await user.type(screen.getByLabelText('Código de seguimiento'), code);
  await user.click(screen.getByRole('button', { name: 'Consultar reporte' }));
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TrackingPage', () => {
  it('validates the folio and the code before asking the server', async () => {
    const user = userEvent.setup({ delay: null });
    const api = stubApi({ 'POST /reports/track': tracked });
    renderPage();
    await user.type(screen.getByLabelText('Folio'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Consultar reporte' }));
    expect(screen.getByLabelText('Folio')).toBeInvalid();
    expect(screen.getByLabelText('Código de seguimiento')).toBeInvalid();
    expect(screen.getByText(/formato TD-2026-000123/)).toBeInTheDocument();
    expect(api.count('POST /reports/track')).toBe(0);
  });

  it('sends the normalised folio and code and shows status and an accessible timeline', async () => {
    const user = userEvent.setup({ delay: null });
    const api = stubApi({ 'POST /reports/track': tracked });
    renderPage();
    await fill(user);

    expect(await screen.findByRole('heading', { name: 'En revisión' })).toBeInTheDocument();
    expect(api.calls[0].body).toEqual({ folio: 'TD-2026-000007', code: 'ABCDE23456' });

    const timeline = screen.getByRole('list', { name: 'Historial del reporte' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Pendiente');
    expect(items[0]).toHaveTextContent('Reporte recibido');
    expect(items[1]).toHaveTextContent('En revisión');
    expect(items[1]).toHaveTextContent('Una brigada visitará la playa.');
    expect(items[1]).toHaveTextContent('(estado actual)');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(within(items[0]).getByText(/2026/).closest('time')).toHaveAttribute(
      'datetime',
      '2026-10-17T15:00:00.000Z',
    );
  });

  it('prefills the folio from the link but never the code', async () => {
    renderPage('/seguimiento?folio=TD-2026-000007');
    expect(screen.getByLabelText('Folio')).toHaveValue('TD-2026-000007');
    expect(screen.getByLabelText('Código de seguimiento')).toHaveValue('');
  });

  it('shows one generic message for an unknown folio and a wrong code alike', async () => {
    const user = userEvent.setup({ delay: null });
    stubApi({
      'POST /reports/track': apiError(
        404,
        'REPORT_NOT_FOUND',
        'No encontramos un reporte con ese folio y código.',
      ),
    });
    renderPage();
    await fill(user);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No encontramos un reporte con ese folio y código. Revisa los datos.');
    expect(alert).not.toHaveTextContent(/código (es )?incorrecto|folio no existe/i);
  });

  it('tells the user when there is no connection or too many attempts', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    stubApi({});
    renderPage();
    await fill(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sin conexión/);
  });

  it('maps every failure to a Spanish message', () => {
    expect(trackingErrorMessage(new ApiError('http', 'x', { status: 429 }))).toMatch(/Demasiados intentos/);
    expect(trackingErrorMessage(new ApiError('timeout', 'x'))).toMatch(/Sin conexión/);
    expect(trackingErrorMessage(new ApiError('http', 'x', { status: 500 }))).toMatch(/No pudimos consultar/);
  });

  it('links to the pending reports of this device', () => {
    stubApi({ 'POST /reports/track': json(tracked) });
    renderPage();
    expect(screen.getByRole('link', { name: 'Ver pendientes de envío' })).toHaveAttribute(
      'href',
      '/reportar/pendientes',
    );
  });
});
