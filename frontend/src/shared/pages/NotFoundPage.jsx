import { Link } from 'react-router-dom';
import StateCard from '../components/StateCard.jsx';

export default function NotFoundPage() {
  return (
    <div className="container page">
      <StateCard
        icon="compass"
        title="Página no encontrada"
        action={
          <Link to="/" className="btn btn--primary">
            Ir al inicio
          </Link>
        }
      >
        La dirección que buscas no existe o cambió de lugar.
      </StateCard>
    </div>
  );
}
