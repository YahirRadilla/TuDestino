import Icon from './Icon.jsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <Icon name="wifiOff" size={18} />
      Sin conexión: mostrando contenido guardado.
    </div>
  );
}
