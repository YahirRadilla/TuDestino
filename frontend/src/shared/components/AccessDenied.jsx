import { Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import StateCard from './StateCard.jsx';

export default function AccessDenied() {
  return (
    <div className="container page">
      <PageHeader title="Acceso denegado" />
      <StateCard
        icon="shield"
        title="No tienes permiso para ver esta sección"
        action={
          <Link to="/" className="btn btn--primary">
            Volver al inicio
          </Link>
        }
      >
        Este panel es solo para autoridades y administradores. Si crees que es un error, contacta al equipo de
        TuDestino.
      </StateCard>
    </div>
  );
}
