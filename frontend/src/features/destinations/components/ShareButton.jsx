import { useEffect, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import { shareOrCopy } from '../../../shared/utils/share.js';

// Web Share (PWA-15) for any shareable thing: `path` is relative to the site origin.
export default function ShareButton({ name, text, path, variant = 'glass' }) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(() => setMessage(''), 2800);
    return () => clearTimeout(id);
  }, [message]);

  const onShare = async () => {
    const result = await shareOrCopy({
      title: `${name} · TuDestino`,
      text,
      url: `${window.location.origin}${path}`,
    });
    if (result === 'copied') setMessage('Enlace copiado');
    if (result === 'failed')
      setMessage('No se pudo compartir. Copia el enlace desde la barra de direcciones.');
  };

  return (
    <>
      <button
        type="button"
        className={`icon-btn ${variant === 'glass' ? 'icon-btn--glass' : ''}`}
        onClick={onShare}
        aria-label={`Compartir ${name}`}
      >
        <Icon name="share" size={20} />
      </button>
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
        </div>
      )}
    </>
  );
}
