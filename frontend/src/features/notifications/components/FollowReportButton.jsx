import { useEffect, useRef, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import { followReport } from '../pushApi.js';
import { usePush } from '../usePush.js';
import PushGuide from './PushGuide.jsx';

export function followErrorMessage(error) {
  if (error?.kind === 'offline' || error?.kind === 'network' || error?.kind === 'timeout') {
    return 'Sin conexión: no pudimos activar los avisos. Inténtalo cuando tengas señal.';
  }
  if (error?.status === 404) return 'No pudimos verificar el folio y el código de este reporte.';
  if (error?.status === 429) return 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.';
  return 'No pudimos activar los avisos de este reporte. Inténtalo de nuevo.';
}

/**
 * "Recibir avisos de este reporte": asks for permission if needed, subscribes this device and ties
 * the report to it with folio + tracking code. The code arrives as a prop and is only used for the
 * request: it is never stored, and no account or identity is linked (ADR-03).
 * Renders nothing where push cannot work at all (the page already explains it elsewhere).
 */
export default function FollowReportButton({ folio, trackingCode }) {
  const push = usePush();
  const [state, setState] = useState({ phase: 'idle', error: '' });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  if (push.status === 'checking' || push.status === 'unsupported') return null;
  if (push.status === 'ios-install' || push.status === 'denied') return <PushGuide kind={push.status} />;
  if (!folio || !trackingCode) return null;

  const follow = async () => {
    setState({ phase: 'working', error: '' });
    try {
      const subscription = await push.subscribe();
      if (!subscription) {
        if (alive.current) setState({ phase: 'idle', error: '' });
        return;
      }
      await followReport({ folio, trackingCode, endpoint: subscription.endpoint });
      if (alive.current) setState({ phase: 'done', error: '' });
    } catch (error) {
      if (alive.current) setState({ phase: 'idle', error: followErrorMessage(error) });
    }
  };

  if (state.phase === 'done') {
    return (
      <p className="follow-report__done" role="status">
        <Icon name="check" size={18} /> Te avisaremos en este dispositivo cuando cambie el estado del reporte.
      </p>
    );
  }
  return (
    <div className="follow-report">
      <button
        type="button"
        className="btn btn--ghost"
        onClick={follow}
        disabled={state.phase === 'working' || push.busy}
      >
        <Icon name="bell" size={18} />
        {state.phase === 'working' ? 'Activando…' : 'Recibir avisos de este reporte'}
      </button>
      {(state.error || push.error) && (
        <p className="form-alert" role="alert">
          {state.error || push.error}
        </p>
      )}
    </div>
  );
}
