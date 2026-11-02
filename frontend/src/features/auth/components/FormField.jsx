import { useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';

// Label + input + hint + error wired together (htmlFor, aria-invalid, aria-describedby).
export default function FormField({ id, label, error, hint, trailing, ...inputProps }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="field__control">
        <input
          id={id}
          className="field__input"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {trailing}
      </div>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

// Password input with a show/hide toggle (a toggle button, not a checkbox).
export function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField
      {...props}
      type={visible ? 'text' : 'password'}
      autoCapitalize="none"
      spellCheck={false}
      trailing={
        <button
          type="button"
          className="field__toggle"
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((value) => !value)}
        >
          <Icon name={visible ? 'close' : 'eye'} size={20} />
        </button>
      }
    />
  );
}
