import { useId, useState } from 'react';
import Icon from './Icon.jsx';
import { ACCEPTED_TYPES, PhotoError, preparePhoto } from '../utils/imagePrep.js';

const defaultPreviewAlt = (index) => `Vista previa de la imagen ${index + 1}`;
const defaultRemoveLabel = (index, single) =>
  single ? 'Quitar imagen' : `Quitar foto ${index + 1}`;

/**
 * Shared image picker used by every form. It mirrors the report photo picker (thumbnails,
 * add/remove, local shrinking) and adapts to one or several images.
 *
 * `images` is controlled: [{ id, url, file?, local? }]. When `upload(file)` is provided the
 * prepared file is uploaded immediately and the item keeps only the returned URL; without it the
 * file stays in the item so an offline queue (event proposals) can store it.
 */
export default function ImagePicker({
  id,
  label,
  hint,
  error,
  images = [],
  onChange,
  max = 1,
  upload,
  disabled = false,
  previewAlt = defaultPreviewAlt,
  removeLabel = defaultRemoveLabel,
  addLabel,
  className = '',
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const single = max === 1;
  const full = !single && images.length >= max;
  const shownError = error || problem;
  const describedBy = [hint && hintId, shownError && errorId].filter(Boolean).join(' ') || undefined;

  const altFor = (index) => (typeof previewAlt === 'function' ? previewAlt(index) : previewAlt);
  const removeText = (index) => removeLabel(index, single);
  const addText = busy
    ? upload
      ? 'Subiendo…'
      : 'Preparando…'
    : images.length === 0
      ? (addLabel ?? (single ? 'Subir imagen' : 'Agregar fotos'))
      : single
        ? 'Cambiar imagen'
        : 'Agregar otra foto';

  const pick = async (event) => {
    const input = event.target;
    const picked = [...(input.files ?? [])];
    input.value = '';
    if (picked.length === 0) return;

    const room = single ? 1 : Math.max(0, max - images.length);
    const files = picked.slice(0, room);
    const tooMany = picked.length > files.length;
    setBusy(true);
    setProblem(tooMany ? `Solo puedes adjuntar ${max} ${max === 1 ? 'imagen' : 'imágenes'}.` : '');
    const added = [];
    for (const file of files) {
      try {
        const prepared = await preparePhoto(file);
        if (upload) {
          const url = await upload(prepared);
          added.push({ id: crypto.randomUUID(), url, file: null, local: false });
        } else {
          added.push({ id: crypto.randomUUID(), url: URL.createObjectURL(prepared), file: prepared, local: true });
        }
      } catch (uploadError) {
        setProblem(
          uploadError instanceof PhotoError
            ? uploadError.message
            : uploadError?.message || 'No pudimos preparar esa imagen.',
        );
      }
    }
    if (added.length > 0) {
      if (single) {
        if (images[0]?.local) URL.revokeObjectURL(images[0].url);
        onChange([added[0]]);
      } else {
        onChange([...images, ...added]);
      }
    }
    setBusy(false);
  };

  const remove = (image) => {
    if (image.local) URL.revokeObjectURL(image.url);
    onChange(images.filter((item) => item.id !== image.id));
  };

  return (
    <section
      className={`photo-picker image-picker${single ? ' image-picker--single' : ''} ${className}`.trim()}
      aria-labelledby={`${inputId}-label`}
    >
      <span id={`${inputId}-label`} className="field__label">
        {label}
      </span>
      {hint && (
        <p id={hintId} className="muted photo-picker__hint">
          {hint}
        </p>
      )}
      {images.length > 0 && (
        <ul className="photo-grid">
          {images.map((image, index) => (
            <li key={image.id ?? image.url} className="photo-grid__item">
              <img src={image.url} alt={altFor(index)} />
              <button
                type="button"
                className="photo-grid__remove"
                aria-label={removeText(index)}
                onClick={() => remove(image)}
                disabled={disabled || busy}
              >
                <Icon name="close" size={16} strong />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label
        htmlFor={inputId}
        className={full || busy || disabled ? 'btn btn--ghost photo-picker__add is-disabled' : 'btn btn--ghost photo-picker__add'}
      >
        <Icon name="plus" size={18} />
        {addText}
      </label>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple={!single}
        disabled={disabled || busy || full}
        onChange={pick}
        aria-describedby={describedBy}
      />
      {shownError && (
        <p id={errorId} className="field__error" role="alert">
          {shownError}
        </p>
      )}
    </section>
  );
}
