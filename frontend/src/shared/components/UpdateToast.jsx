import { useEffect, useState } from 'react';

export const SW_UPDATE_EVENT = 'td:sw-need-refresh';

// Discreet notice shown when a new version of the app is waiting.
export default function UpdateToast() {
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    const onNeedRefresh = (event) => setUpdate(() => event.detail?.update ?? null);
    window.addEventListener(SW_UPDATE_EVENT, onNeedRefresh);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onNeedRefresh);
  }, []);

  if (!update) return null;
  return (
    <div className="toast" role="status">
      <span>Hay una nueva versión disponible.</span>
      <button type="button" className="toast__action" onClick={() => update()}>
        Actualizar
      </button>
      <button type="button" className="toast__dismiss" onClick={() => setUpdate(null)}>
        Luego
      </button>
    </div>
  );
}
