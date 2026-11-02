import { useEffect, useRef, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';

// Copies `value` to the clipboard and says so. Without the Clipboard API (or without permission)
// it asks the user to copy the visible text by hand.
export default function CopyButton({ value, label }) {
  const [state, setState] = useState('idle');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 4000);
  };

  return (
    <>
      <button type="button" className="btn btn--ghost copy-btn" onClick={copy}>
        <Icon name={state === 'copied' ? 'check' : 'tag'} size={18} />
        {state === 'copied' ? 'Copiado' : label}
      </button>
      <span className="sr-only" role="status">
        {state === 'copied' ? 'Copiado al portapapeles.' : ''}
      </span>
      {state === 'failed' && (
        <span className="field__error" role="alert">
          No pudimos copiar. Selecciona el texto y cópialo.
        </span>
      )}
    </>
  );
}
