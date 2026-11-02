import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../auth/authContext.js';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { clearDraft, readDraft, writeDraft } from '../reportDraft.js';
import { fetchReportTypes } from '../reportsApi.js';
import { REPORT_TYPES, withTypeMeta } from '../reportTypes.js';
import { parseLat, parseLng, validateStep } from '../reportValidation.js';
import { submitReport } from '../submitReport.js';
import DetailsStep from './DetailsStep.jsx';
import LocationStep from './LocationStep.jsx';
import PhotoPicker from './PhotoPicker.jsx';
import TypeStep from './TypeStep.jsx';

const LAST_STEP = 3;
const STEP_TITLES = ['Tipo', 'Fotos y lugar', 'Detalles'];

// Three steps: type -> photos and place -> description and send. The draft survives a reload.
export default function ReportForm({ onDone }) {
  const { isAuthenticated } = useSession();
  const [draft, setDraft] = useState(readDraft);
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const headingRef = useRef(null);
  const mountedRef = useRef(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Types come from the API; the bundled list keeps the form working offline.
  const remote = useRemoteData({
    key: 'report-types',
    load: (signal) => fetchReportTypes(signal),
    fallback: () => REPORT_TYPES,
  });
  const types = useMemo(
    () => (remote.status === 'ready' && remote.data?.length > 0 ? withTypeMeta(remote.data) : REPORT_TYPES),
    [remote.status, remote.data],
  );

  useEffect(() => writeDraft(draft), [draft]);
  // Moves focus to the step label when the step changes (not on first render).
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [draft.step]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  const patch = useCallback((changes) => {
    setDraft((current) => ({ ...current, ...changes }));
    setErrors({});
  }, []);

  const anonymous = draft.anonymous ?? !isAuthenticated;
  const { step } = draft;

  const addPhotos = useCallback((added) => setPhotos((current) => [...current, ...added]), []);
  const removePhoto = useCallback((id) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((photo) => photo.id !== id);
    });
  }, []);

  const next = () => {
    const found = validateStep(step, draft);
    setErrors(found);
    if (Object.keys(found).length === 0) setDraft((current) => ({ ...current, step: step + 1 }));
  };
  const back = () => {
    setErrors({});
    setDraft((current) => ({ ...current, step: step - 1 }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (step < LAST_STEP) {
      next();
      return;
    }
    const found = validateStep(LAST_STEP, draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setSubmitError('');
    const result = await submitReport({
      clientUuid: draft.clientUuid,
      payload: {
        type: draft.type,
        description: draft.description.trim(),
        lat: parseLat(draft.lat),
        lng: parseLng(draft.lng),
        accuracy_m: draft.accuracy_m,
        destination_slug: draft.destination_slug || null,
        anonymous,
      },
      photos: photos.map((photo) => photo.file),
      // Only a session can link the report; the service worker has none, so the page sends it.
      needsSession: !anonymous && isAuthenticated,
    });
    setSubmitting(false);
    if (result.phase === 'failed' || result.phase === 'error') {
      setSubmitError(result.reason);
      return;
    }
    clearDraft();
    onDone(result);
  };

  return (
    <form className="report-form" onSubmit={submit} noValidate aria-busy={submitting}>
      <div className="steps" aria-label="Progreso">
        <p className="steps__label" tabIndex={-1} ref={headingRef}>
          Paso {step} de {LAST_STEP} · {STEP_TITLES[step - 1]}
        </p>
        <div className="steps__bar" aria-hidden="true">
          <span style={{ width: `${(step / LAST_STEP) * 100}%` }} />
        </div>
      </div>

      {step === 1 && (
        <TypeStep types={types} value={draft.type} onChange={(type) => patch({ type })} error={errors.type} />
      )}
      {step === 2 && (
        <div className="report-step">
          <PhotoPicker photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
          <LocationStep values={draft} errors={errors} onChange={patch} />
        </div>
      )}
      {step === 3 && (
        <DetailsStep
          description={draft.description}
          onDescription={(description) => patch({ description })}
          error={errors.description}
          anonymous={anonymous}
          onAnonymous={(value) => patch({ anonymous: value })}
          signedIn={isAuthenticated}
        />
      )}

      {submitError && (
        <p className="form-alert" role="alert">
          {submitError} <Link to="/reportar/pendientes">Ver pendientes</Link>
        </p>
      )}

      <div className="report-form__actions">
        {step > 1 && (
          <button type="button" className="btn btn--ghost" onClick={back} disabled={submitting}>
            Atrás
          </button>
        )}
        <button type="submit" className="btn btn--primary report-form__next" disabled={submitting}>
          {step < LAST_STEP ? 'Siguiente' : submitting ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </div>
    </form>
  );
}
