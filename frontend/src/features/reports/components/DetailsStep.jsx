import { useId } from 'react';
import { Link } from 'react-router-dom';
import { MAX_DESCRIPTION } from '../reportValidation.js';

// Step 3: what happened, who may know it was you, and send.
export default function DetailsStep({ description, onDescription, error, anonymous, onAnonymous, signedIn }) {
  const id = useId();
  return (
    <div className="report-step">
      <h2 className="report-step__title">Cuéntanos qué viste</h2>

      <div className={error ? 'field field--error' : 'field'}>
        <label htmlFor={`${id}-description`} className="field__label">
          Descripción
        </label>
        <textarea
          id={`${id}-description`}
          className="field__input field__textarea"
          rows={5}
          maxLength={MAX_DESCRIPTION}
          value={description}
          onChange={(event) => onDescription(event.target.value)}
          placeholder="Qué pasó, cuántos animales o personas, qué tan grave se ve…"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-description-error` : undefined}
        />
        <p className="muted review-form__count" aria-hidden="true">
          {description.length}/{MAX_DESCRIPTION}
        </p>
        {error && (
          <p id={`${id}-description-error`} className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        className="setting"
        role="switch"
        aria-checked={anonymous}
        aria-describedby={`${id}-anon-help`}
        onClick={() => onAnonymous(!anonymous)}
      >
        <span className="setting__text">
          <strong>Reportar de forma anónima</strong>
          <span className="muted" id={`${id}-anon-help`}>
            {anonymous
              ? 'No guardamos tu nombre, tu correo ni tu IP. Para consultar el reporte usarás un folio y un código.'
              : signedIn
                ? 'El reporte quedará vinculado a tu cuenta.'
                : 'No vinculamos el reporte a ninguna cuenta porque no has iniciado sesión.'}
          </span>
        </span>
        <span className={`switch ${anonymous ? 'is-on' : ''}`} aria-hidden="true" />
      </button>
      {!signedIn && (
        <p className="muted report-step__aside">
          ¿Quieres seguirlo desde tu cuenta? <Link to="/login">Inicia sesión</Link> antes de enviar.
        </p>
      )}
    </div>
  );
}
