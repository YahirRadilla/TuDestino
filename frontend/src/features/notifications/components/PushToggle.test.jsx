import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PushToggle from './PushToggle.jsx';
import { FAKE_KEYS, fakeSubscription, installPushEnv, mockIos } from '../../../test/pushEnv.js';
import { apiError, noContent, stubApi } from '../../../test/apiStub.js';

const ROUTES = {
  'GET /push/public-key': { data: { public_key: 'AQID' } },
  'POST /push/subscriptions': { data: { subscribed: true } },
  'DELETE /push/subscriptions': () => noContent(),
};

describe('PushToggle', () => {
  let env;
  let restoreIos;

  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    env?.restore();
    restoreIos?.();
    env = undefined;
    restoreIos = undefined;
    vi.unstubAllGlobals();
  });

  it('explains that the browser has no push support', async () => {
    render(<PushToggle />);
    expect(await screen.findByText('Tu navegador no admite avisos')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('on iOS without installing the app, shows the install guide instead of a switch', async () => {
    restoreIos = mockIos({ standalone: false });
    render(<PushToggle />);
    expect(await screen.findByText('Instala la app para recibir avisos')).toBeInTheDocument();
    expect(screen.getByText(/Agregar a pantalla de inicio/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('on iOS with the app installed, the switch is available', async () => {
    restoreIos = mockIos({ standalone: true });
    env = installPushEnv();
    render(<PushToggle />);
    expect(await screen.findByRole('switch', { name: /Recibir avisos/ })).toBeInTheDocument();
  });

  it('shows how to unblock notifications when permission was denied', async () => {
    env = installPushEnv({ permission: 'denied' });
    render(<PushToggle />);
    expect(await screen.findByText('Los avisos están bloqueados')).toBeInTheDocument();
    expect(screen.getByText(/configuración del sitio/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('asks for permission on click, subscribes with the server key and registers the device', async () => {
    env = installPushEnv();
    const api = stubApi(ROUTES);
    render(<PushToggle />);
    const toggle = await screen.findByRole('switch', { name: /Recibir avisos/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // Nothing is requested until the person acts.
    expect(env.requestPermission).not.toHaveBeenCalled();

    await userEvent.click(toggle);

    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
    expect(env.requestPermission).toHaveBeenCalledTimes(1);
    const [options] = env.pushManager.subscribe.mock.calls[0];
    expect(options.userVisibleOnly).toBe(true);
    expect([...options.applicationServerKey]).toEqual([1, 2, 3]);
    const saved = api.calls.find((call) => call.method === 'POST' && call.path === '/push/subscriptions');
    expect(saved.body).toMatchObject({ endpoint: env.created.endpoint, keys: FAKE_KEYS });
    expect(screen.getByText('Activados en este dispositivo')).toBeInTheDocument();
  });

  it('does nothing else when the person dismisses the permission prompt', async () => {
    env = installPushEnv({ answer: 'default' });
    const api = stubApi(ROUTES);
    render(<PushToggle />);
    await userEvent.click(await screen.findByRole('switch'));
    await waitFor(() => expect(env.requestPermission).toHaveBeenCalled());
    expect(env.pushManager.subscribe).not.toHaveBeenCalled();
    expect(api.calls).toHaveLength(0);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the unblock guide right after the person denies the prompt', async () => {
    env = installPushEnv({ answer: 'denied' });
    stubApi(ROUTES);
    render(<PushToggle />);
    await userEvent.click(await screen.findByRole('switch'));
    expect(await screen.findByText('Los avisos están bloqueados')).toBeInTheDocument();
  });

  it('reflects an existing subscription and turns it off with proof of possession', async () => {
    const existing = fakeSubscription('https://push.example.com/send/mine');
    env = installPushEnv({ permission: 'granted', subscription: existing });
    // Like a real browser: once unsubscribed, getSubscription() no longer returns it.
    existing.unsubscribe = vi.fn(async () => {
      env.state.subscription = null;
      return true;
    });
    const api = stubApi(ROUTES);
    render(<PushToggle />);
    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(toggle);

    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
    const removed = api.calls.find((call) => call.method === 'DELETE' && call.path === '/push/subscriptions');
    expect(removed.body).toEqual({ endpoint: existing.endpoint, auth: FAKE_KEYS.auth });
    expect(existing.unsubscribe).toHaveBeenCalled();
  });

  it('still drops the browser subscription when the server cannot be reached', async () => {
    const existing = fakeSubscription();
    env = installPushEnv({ permission: 'granted', subscription: existing });
    stubApi({ ...ROUTES, 'DELETE /push/subscriptions': () => apiError(500, 'INTERNAL', 'boom') });
    render(<PushToggle />);
    await userEvent.click(await screen.findByRole('switch'));
    await waitFor(() => expect(existing.unsubscribe).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports a server failure while subscribing and keeps the switch off', async () => {
    env = installPushEnv();
    stubApi({ ...ROUTES, 'POST /push/subscriptions': () => apiError(500, 'INTERNAL', 'boom') });
    render(<PushToggle />);
    await userEvent.click(await screen.findByRole('switch'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos activar los avisos/);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('tells the person to reload when no service worker is available', async () => {
    env = installPushEnv();
    env.serviceWorker.ready = new Promise(() => {});
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      stubApi(ROUTES);
      render(<PushToggle />);
      await vi.advanceTimersByTimeAsync(5000);
      await userEvent.click(await screen.findByRole('switch'));
      await vi.advanceTimersByTimeAsync(5000);
      expect(await screen.findByRole('alert')).toHaveTextContent(/Recarga la página/);
    } finally {
      vi.useRealTimers();
    }
  });
});
