import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider.jsx';
import NotificationsButton from '../../shared/components/NotificationsButton.jsx';
import NotificationsProvider from './NotificationsProvider.jsx';
import { fakeSubscription, installPushEnv } from '../../test/pushEnv.js';
import { session, stubApi } from '../../test/apiStub.js';
import { PUSH_RECEIVED_MESSAGE } from '../../pwa/push.js';

const inbox = (unread) => ({
  data: [],
  meta: { page: 1, limit: 1, total: 0, total_pages: 0 },
  unread_count: unread,
});

function renderBell() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NotificationsProvider>
          <NotificationsButton />
        </NotificationsProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('notifications bell', () => {
  beforeEach(() => {
    localStorage.clear();
    navigator.setAppBadge = vi.fn(async () => {});
    navigator.clearAppBadge = vi.fn(async () => {});
  });
  afterEach(() => {
    delete navigator.setAppBadge;
    delete navigator.clearAppBadge;
    vi.unstubAllGlobals();
  });

  it('shows the real unread count with an accessible name and mirrors it on the app badge', async () => {
    localStorage.setItem('td:session', '1');
    const api = stubApi({ 'POST /auth/refresh': session(), 'GET /me/notifications': inbox(3) });
    renderBell();
    const link = await screen.findByRole('link', { name: 'Notificaciones, 3 sin leer' });
    expect(link).toHaveAttribute('href', '/notificaciones');
    expect(within(link).getByText('3')).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(navigator.setAppBadge).toHaveBeenCalledWith(3));
    const call = api.calls.find((c) => c.path === '/me/notifications');
    expect(call.query).toMatchObject({ page: '1', limit: '1' });
    expect(call.authorization).toBe('Bearer access-1');
  });

  it('caps the visible number but keeps the exact count in the name', async () => {
    localStorage.setItem('td:session', '1');
    stubApi({ 'POST /auth/refresh': session(), 'GET /me/notifications': inbox(150) });
    renderBell();
    const link = await screen.findByRole('link', { name: 'Notificaciones, 150 sin leer' });
    expect(within(link).getByText('99+')).toBeInTheDocument();
  });

  it('shows no number and clears the app badge for a visitor', async () => {
    stubApi({});
    renderBell();
    const link = await screen.findByRole('link', { name: 'Notificaciones, sin novedades' });
    expect(link.querySelector('.badge')).toBeNull();
    await waitFor(() => expect(navigator.clearAppBadge).toHaveBeenCalled());
  });

  it('keeps the last count when the server cannot be reached', async () => {
    localStorage.setItem('td:session', '1');
    let fail = false;
    stubApi({
      'POST /auth/refresh': session(),
      'GET /me/notifications': () => (fail ? new Response('x', { status: 500 }) : inbox(2)),
    });
    renderBell();
    await screen.findByRole('link', { name: 'Notificaciones, 2 sin leer' });
    fail = true;
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByRole('link', { name: 'Notificaciones, 2 sin leer' })).toBeInTheDocument();
  });

  it('refreshes when the worker reports a push', async () => {
    localStorage.setItem('td:session', '1');
    const env = installPushEnv({ permission: 'granted' });
    try {
      let unread = 1;
      stubApi({ 'POST /auth/refresh': session(), 'GET /me/notifications': () => inbox(unread) });
      renderBell();
      await screen.findByRole('link', { name: 'Notificaciones, 1 sin leer' });
      const onMessage = env.serviceWorker.addEventListener.mock.calls.find(([type]) => type === 'message')[1];
      unread = 4;
      onMessage({ data: { type: PUSH_RECEIVED_MESSAGE, badge: 4 } });
      expect(await screen.findByRole('link', { name: 'Notificaciones, 4 sin leer' })).toBeInTheDocument();
    } finally {
      env.restore();
    }
  });

  it('links this device to the signed-in account when a subscription exists', async () => {
    localStorage.setItem('td:session', '1');
    const env = installPushEnv({ permission: 'granted', subscription: fakeSubscription() });
    try {
      const api = stubApi({
        'POST /auth/refresh': session(),
        'GET /me/notifications': inbox(0),
        'POST /push/subscriptions': { data: { subscribed: true } },
      });
      renderBell();
      await waitFor(() => {
        const registrations = api.calls.filter((c) => c.path === '/push/subscriptions');
        expect(registrations.some((c) => c.authorization === 'Bearer access-1')).toBe(true);
      });
    } finally {
      env.restore();
    }
  });
});
