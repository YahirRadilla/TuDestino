import { Link } from 'react-router-dom';
import CopyButton from './CopyButton.jsx';
import FollowReportButton from '../../notifications/components/FollowReportButton.jsx';

// Folio + tracking code. The code is only ever shown from memory/outbox until it is acknowledged:
// the server returns it once and stores only its hash.
export default function ReceiptCard({ receipt, onAcknowledge, acknowledgeLabel = 'Ya lo guardé' }) {
  return (
    <section className="receipt" aria-label="Datos para dar seguimiento">
      <dl className="receipt__data">
        <div>
          <dt>Folio</dt>
          <dd className="receipt__value" data-testid="receipt-folio">
            {receipt.folio}
          </dd>
          <CopyButton value={receipt.folio} label="Copiar folio" />
        </div>
        {receipt.trackingCode ? (
          <div>
            <dt>Código de seguimiento</dt>
            <dd className="receipt__value receipt__value--code" data-testid="receipt-code">
              {receipt.trackingCode}
            </dd>
            <CopyButton value={receipt.trackingCode} label="Copiar código" />
          </div>
        ) : null}
      </dl>
      {receipt.trackingCode ? (
        <p className="receipt__warning" role="note">
          Guarda tu código ahora: no se vuelve a mostrar. Sin él no podrás consultar el reporte.
        </p>
      ) : (
        <p className="muted">
          Este reporte ya se había registrado antes. Por seguridad, el código de seguimiento solo se muestra
          una vez.
        </p>
      )}
      {/* The code stays in memory: it is only used to prove the report is yours when following it. */}
      <FollowReportButton folio={receipt.folio} trackingCode={receipt.trackingCode} />
      <div className="receipt__actions">
        <Link
          to={`/seguimiento?folio=${encodeURIComponent(receipt.folio ?? '')}`}
          className="btn btn--primary"
        >
          Dar seguimiento
        </Link>
        {onAcknowledge && (
          <button type="button" className="btn btn--ghost" onClick={onAcknowledge}>
            {acknowledgeLabel}
          </button>
        )}
      </div>
    </section>
  );
}
