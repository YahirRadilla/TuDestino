import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FollowReportButton, { followErrorMessage } from './FollowReportButton.jsx';
import { getDb } from '../../../storage/db.js';
import { installPushEnv, mockIos } from '../../../test/pushEnv.js';
import { apiError, stubApi } from '../../../test/apiStub.js';

const ROUTES = {
  'GET /push/public-key': { data: { public_key: 'AQID' } },
  'POST /push/subscriptions': { data: { subscribed: true } },
  'POST /reports/follow': { data: { following: true } },
};
const BUTTON = /Recibir avisos de este reporte/;

describe('FollowReportButton', () => {
  let env;
  let restoreIos;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    env?.restore();
    restoreIos?.();
    env = undefined;
    restoreIos = undefined;
    vi.unstubAllGlobals();
  });

  it('renders nothing where the browser cannot do push', () => {
    const { container } = render(<FollowReportButton folio="TD-2026-000123" trackingCode="ABCDE23456" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('subscribes the device and follows the report with folio + code, without any identity', async () => {
    env = installPushEnv();
    const api = stubApi(ROUTES);
    render(<FollowReportButton folio="td-2026-000123" trackingCode="abcde-23456" />);

    await userEvent.click(await screen.findByRole('button', { name: BUTTON }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Te avisaremos en este dispositivo/);
    const follow = api.calls.find((call) => call.path === '/reports/follow');
    expect(follow.body).toEqual({
      folio: 'TD-2026-000123',
      tracking_code: 'ABCDE23456',
      endpoint: env.created.endpoint,
    });
    // Anonymous: the follow request carries no session.
    expect(follow.authorization).toBeUndefined();
    expect(env.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('never persists the tracking code on the device', async () => {
    env = installPushEnv();
    stubApi(ROUTES);
    render(<FollowReportButton folio="TD-2026-000123" trackingCode="ZXCVB98765" />);
    await userEvent.click(await screen.findByRole('button', { name: BUTTON }));
    await screen.findByRole('status');
    expect(JSON.stringify({ ...localStorage })).not.toContain('ZXCVB98765');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('ZXCVB98765');
    const db = await getDb();
    for (const name of db.objectStoreNames) {
      expect(JSON.stringify(await db.getAll(name))).not.toContain('ZXCVB98765');
    }
  });

  it('reuses an existing subscription instead of creating a new one', async () => {
    env = installPushEnv({ permission: 'granted' });
    env.state.subscription = env.created;
    stubApi(ROUTES);
    render(<FollowReportButton folio="TD-2026-000123" trackingCode="ABCDE23456" />);
    await userEvent.click(await screen.findByRole('button', { name: BUTTON }));
    await screen.findByRole('status');
    expect(env.pushManager.subscribe).not.toHaveBeenCalled();
    expect(env.requestPermission).not.toHaveBeenCalled();
  });

  it('stays idle without calling the server when the person declines the permission prompt', async () => {
    env = installPushEnv({ answer: 'default' });
    const api = stubApi(ROUTES);
    render(<FollowReportButton folio="TD-2026-000123" trackingCode="ABCDE23456" />);
    await userEvent.click(await screen.findByRole('button', { name: BUTTON }));
    await waitFor(() => expect(env.requestPermission).toHaveBeenCalled());
    expect(api.calls.some((call) => call.path === '/reports/follow')).toBe(false);
    expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
  });

  it('shows an error when the server rejects the folio + code', async () => {
    env = installPushEnv();
    stubApi({ ...ROUTES, 'POST /reports/follow': () => apiError(404, 'REPORT_NOT_FOUND', 'No encontramos') });
    render(<FollowReportButton folio="TD-2026-000123" trackingCode="ABCDE23456" />);
    await userEvent.click(await screen.findByRole('button', { name: BUTTON }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/folio y el código/);
    expect(screen.getByRole('button', { name: BUTTON })).toBeEnabled();
  });

  it('shows the unblock guide when notifications are blocked', async () => {
    env = installPushEnv({ permission: 'denied' });
    render(<FollowReportButton folio="TD-2026-000123" trackingCode="ABCDE23456" />);
    expect(await screen.findByText('Los avisos están bloqueados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument();
  });

  it('shows the install guide on iOS when the app is not installed', async () => {
    restoreIos = mockIos({ standalone: false });
    render(<FollowReportButton folio="TD-2026-000123" trackingCode="ABCDE23456" />);
    expect(await screen.findByText('Instala la app para recibir avisos')).toBeInTheDocument();
  });

  it('renders nothing without a tracking code (a report that was already acknowledged)', async () => {
    env = installPushEnv();
    const { container } = render(<FollowReportButton folio="TD-2026-000123" trackingCode={null} />);
    await waitFor(() => expect(env.pushManager.getSubscription).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('followErrorMessage', () => {
  it.each([
    [{ kind: 'offline' }, /Sin conexión/],
    [{ kind: 'http', status: 404 }, /folio y el código/],
    [{ kind: 'http', status: 429 }, /Demasiados intentos/],
    [{ kind: 'http', status: 500 }, /No pudimos activar/],
  ])('maps %o', (error, expected) => {
    expect(followErrorMessage(error)).toMatch(expected);
  });
});
