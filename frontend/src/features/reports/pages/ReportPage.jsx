import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import PendingLink from '../components/PendingLink.jsx';
import ReceiptCard from '../components/ReceiptCard.jsx';
import ReportForm from '../components/ReportForm.jsx';

// /reportar: the form, then either the receipt (sent) or the "saved, will be sent" notice (queued).
export default function ReportPage() {
  const [result, setResult] = useState(null);
  // Bumping the key remounts the form with a fresh draft and a new client_uuid.
  const [formKey, setFormKey] = useState(0);
  const another = () => {
    setResult(null);
    setFormKey((key) => key + 1);
  };

  return (
    <div className="container page report">
      <PageHeader title="Reportar" action={<PendingLink />} />

      {result?.phase === 'sent' && (
        <>
          <StateCard icon="check" title="Reporte enviado">
            Gracias por cuidar el destino. Las autoridades lo revisarán.
          </StateCard>
          <ReceiptCard
            receipt={result.receipt}
            onAcknowledge={another}
            acknowledgeLabel="Hacer otro reporte"
          />
        </>
      )}

      {result?.phase === 'queued' && (
        <>
          <StateCard icon="wifiOff" title="Guardado en tu dispositivo">
            Se enviará cuando haya conexión
            {result.syncRegistered
              ? ', incluso con la app cerrada.'
              : '. Abre la app con señal y lo enviaremos, o usa «Reintentar ahora».'}
          </StateCard>
          <div className="receipt__actions">
            <Link to="/reportar/pendientes" className="btn btn--primary">
              Ver pendientes de envío
            </Link>
            <button type="button" className="btn btn--ghost" onClick={another}>
              Hacer otro reporte
            </button>
          </div>
        </>
      )}

      {!result && (
        <>
          <p className="muted report__intro">
            Avisa de fauna marina, contaminación o actividad sospechosa. Funciona sin conexión.
          </p>
          <ReportForm key={formKey} onDone={setResult} />
          <p className="muted report__aside">
            ¿Ya enviaste uno? <Link to="/seguimiento">Consulta su estado</Link>.
          </p>
        </>
      )}
    </div>
  );
}
