import { useCallback, useEffect, useState } from 'react';
import { readString, writeString } from '../../storage/localStore.js';

export const INSTALL_DISMISSED_KEY = 'td.installDismissed';

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => readString(INSTALL_DISMISSED_KEY) === '1');

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setDeferred(event);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return null;
    deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null); // the event can only be used once
    return choice?.outcome ?? null;
  }, [deferred]);

  const dismiss = useCallback(() => {
    writeString(INSTALL_DISMISSED_KEY, '1');
    setDismissed(true);
  }, []);

  return {
    canInstall: Boolean(deferred) && !dismissed && !isInstalled,
    canInstallManually: Boolean(deferred) && !isInstalled, // e.g. profile screen, ignores dismissal
    isInstalled,
    dismissed,
    install,
    dismiss,
  };
}
