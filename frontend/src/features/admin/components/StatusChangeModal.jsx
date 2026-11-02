import { useState } from 'react';
import Modal from '../../../shared/components/Modal.jsx';
import { TextAreaField } from '../../../shared/components/FieldControls.jsx';
import { changeReportStatus } from '../api/adminApi.js';
import { adminErrorMessage } from '../adminErrors.js';
import { REPORT_STATUS_LABELS } from '../adminLabels.js';
import { NOTE_MAX, validateStatusChange } from '../statusValidation.js';

const FORM_ID = 'status-change-form';

// HU-A04: only the statuses the server says are valid from here, and a mandatory note that is
// stored in the immutable history.
export default function StatusChangeModal({ report, onClose, onSaved, onStale }) {
  const allowed = report.allowed_transitions;
  const [status, setStatus] = useState(allowed.length === 1 ? allowed[0] : '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const found = validateStatusChange({ status, note }, allowed);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(found.status ? 'status-options' : 'status-note')?.focus();
      return;
    }
    setSaving(true);
    setProblem('');
    try {
      onSaved(await changeReportStatus(report.id, { status, note: note.trim() }));
    } catch (error) {
      setProblem(adminErrorMessage(error));
      setSaving(false);
      // Someone else changed it first: reload so the options match the real state.
      if (error?.status === 409) onStale?.();
    }
  };

  return (
    <Modal
      title={`Cambiar estado de ${report.folio}`}
      onClose={saving ? undefined : onClose}
      closable={!saving}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambio'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="form" onSubmit={submit} noValidate aria-busy={saving}>
        <p className="muted">
          Estado actual: <strong>{REPORT_STATUS_LABELS[report.status]}</strong>. La nota queda en el historial
          y no se puede editar después.
        </p>
        <fieldset
          id="status-options"
          tabIndex={-1}
          className={errors.status ? 'choice-group choice-group--error' : 'choice-group'}
          aria-describedby={errors.status ? 'status-options-error' : undefined}
        >
          <legend className="field__label">Nuevo estado</legend>
          {allowed.map((value) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="status"
                value={value}
                checked={status === value}
                onChange={() => {
                  setStatus(value);
                  setErrors((current) => ({ ...current, status: undefined }));
                }}
              />
              <span>{REPORT_STATUS_LABELS[value]}</span>
            </label>
          ))}
          {errors.status && (
            <p id="status-options-error" className="field__error">
              {errors.status}
            </p>
          )}
        </fieldset>
        <TextAreaField
          id="status-note"
          label="Nota del cambio"
          rows={4}
          maxLength={NOTE_MAX + 200}
          value={note}
          error={errors.note}
          hint={`${note.trim().length}/${NOTE_MAX} caracteres`}
          onChange={(event) => {
            setNote(event.target.value);
            setErrors((current) => ({ ...current, note: undefined }));
          }}
        />
        {problem && (
          <p role="alert" className="form-alert">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}
