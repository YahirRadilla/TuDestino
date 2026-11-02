import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../auth/authContext.js';
import { apiError, json, stubApi, testUser } from '../../../test/apiStub.js';
import { listEntries } from '../../../storage/outbox.js';
import { photoFile } from '../../../test/reportFixtures.js';
import ReportForm from './ReportForm.jsx';

const DESTINATIONS = {
  data: [
    {
      slug: 'playa-balandra',
      name: 'Playa Balandra',
      summary: 'Aguas turquesa.',
      municipality: 'La Paz',
      is_protected_area: true,
      avg_rating: 4.8,
      reviews_count: 10,
      category: { slug: 'playa', name: 'Playa' },
      location: { lat: 24.3213, lng: -110.3254 },
      images: [],
    },
  ],
};

const API_TYPES = [
  { slug: 'tortuga-anidando', name: 'Tortuga anidando' },
  { slug: 'animal-varado', name: 'Animal varado' },
  { slug: 'contaminacion', name: 'Contaminación' },
  { slug: 'actividad-sospechosa', name: 'Actividad sospechosa' },
  { slug: 'otro', name: 'Otro' },
];

const created = {
  data: { folio: 'TD-2026-000007', tracking_code: 'ABCDE23456', replayed: false, status: 'pending' },
};

const authed = {
  status: 'authenticated',
  user: testUser,
  isAuthenticated: true,
};

function renderForm({ auth = null, onDone = vi.fn() } = {}) {
  const tree = (
    <MemoryRouter>
      <ReportForm onDone={onDone} />
    </MemoryRouter>
  );
  render(auth ? <AuthContext.Provider value={auth}>{tree}</AuthContext.Provider> : tree);
  return { onDone };
}

const stubGeolocation = (impl) =>
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: impl ? { getCurrentPosition: impl } : undefined,
  });

const setOnline = (online) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);

const chooseType = async (user, name = 'Contaminación') => {
  await user.click(screen.getByRole('radio', { name: new RegExp(name) }));
  await user.click(screen.getByRole('button', { name: 'Siguiente' }));
};

const fillLocation = async (user) => {
  await user.click(screen.getByText('Ajustar coordenadas a mano'));
  await user.type(screen.getByLabelText('Latitud'), '24.1426');
  await user.type(screen.getByLabelText('Longitud'), '-110.3128');
};

