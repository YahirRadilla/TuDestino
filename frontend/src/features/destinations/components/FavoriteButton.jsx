import { useEffect, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import { useFavorites } from '../hooks/useFavorites.js';

const errorMessage = (error) =>
  error?.kind === 'offline' || error?.kind === 'network' || error?.kind === 'timeout'
    ? 'Sin conexión: no se pudo actualizar tu favorito.'
    : 'No se pudo actualizar tu favorito. Inténtalo de nuevo.';

export default function FavoriteButton({ destination, variant = 'glass', className = '' }) {
  const { isFavorite, toggle } = useFavorites();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const active = isFavorite(destination.id);
  const label = active
    ? `Quitar ${destination.name} de favoritos`
    : `Guardar ${destination.name} en favoritos`;

  useEffect(() => {
    if (!problem) return undefined;
    const id = setTimeout(() => setProblem(''), 3500);
    return () => clearTimeout(id);
  }, [problem]);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      await toggle(destination.id);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`icon-btn ${variant === 'glass' ? 'icon-btn--glass' : ''} fav-btn ${active ? 'is-active' : ''} ${className}`}
        aria-pressed={active}
        aria-label={label}
        aria-busy={busy}
        onClick={onClick}
      >
        <Icon name="heart" size={20} filled={active} />
      </button>
      {problem && (
        <div className="toast" role="alert">
          <span>{problem}</span>
        </div>
      )}
    </>
  );
}
