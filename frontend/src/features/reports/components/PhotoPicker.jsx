import { useId, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import { ACCEPTED_TYPES, MAX_PHOTOS, PhotoError, preparePhoto } from '../imagePrep.js';

// Up to 4 photos, shrunk on the device. `photos` is [{ id, file, url }] owned by the form.
export default function PhotoPicker({ photos, onAdd, onRemove }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const full = photos.length >= MAX_PHOTOS;

  const pick = async (event) => {
    const files = [...event.target.files].slice(0, MAX_PHOTOS - photos.length);
    const tooMany = event.target.files.length > files.length;
    event.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setProblem(tooMany ? `Solo puedes adjuntar ${MAX_PHOTOS} fotos.` : '');
    const added = [];
    for (const file of files) {
      try {
        const prepared = await preparePhoto(file);
        added.push({ id: crypto.randomUUID(), file: prepared, url: URL.createObjectURL(prepared) });
      } catch (error) {
        setProblem(error instanceof PhotoError ? error.message : 'No pudimos leer esa foto.');
      }
    }
    onAdd(added);
    setBusy(false);
  };

  return (
    <section className="photo-picker" aria-labelledby={`${inputId}-label`}>
      <h3 id={`${inputId}-label`} className="report-step__subtitle">
        Fotos <span className="muted">(opcional, hasta {MAX_PHOTOS})</span>
      </h3>
      <p className="muted photo-picker__hint">
        Las fotos se reducen en tu teléfono y se les quitan los datos ocultos (como la ubicación de la
        cámara).
      </p>
      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((photo, index) => (
            <li key={photo.id} className="photo-grid__item">
              <img src={photo.url} alt={`Foto ${index + 1} del reporte`} />
              <button
                type="button"
                className="photo-grid__remove"
                aria-label={`Quitar foto ${index + 1}`}
                onClick={() => onRemove(photo.id)}
              >
                <Icon name="close" size={16} strong />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label
        htmlFor={inputId}
        className={
          full || busy ? 'btn btn--ghost photo-picker__add is-disabled' : 'btn btn--ghost photo-picker__add'
        }
      >
        <Icon name="plus" size={18} />
        {busy ? 'Preparando…' : photos.length === 0 ? 'Agregar fotos' : 'Agregar otra foto'}
      </label>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        disabled={full || busy}
        onChange={pick}
      />
      {problem && (
        <p className="field__error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