beforeEach(() => {
  sessionStorage.clear();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  stubGeolocation(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ReportForm steps', () => {
  it('walks through the three steps and validates each one', async () => {
    const user = userEvent.setup({ delay: null });
    stubApi({ 'GET /report-types': json({ data: API_TYPES }), 'GET /destinations': DESTINATIONS });
    renderForm();

    expect(screen.getByText(/Paso 1 de 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige qué quieres reportar.');

    await chooseType(user, 'Tortuga anidando');
    expect(screen.getByText(/Paso 2 de 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByLabelText('Latitud')).toBeInvalid();
    expect(screen.getByLabelText('Longitud')).toBeInvalid();

    await fillLocation(user);
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText(/Paso 3 de 3/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Descripción'), 'corta');
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/mínimo 10 caracteres/);

    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByText(/Paso 2 de 3/)).toBeInTheDocument();
  });

  it('shows the report types offered by the API, with local icons and help', async () => {
    stubApi({
      'GET /report-types': json({ data: [{ slug: 'contaminacion', name: 'Contaminación' }] }),
      'GET /destinations': DESTINATIONS,
    });
    renderForm();
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(1));
    expect(screen.getByText(/Basura, derrames/)).toBeInTheDocument();
  });

  it('falls back to the bundled types without a connection, including "Otro"', async () => {
    setOnline(false);
    stubApi({});
    renderForm();
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(5));
    expect(screen.getByRole('radio', { name: /Otro/ })).toBeInTheDocument();
  });

  it('keeps the draft in SessionStorage and restores it', async () => {
    const user = userEvent.setup({ delay: null });
    stubApi({ 'GET /report-types': json({ data: API_TYPES }), 'GET /destinations': DESTINATIONS });
    const first = renderForm();
    await chooseType(user, 'Animal varado');
    const stored = JSON.parse(sessionStorage.getItem('td:report-draft'));
    expect(stored).toMatchObject({ type: 'animal-varado', step: 2 });
    expect(stored.clientUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.onDone).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    renderForm();
    expect(screen.getByText(/Paso 2 de 3/)).toBeInTheDocument();
  });
});

describe('photos', () => {
  it('previews, removes and limits attachments to four', async () => {
    const user = userEvent.setup({ delay: null });
    stubApi({ 'GET /report-types': json({ data: API_TYPES }), 'GET /destinations': DESTINATIONS });
    renderForm();
    await chooseType(user);

    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    await user.upload(input, [photoFile('a.jpg'), photoFile('b.jpg')]);
    expect(await screen.findAllByRole('img', { name: /Foto \d del reporte/ })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Quitar foto 1' }));
    expect(screen.getAllByRole('img', { name: /Foto \d del reporte/ })).toHaveLength(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');

    await user.upload(input, [
      photoFile('c.jpg'),
      photoFile('d.jpg'),
      photoFile('e.jpg'),
      photoFile('f.jpg'),
    ]);
    await waitFor(() => expect(screen.getAllByRole('img', { name: /Foto \d del reporte/ })).toHaveLength(4));
    expect(screen.getByRole('alert')).toHaveTextContent('Solo puedes adjuntar 4 fotos.');
    expect(input).toBeDisabled();
  });

  it('refuses a file that is not a JPEG, PNG or WebP', async () => {
    const user = userEvent.setup({ applyAccept: false, delay: null });
    stubApi({ 'GET /report-types': json({ data: API_TYPES }), 'GET /destinations': DESTINATIONS });
    renderForm();
    await chooseType(user);
    await user.upload(document.querySelector('input[type="file"]'), photoFile('x.gif', 'image/gif'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Usa fotos JPEG, PNG o WebP.');
    expect(screen.queryAllByRole('img', { name: /Foto/ })).toHaveLength(0);
  });
});

describe('location (Geolocation API)', () => {
  const toStep2 = async (user) => {
    stubApi({ 'GET /report-types': json({ data: API_TYPES }), 'GET /destinations': DESTINATIONS });
    renderForm();
    await chooseType(user);
  };

  it('fills latitude, longitude and accuracy when the position is granted', async () => {
    const user = userEvent.setup({ delay: null });
    stubGeolocation((success) =>
      success({ coords: { latitude: 24.142634, longitude: -110.312847, accuracy: 12.4 } }),
    );
    await toStep2(user);
    await user.click(screen.getByRole('button', { name: 'Usar mi ubicación' }));
    expect(await screen.findByText(/Ubicación lista · precisión de unos 12 m/)).toBeInTheDocument();
    expect(screen.getByLabelText('Latitud')).toHaveValue('24.14263');
    expect(screen.getByLabelText('Longitud')).toHaveValue('-110.31285');
    expect(JSON.parse(sessionStorage.getItem('td:report-draft')).accuracy_m).toBe(12);
  });

  it('explains a denied permission and offers the manual alternatives', async () => {
    const user = userEvent.setup({ delay: null });
    stubGeolocation((_ok, fail) => fail({ code: 1 }));
    await toStep2(user);
    await user.click(screen.getByRole('button', { name: 'Usar mi ubicación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No diste permiso/);
    // The manual fields open by themselves so the user is never stuck.
    expect(screen.getByLabelText('Latitud')).toBeVisible();
    expect(screen.getByLabelText(/elige un destino cercano/i)).toBeInTheDocument();
  });

  it.each([
    [2, /No pudimos determinar tu ubicación/],
    [3, /Tardó demasiado/],
  ])('handles geolocation error code %i', async (code, message) => {
    const user = userEvent.setup({ delay: null });
    stubGeolocation((_ok, fail) => fail({ code }));
    await toStep2(user);
    await user.click(screen.getByRole('button', { name: 'Usar mi ubicación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('says so when the browser has no Geolocation API', async () => {
    const user = userEvent.setup({ delay: null });
    await toStep2(user);
    await user.click(screen.getByRole('button', { name: 'Usar mi ubicación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no ofrece ubicación/);
  });

  it('lets the user pick a nearby destination instead', async () => {
    const user = userEvent.setup({ delay: null });
    await toStep2(user);
    const select = screen.getByLabelText(/elige un destino cercano/i);
    await screen.findByRole('option', { name: 'Playa Balandra' });
    await user.selectOptions(select, 'playa-balandra');
    await user.click(screen.getByText('Ajustar coordenadas a mano'));
    expect(screen.getByLabelText('Latitud')).toHaveValue('24.3213');
    expect(screen.getByLabelText('Longitud')).toHaveValue('-110.3254');
    expect(JSON.parse(sessionStorage.getItem('td:report-draft')).destination_slug).toBe('playa-balandra');
  });

  it('accepts a decimal comma and rejects out-of-range coordinates', async () => {
    const user = userEvent.setup({ delay: null });
    await toStep2(user);
    await user.click(screen.getByText('Ajustar coordenadas a mano'));
    await user.type(screen.getByLabelText('Latitud'), '95');
    await user.type(screen.getByLabelText('Longitud'), '-110,3128');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByLabelText('Latitud')).toBeInvalid();
    expect(screen.getByLabelText('Longitud')).toBeValid();
    await user.clear(screen.getByLabelText('Latitud'));
    await user.type(screen.getByLabelText('Latitud'), '24,14');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText(/Paso 3 de 3/)).toBeInTheDocument();
  });
});

describe('anonymity switch', () => {
  const toStep3 = async (user) => {
    await chooseType(user);
    await fillLocation(user);
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
  };

  it('is ON by default for a visitor and explains what it means', async () => {
    const user = userEvent.setup({ delay: null });
    stubApi({ 'GET /report-types': json({ data: API_TYPES }), 'GET /destinations': DESTINATIONS });
    renderForm();
    await toStep3(user);
    const toggle = screen.getByRole('switch', { name: /Reportar de forma anónima/ });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/No guardamos tu nombre, tu correo ni tu IP/);
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toBeInTheDocument();
  });

  it('is OFF by default for a signed-in user, and the user can turn it on', async () => {
    const user = userEvent.setup({ delay: null });
    stubApi({ 'GET /report-types': json({ data: API_TYPES }), 'GET /destinations': DESTINATIONS });
    renderForm({ auth: authed });
    await toStep3(user);
    const toggle = screen.getByRole('switch', { name: /Reportar de forma anónima/ });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/vinculado a tu cuenta/);
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });
});

describe('submitting', () => {
  const fillEverything = async (
    user,
    { description = 'Basura acumulada en la orilla de la playa.' } = {},
  ) => {
    await chooseType(user);
    await user.upload(document.querySelector('input[type="file"]'), photoFile('a.jpg'));
    await screen.findByRole('img', { name: 'Foto 1 del reporte' });
    await fillLocation(user);
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await user.type(screen.getByLabelText('Descripción'), description);
  };

  it('online: sends once, removes it from the outbox and hands over the one-time code', async () => {
    const user = userEvent.setup({ delay: null });
    setOnline(true);
    const api = stubApi({
      'GET /report-types': json({ data: API_TYPES }),
      'GET /destinations': DESTINATIONS,
      'POST /reports': () => json(created, 201),
    });
    const { onDone } = renderForm();
    await fillEverything(user);
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0]).toMatchObject({
      phase: 'sent',
      receipt: { folio: 'TD-2026-000007', trackingCode: 'ABCDE23456' },
    });
    expect(api.count('POST /reports')).toBe(1);
    expect(await listEntries()).toEqual([]);
    expect(sessionStorage.getItem('td:report-draft')).toBeNull();

    const body = api.calls.find((call) => call.method === 'POST').body;
    expect(body.get('type')).toBe('contaminacion');
    expect(body.get('anonymous')).toBe('true');
    expect(body.get('lat')).toBe('24.1426');
    expect(body.get('lng')).toBe('-110.3128');
    expect(body.get('client_uuid')).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.getAll('photos')).toHaveLength(1);
  });

  it('offline: keeps the report in the outbox and says it will be sent later', async () => {
    const user = userEvent.setup({ delay: null });
    setOnline(false);
    const api = stubApi({
      'GET /report-types': json({ data: API_TYPES }),
      'GET /destinations': DESTINATIONS,
    });
    const { onDone } = renderForm();
    await fillEverything(user);
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0]).toMatchObject({ phase: 'queued', syncRegistered: false });
    expect(api.count('POST /reports')).toBe(0);
    const [entry] = await listEntries();
    expect(entry).toMatchObject({
      status: 'queued',
      payload: { type: 'contaminacion', lat: 24.1426, lng: -110.3128, anonymous: true },
    });
    expect(entry.photos).toHaveLength(1);
    expect(sessionStorage.getItem('td:report-draft')).toBeNull();
  });

  it('a flaky server (503) leaves the report queued instead of losing it', async () => {
    const user = userEvent.setup({ delay: null });
    setOnline(true);
    stubApi({
      'GET /report-types': json({ data: API_TYPES }),
      'GET /destinations': DESTINATIONS,
      'POST /reports': apiError(503, 'INTERNAL_ERROR', 'Error interno.'),
    });
    const { onDone } = renderForm();
    await fillEverything(user);
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0].phase).toBe('queued');
    expect((await listEntries())[0].status).toBe('queued');
  });

  it('a refused report stays in the form with the reason and in "Pendientes" as failed', async () => {
    const user = userEvent.setup({ delay: null });
    setOnline(true);
    stubApi({
      'GET /report-types': json({ data: API_TYPES }),
      'GET /destinations': DESTINATIONS,
      'POST /reports': apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Solo se aceptan fotos válidas.'),
    });
    const { onDone } = renderForm();
    await fillEverything(user);
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    const alert = await screen.findByText(/Solo se aceptan fotos válidas\./);
    expect(within(alert.closest('p')).getByRole('link', { name: 'Ver pendientes' })).toHaveAttribute(
      'href',
      '/reportar/pendientes',
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Enviar reporte' })).toBeEnabled();
    expect((await listEntries())[0]).toMatchObject({
      status: 'failed',
      lastError: 'Solo se aceptan fotos válidas.',
    });
    expect(sessionStorage.getItem('td:report-draft')).not.toBeNull();
  });

  it('disables the button while the report is being saved', async () => {
    const user = userEvent.setup({ delay: null });
    setOnline(true);
    let release;
    stubApi({
      'GET /report-types': json({ data: API_TYPES }),
      'GET /destinations': DESTINATIONS,
      'POST /reports': () => new Promise((resolve) => (release = () => resolve(json(created, 201)))),
    });
    renderForm();
    await fillEverything(user);
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByRole('button', { name: 'Enviando…' }, { timeout: 4000 })).toBeDisabled();
    await waitFor(() => expect(release).toBeTypeOf('function'));
    release();
  });

  it('a signed-in, non-anonymous report is flagged so only the page (with the session) sends it', async () => {
    const user = userEvent.setup({ delay: null });
    setOnline(false);
    stubApi({ 'GET /report-types': json({ data: API_TYPES }), 'GET /destinations': DESTINATIONS });
    const { onDone } = renderForm({ auth: authed });
    await fillEverything(user);
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [entry] = await listEntries();
    expect(entry.needsSession).toBe(true);
    expect(entry.payload.anonymous).toBe(false);
  });
});
