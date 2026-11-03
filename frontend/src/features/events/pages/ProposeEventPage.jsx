import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import EventForm from '../components/EventForm.jsx';
import { submitEventProposal } from '../submitProposal.js';

// RF20 / D-01: anyone with an account can propose an event; staff review it before it is public.
// The proposal is queued on the device first, so the form works without a connection.
export default function ProposeEventPage() {
  const [sent, setSent] = useState(null);
  // Remounting the form clears it when the person wants to propose another one.
  const [round, setRound] = useState(0);
  const [clientUuid, setClientUuid] = useState(() => crypto.randomUUID());

  const submit = async (payload, { imageFile }) => {
    const result = await submitEventProposal({ clientUuid, payload, imageFile });
    if (result.phase === 'failed' || result.phase === 'error') {
      throw new Error(result.reason);
    }
    setSent({ ...result, title: payload.title });
  };

  const reset = () => {
    setSent(null);
    setRound((n) => n + 1);
    setClientUuid(crypto.randomUUID());
  };

  return (
    <div className="container page">
      <PageHeader title="Proponer un evento" />
      {sent ? (
        <StateCard
          icon={sent.phase === 'queued' ? 'wifiOff' : 'check'}
          title={
            sent.phase === 'queued'
              ? 'Propuesta guardada en este dispositivo'
              : '¡Gracias! Recibimos tu propuesta'
          }
          action={
            <div className="form__actions">
              <Link to="/perfil/propuestas" className="btn btn--primary">
                Ver mis propuestas
              </Link>
              <button type="button" className="btn btn--ghost" onClick={reset}>
                Proponer otro
              </button>
            </div>
          }
        >
          {sent.phase === 'queued'
            ? `“${sent.title}” se enviará automáticamente cuando recuperes conexión. Mientras tanto queda guardada en este dispositivo.`
            : `“${sent.title}” queda pendiente de revisión. Cuando una autoridad la apruebe, aparecerá en la lista de eventos.`}
        </StateCard>
      ) : (
        <div className="auth__card">
          <p className="muted">
            Limpiezas de playa, jornadas de reforestación o pláticas: cuéntanos qué quieres organizar. Una
            autoridad lo revisará antes de publicarlo.
          </p>
          <EventForm
            key={round}
            idPrefix="proposal"
            showMap
            deferImage
            submitLabel="Enviar propuesta"
            busyLabel="Enviando…"
            onSubmit={submit}
          />
        </div>
      )}
    </div>
  );
}
