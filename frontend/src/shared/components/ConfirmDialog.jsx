import { useRef, useState } from 'react';
import Modal from './Modal.jsx';

/**
 * Confirmation before a destructive action. Focus starts on "Cancelar" so Enter never confirms by
 * accident. `onConfirm` returns a promise; a thrown error is shown inside the dialog.
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirmar',
  busyLabel = 'Procesando…',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (failure) {
      setError(failure?.message || 'No se pudo completar la acción. Inténtalo de nuevo.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      role="alertdialog"
      size="sm"
      onClose={busy ? undefined : onCancel}
      closable={!busy}
      initialFocus={cancelRef}
      footer={
        <>
          <button ref={cancelRef} type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm__text">{children}</div>
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
