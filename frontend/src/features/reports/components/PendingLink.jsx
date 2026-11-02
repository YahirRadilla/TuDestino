import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import { useOutbox } from '../useOutbox.js';

// Round button to "Pendientes de envío" with the number of reports waiting on this device.
export default function PendingLink() {
  const { count } = useOutbox();
  return (
    <Link
      to="/reportar/pendientes"
      className="icon-btn icon-btn--badge"
      aria-label={count > 0 ? `Pendientes de envío (${count})` : 'Pendientes de envío'}
    >
      <Icon name="refresh" />
      {count > 0 && (
        <span className="badge" aria-hidden="true">
          {count}
        </span>
      )}
    </Link>
  );
}
