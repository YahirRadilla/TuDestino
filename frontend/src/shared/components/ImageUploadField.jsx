import { useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { ApiError } from '../../api/client.js';
import { uploadPublicImage } from '../../api/uploads.js';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

// File picker + preview shared by every form that used to ask for an image URL. The image is
// uploaded immediately, so the form keeps a normal URL in its value and can be submitted later.
export default function ImageUploadField({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  purpose,
  disabled = false,
  previewAlt = 'Vista previa de la imagen',
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const shownError = error || problem;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && hintId, shownError && errorId].filter(Boolean).join(' ') || undefined;

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProblem('');
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setProblem('Usa una imagen JPEG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem('La imagen puede pesar hasta 5 MB.');
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadPublicImage(file, purpose));
    } catch (uploadError) {
      setProblem(
        uploadError instanceof ApiError
          ? uploadError.message
          : 'No se pudo subir la imagen. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={shownError ? 'field image-upload field--error' : 'field image-upload'}>
      <span className="field__label" id={`${inputId}-label`}>
        {label}
      </span>
      <div className="image-upload__body">
        {value ? (
          <img className="image-upload__preview" src={value} alt={previewAlt} />
        ) : (
          <div className="image-upload__placeholder" aria-hidden="true">
            <Icon name="plus" size={24} />
            <span>Sin imagen</span>
          </div>
        )}
        <div className="image-upload__actions">
          <button
            type="button"
            className="btn btn--ghost image-upload__button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || disabled}
            aria-describedby={describedBy}
          >
            <Icon name="plus" size={18} />
            {busy ? 'Subiendo…' : value ? 'Cambiar imagen' : 'Subir imagen'}
          </button>
          {value && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setProblem('');
                onChange('');
              }}
              disabled={busy || disabled}
            >
              Quitar
            </button>
          )}
          <input
            ref={inputRef}
            id={inputId}
            className="sr-only"
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            onChange={pick}
            disabled={busy || disabled}
            aria-label={typeof label === 'string' ? label : 'Subir imagen'}
          />
        </div>
      </div>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {shownError && (
        <p id={errorId} className="field__error">
          {shownError}
        </p>
      )}
    </div>
  );
}
