import Icon from '../../../shared/components/Icon.jsx';

// Step 1: large cards, one tap each. A radio group so arrow keys and screen readers work natively.
export default function TypeStep({ types, value, onChange, error }) {
  return (
    <fieldset className="report-step" aria-describedby={error ? 'type-error' : undefined}>
      <legend className="report-step__title">¿Qué quieres reportar?</legend>
      <div className="type-grid">
        {types.map((type) => (
          <label key={type.slug} className={value === type.slug ? 'type-card is-selected' : 'type-card'}>
            <input
              type="radio"
              name="report-type"
              value={type.slug}
              checked={value === type.slug}
              onChange={() => onChange(type.slug)}
            />
            <span className="type-card__icon">
              <Icon name={type.icon} size={28} />
            </span>
            <span className="type-card__text">
              <strong>{type.name}</strong>
              {type.help && <span className="muted">{type.help}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id="type-error" className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
