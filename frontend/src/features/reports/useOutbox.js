import { useCallback, useEffect, useState } from 'react';
import { listEntries } from '../../storage/outbox.js';
import { onOutboxChanged } from './outboxEvents.js';

/** The outbox as React state, kept fresh by change announcements from any context. */
export function useOutbox() {
  const [state, setState] = useState({ loading: true, entries: [] });

  const refresh = useCallback(async () => {
    const entries = await listEntries();
    setState({ loading: false, entries });
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => {
      listEntries().then((entries) => active && setState({ loading: false, entries }));
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
