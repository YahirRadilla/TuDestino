import { useEffect } from 'react';
import { useSession } from '../auth/authContext.js';
import { registerReportsSync } from '../../pwa/reportSync.js';
import { countEntries } from '../../storage/outbox.js';
import { notifyOutboxChanged } from './outboxEvents.js';
import { flushOutbox } from './reportQueue.js';

// Renders nothing. Page-side delivery of the report outbox. It is the whole mechanism where
// Background Sync does not exist (Safari, Firefox) and a complement where it does (it is also the
// only sender that has the session, which linked reports need):
//   - when the app opens (once the session is known),
//   - when the connection returns (`online`),
//   - when the tab becomes visible again.
// Delivery is idempotent: the outbox claim and the API's client_uuid make a double attempt harmless.
export default function OutboxSync() {
  const { status } = useSession();

  useEffect(() => {
    // A session still being restored would send a "linked" report as a visitor.
    if (status === 'loading') return undefined;
    let cancelled = false;

    const run = async () => {
      if (cancelled || !navigator.onLine) return;
      const summary = await flushOutbox({ onChange: notifyOutboxChanged }).catch(() => null);
      if (!cancelled && summary && (summary.sent || summary.failed || summary.retry)) {
        notifyOutboxChanged();
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && run();

    run();
    // Waiting reports on a browser with Background Sync: make sure the worker is subscribed too.
    countEntries().then((count) => count > 0 && registerReportsSync());
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status]);

  return null;
}
