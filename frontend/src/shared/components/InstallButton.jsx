import { useState } from 'react';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import { useInstallPrompt } from '../hooks/useInstallPrompt.js';

// "Instalar app" button. Android/Chrome gets the native prompt; iOS Safari has no install API,
// so the profile variant opens the manual Share → Add to Home Screen instructions.
// variant "compact" = header; "card" = dismissible banner; "profile" = always available.
export default function InstallButton({ variant = 'compact' }) {
  const { canInstall, canInstallManually, install, dismiss, isIos } = useInstallPrompt();
  const [showGuide, setShowGuide] = useState(false);
  const visible = variant === 'profile' ? canInstallManually : canInstall;
  if (!visible) return null;

  const handleInstall = async () => {
    if (!canInstall && isIos) {
      setShowGuide(true);
      return;
    }
    await install();
  };

  const guide = showGuide && (
    <Modal
      title="Instalar TuDestino"
      size="sm"
      onClose={() => setShowGuide(false)}
      footer={
        <button type="button" className="btn btn--primary" onClick={() => setShowGuide(false)}>
          Entendido
        </button>
      }
    >
      <p>
        En iPhone y iPad, Safari no permite abrir el instalador desde un botón. Hazlo así:
      </p>
      <ol className="install-guide">
        <li>Toca el botón Compartir (el cuadro con la flecha hacia arriba).</li>
        <li>Desplázate y elige «Añadir a pantalla de inicio».</li>
        <li>Toca «Añadir»; el icono aparecerá en tu pantalla de inicio.</li>
      </ol>
      <p className="muted">
        Si abriste esta página en otro navegador, primero ábrela en Safari.
      </p>
    </Modal>
  );

  if (variant === 'card') {
    return (
      <>
        <section className="install-card" aria-label="Instalar app">
          <div className="install-card__icon">
            <Icon name="download" size={22} />
          </div>
          <div className="install-card__text">
            <strong>Instala TuDestino</strong>
            <span>Úsala como app y consulta destinos aun con poca señal.</span>
          </div>
          <div className="install-card__actions">
            <button type="button" className="btn btn--primary" onClick={handleInstall}>
              Instalar app
            </button>
            <button type="button" className="btn btn--ghost" onClick={dismiss}>
              Ahora no
            </button>
          </div>
        </section>
        {guide}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--primary install-btn"
        onClick={handleInstall}
      >
        <Icon name="download" size={18} />
        Instalar app
      </button>
      {guide}
    </>
  );
}
