import { useState } from 'react';
import Modal from '../../../shared/components/Modal.jsx';
import { TextAreaField } from '../../../shared/components/FieldControls.jsx';
import { adminErrorMessage } from '../adminErrors.js';

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** Asks for a short reason (required or optional) before a moderation action. */
export default function ReasonDialog({
  title,
  intro,
  label = 'Motivo',
  required = true,
  confirmLabel,
  danger = false,
  onSubmit,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const text = reason.trim();
    if (required && text.length < REASON_MIN) {
      setError(`Escribe un motivo de al menos ${REASON_MIN} caracteres.`);
      return;
    }
    if (text.length > REASON_MAX) {
      setError(`Máximo ${REASON_MAX} caracteres.`);
      return;
    }
    setError('');
    setProblem('');
    setBusy(true);
    try {
      await onSubmit(text);
    } catch (failure) {
      setProblem(failure?.message || adminErrorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <Modal title={title} size="sm" onClose={busy ? undefined : onCancel} closable={!busy}>
      <form className="form" onSubmit={submit} noValidate aria-busy={busy}>
        {intro && <p className="muted">{intro}</p>}
        <TextAreaField
          id="reason-text"
          label={required ? label : `${label} (opcional)`}
          rows={3}
          value={reason}
          error={error}
          hint={`${reason.trim().length}/${REASON_MAX} caracteres`}
          onChange={(event) => {
            setReason(event.target.value);
            setError('');
          }}
        />
        {problem && (
          <p role="alert" className="form-alert">
            {problem}
          </p>
        )}
        <div className="form__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Volver
          </button>
          <button type="submit" className={danger ? 'btn btn--danger' : 'btn btn--primary'} disabled={busy}>
            {busy ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
