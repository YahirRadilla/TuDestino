import { registerSW } from 'virtual:pwa-register';
import { SW_UPDATE_EVENT } from '../shared/components/UpdateToast.jsx';

// Registers the hand-written service worker (src/sw.js) and announces new versions to the UI.
export function registerServiceWorker() {
  const updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: { update: () => updateSW(true) } }));
    },
    onRegisterError(error) {
      console.error('Service worker registration failed', error);
    },
  });
}
