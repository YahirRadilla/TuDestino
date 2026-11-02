import Icon from './Icon.jsx';
import { useInstallPrompt } from '../hooks/useInstallPrompt.js';

// "Instalar app" button. Renders nothing unless the browser offered the install prompt.
// variant "compact" = header; "card" = dismissible banner; "profile" = always available (ignores dismissal).
export default function InstallButton({ variant = 'compact' }) {
  const { canInstall, canInstallManually, install, dismiss } = useInstallPrompt();
  const visible = variant === 'profile' ? canInstallManually : canInstall;
  if (!visible) return null;

  if (variant === 'card') {
    return (
      <section className="install-card" aria-label="Instalar app">
        <div className="install-card__icon">
          <Icon name="download" size={22} />
        </div>
        <div className="install-card__text">
          <strong>Instala TuDestino</strong>
          <span>Úsala como app y consulta destinos aun con poca señal.</span>
        </div>
        <div className="install-card__actions">
          <button type="button" className="btn btn--primary" onClick={install}>
            Instalar app
          </button>
          <button type="button" className="btn btn--ghost" onClick={dismiss}>
            Ahora no
          </button>
        </div>
      </section>
    );
  }

  return (
    <button type="button" className="btn btn--primary install-btn" onClick={install}>
      <Icon name="download" size={18} />
      Instalar app
    </button>
  );
}
