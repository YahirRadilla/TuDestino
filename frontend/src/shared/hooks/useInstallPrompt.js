import { useCallback, useEffect, useState } from 'react';
import { readString, writeString } from '../../storage/localStore.js';

export const INSTALL_DISMISSED_KEY = 'td.installDismissed';

// iPadOS reports itself as a Mac, so the touch check is needed in addition to the user agent.
export function isIosDevice(nav = globalThis.navigator ?? {}) {
  const userAgent = nav.userAgent ?? '';
  const platform = nav.platform ?? '';
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
  );
}

export function isStandaloneApp(win = globalThis.window) {
  if (!win) return false;
  return Boolean(
    win.matchMedia?.('(display-mode: standalone)')?.matches ||
      win.navigator?.standalone === true,
  );
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneApp());
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

  const ios = isIosDevice();
  return {
    canInstall: Boolean(deferred) && !dismissed && !isInstalled,
    // iOS never fires beforeinstallprompt, so the profile screen shows instructions instead.
    canInstallManually: (Boolean(deferred) || ios) && !isInstalled,
    isIos: ios,
    isInstalled,
    dismissed,
    install,
    dismiss,
  };
}
