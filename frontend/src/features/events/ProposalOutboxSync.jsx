import { useEffect } from 'react';
import { useSession } from '../auth/authContext.js';
import { notifyOutboxChanged } from '../reports/outboxEvents.js';
import { flushProposalOutbox } from './proposalQueue.js';

// Renders nothing. Every proposal needs the signed-in user, so this page-side loop is the only
// sender (Background Sync has no session). It runs when the app opens with a session, when the
// connection returns and when the tab becomes visible again.
export default function ProposalOutboxSync() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    let cancelled = false;

    const run = async () => {
      if (cancelled || !navigator.onLine) return;
      await flushProposalOutbox({ onChange: notifyOutboxChanged });
    };

    void run();
    const onOnline = () => void run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status]);

  return null;
}
