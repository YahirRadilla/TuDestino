// Companions of FormField (a text input) with the same label / hint / error wiring.
const describedBy = (id, hint, error) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

function Messages({ id, hint, error }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </>
  );
}

export function TextAreaField({ id, label, error, hint, rows = 4, ...props }) {
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className="field__input field__textarea"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

// `options` is [{ value, label }].
export function SelectField({ id, label, error, hint, options, placeholder, ...props }) {
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <select
        id={id}
        className="field__input field__select"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export function CheckboxField({ id, label, hint, ...props }) {
  return (
    <div className="field field--check">
      <label htmlFor={id} className="check">
        <input id={id} type="checkbox" aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
        <span>{label}</span>
      </label>
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
