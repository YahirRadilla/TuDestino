import { useCallback, useEffect, useState } from 'react';
import { listProposalEntries } from '../../storage/proposalOutbox.js';
import { onOutboxChanged } from '../reports/outboxEvents.js';

/** The event-proposal outbox as React state, kept fresh by change announcements from any context. */
export function useProposalOutbox() {
  const [state, setState] = useState({ loading: true, entries: [] });

  const refresh = useCallback(async () => {
    const entries = await listProposalEntries();
    setState({ loading: false, entries });
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => {
      listProposalEntries().then((entries) => active && setState({ loading: false, entries }));
    };
    load();
    const unsubscribe = onOutboxChanged(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { ...state, count: state.entries.length, refresh };
}
