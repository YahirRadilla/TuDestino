import { Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import StateCard from './StateCard.jsx';

export default function ComingSoon({ title, icon, description }) {
  return (
    <div className="container page">
      <PageHeader title={title} />
      <StateCard
        icon={icon}
        title="Próximamente"
        action={
          <Link to="/" className="btn btn--primary">
            Volver al inicio
          </Link>
        }
      >
        {description}
      </StateCard>
    </div>
  );
}
