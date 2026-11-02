import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import FormField from '../../auth/components/FormField.jsx';
import { formatSyncTime } from '../../../shared/utils/dates.js';
import FollowReportButton from '../../notifications/components/FollowReportButton.jsx';
import { trackReport } from '../reportsApi.js';
import { STATUS_LABELS } from '../reportTypes.js';
import { validateTracking } from '../reportValidation.js';

// One generic message for "no such folio" and "wrong code": the API never says which one failed.
export function trackingErrorMessage(error) {
  if (error?.kind === 'offline' || error?.kind === 'network' || error?.kind === 'timeout') {
    return 'Sin conexión: no pudimos consultar el reporte. Inténtalo cuando tengas señal.';
  }
  if (error?.status === 404) return 'No encontramos un reporte con ese folio y código. Revisa los datos.';
  if (error?.status === 429) return 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.';
  return 'No pudimos consultar el reporte. Inténtalo de nuevo.';
}

function Timeline({ history }) {
  return (
    <ol className="timeline" aria-label="Historial del reporte">
      {history.map((item, index) => {
        const current = index === history.length - 1;
        return (
          <li
            key={`${item.created_at}-${index}`}
            className="timeline__item"
            aria-current={current ? 'step' : undefined}
          >
            <span className="timeline__dot" aria-hidden="true" />
            <div className="timeline__body">
              <p className="timeline__status">
                <strong>{STATUS_LABELS[item.to_status] ?? item.to_status}</strong>
                {current && <span className="sr-only"> (estado actual)</span>}
              </p>
              {item.note && <p className="timeline__note">{item.note}</p>}
              <time className="muted timeline__time" dateTime={item.created_at}>
                {formatSyncTime(item.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function TrackingPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ folio: params.get('folio') ?? '', code: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  const resultRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (state.status === 'ready' || state.status === 'error') resultRef.current?.focus();
  }, [state.status]);

  const submit = async (event) => {
    event.preventDefault();
    const found = validateTracking(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: 'loading', data: null, error: '' });
    try {
      const data = await trackReport(form, controller.signal);
      if (!controller.signal.aborted) setState({ status: 'ready', data, error: '', code: form.code });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ status: 'error', data: null, error: trackingErrorMessage(error) });
      }
    }
  };

  const change = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  return (
    <div className="container page tracking">
      <PageHeader title="Seguimiento" />
      <p className="muted">
        Escribe el folio y el código que recibiste al enviar tu reporte. No necesitas una cuenta.
      </p>

      <form className="form auth__card" onSubmit={submit} noValidate aria-busy={state.status === 'loading'}>
        <FormField
          id="tracking-folio"
          label="Folio"
          placeholder="TD-2026-000123"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={form.folio}
          error={errors.folio}
          onChange={change('folio')}
        />
        <FormField
          id="tracking-code"
          label="Código de seguimiento"
          placeholder="ABCDE-23456"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={form.code}
          error={errors.code}
          onChange={change('code')}
        />
        <button type="submit" className="btn btn--primary" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Consultando…' : 'Consultar reporte'}
        </button>
      </form>

      <div ref={resultRef} tabIndex={-1} className="tracking__result" aria-live="polite">
        {state.status === 'error' && (
          <p className="form-alert" role="alert">
            {state.error}
          </p>
        )}
        {state.status === 'ready' && (
          <section className="tracking__card" aria-label="Estado del reporte">
            <p className="muted">Folio {state.data.folio}</p>
            <h2 className="tracking__status">{STATUS_LABELS[state.data.status] ?? state.data.status}</h2>
            <Timeline history={state.data.history} />
            {/* The code that just verified the report; it is only passed along in memory. */}
            <FollowReportButton folio={state.data.folio} trackingCode={state.code} />
          </section>
        )}
      </div>

      <p className="muted report__aside">
        ¿Hiciste un reporte sin conexión? <Link to="/reportar/pendientes">Ver pendientes de envío</Link>.
      </p>
    </div>
  );
}
