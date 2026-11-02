import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { adminErrorMessage } from '../../admin/adminErrors.js';
import { proposeEvent } from '../api/eventsApi.js';
import EventForm from '../components/EventForm.jsx';

// RF20 / D-01: anyone with an account can propose an event; staff review it before it is public.
export default function ProposeEventPage() {
  const [sent, setSent] = useState(null);
  // Remounting the form clears it when the person wants to propose another one.
  const [round, setRound] = useState(0);

  const submit = async (payload) => {
    try {
      setSent(await proposeEvent(payload));
    } catch (error) {
      throw new Error(adminErrorMessage(error, 'No pudimos enviar tu propuesta. Inténtalo de nuevo.'));
    }
  };

  return (
    <div className="container page">
      <PageHeader title="Proponer un evento" />
      {sent ? (
        <StateCard
          icon="check"
          title="¡Gracias! Recibimos tu propuesta"
          action={
            <div className="form__actions">
              <Link to="/perfil/propuestas" className="btn btn--primary">
                Ver mis propuestas
              </Link>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setSent(null);
                  setRound((n) => n + 1);
                }}
              >
                Proponer otro
              </button>
            </div>
          }
        >
          “{sent.title}” queda pendiente de revisión. Cuando una autoridad la apruebe, aparecerá en la lista
          de eventos.
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
            submitLabel="Enviar propuesta"
            busyLabel="Enviando…"
            onSubmit={submit}
          />
        </div>
      )}
    </div>
  );
}
