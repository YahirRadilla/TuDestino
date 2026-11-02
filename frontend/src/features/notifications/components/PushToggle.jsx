import Icon from '../../../shared/components/Icon.jsx';
import { usePush } from '../usePush.js';
import PushGuide from './PushGuide.jsx';

// "Recibir avisos": one switch for this device, plus a guide whenever the switch cannot work.
export default function PushToggle() {
  const push = usePush();

  if (push.status === 'checking') {
    return <div className="skeleton skeleton--row" aria-hidden="true" />;
  }
  if (['ios-install', 'denied', 'unsupported'].includes(push.status)) {
    return <PushGuide kind={push.status} />;
  }

  const on = push.subscribed;
  const toggle = () => (on ? push.unsubscribe() : push.subscribe());
  return (
    <div className="push-toggle">
      <button
        type="button"
        className="setting"
        role="switch"
        aria-checked={on}
        aria-busy={push.busy}
        disabled={push.busy}
        onClick={toggle}
      >
        <Icon name="bell" size={22} />
        <span className="setting__text">
          <strong>Recibir avisos</strong>
          <span className="muted">
            {on
              ? 'Activados en este dispositivo'
              : 'Te avisamos cuando cambie un reporte o se acerque un evento'}
          </span>
        </span>
        <span className={`switch ${on ? 'is-on' : ''}`} aria-hidden="true" />
      </button>
      {push.error && (
        <p className="form-alert" role="alert">
          {push.error}
        </p>
      )}
    </div>
  );
}
