import { useId, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import { MAX_COMMENT_LENGTH } from '../api/reviewsApi.js';

export function reviewErrorMessage(error) {
  if (error?.kind === 'offline' || error?.kind === 'network' || error?.kind === 'timeout') {
    return 'Sin conexión: tu reseña no se envió. Inténtalo cuando vuelvas a tener señal.';
  }
  if (error?.status === 401) return 'Tu sesión venció. Inicia sesión de nuevo para reseñar.';
  if (error?.status === 429) return 'Demasiados intentos. Espera un momento e inténtalo otra vez.';
  return error?.message || 'No se pudo guardar tu reseña. Inténtalo de nuevo.';
}

/**
 * Accessible 1-5 star form: a radio group (arrow keys work natively), an optional comment and
 * explicit error / progress feedback. `onSubmit({ rating, comment })` must return a promise.
 */
export default function ReviewForm({ initial = null, onSubmit }) {
  const id = useId();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [problem, setProblem] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!rating) {
      setProblem('Elige de 1 a 5 estrellas.');
      return;
    }
    setProblem('');
    setSubmitting(true);
    try {
      await onSubmit({ rating, comment });
    } catch (error) {
      setProblem(reviewErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="review-form" onSubmit={submit} noValidate aria-busy={submitting}>
      <fieldset className="rating-input" aria-describedby={problem ? `${id}-error` : undefined}>
        <legend>Tu calificación</legend>
        <div className="rating-input__options">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="rating-input__option">
              <input
                type="radio"
                name={`${id}-rating`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
              />
              <Icon
                name="star"
                size={28}
                filled={n <= rating}
                className={n <= rating ? 'star' : 'star star--off'}
              />
              <span className="sr-only">
                {n} {n === 1 ? 'estrella' : 'estrellas'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor={`${id}-comment`} className="review-form__label">
        Comentario <span className="muted">(opcional)</span>
      </label>
      <textarea
        id={`${id}-comment`}
        className="review-form__comment"
        rows={3}
        maxLength={MAX_COMMENT_LENGTH}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Cuéntanos cómo estuvo tu visita"
      />
      <p className="muted review-form__count" aria-hidden="true">
        {comment.length}/{MAX_COMMENT_LENGTH}
      </p>

      {problem && (
        <p id={`${id}-error`} className="form-alert" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" className="btn btn--primary" disabled={submitting}>
        {submitting ? 'Guardando…' : initial ? 'Actualizar reseña' : 'Publicar reseña'}
      </button>
    </form>
  );
}
