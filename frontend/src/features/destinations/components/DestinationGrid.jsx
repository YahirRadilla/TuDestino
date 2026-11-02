import StateCard from '../../../shared/components/StateCard.jsx';
import DestinationCard from './DestinationCard.jsx';

export default function DestinationGrid({ destinations, emptyTitle = 'Sin resultados', emptyText }) {
  if (destinations.length === 0) {
    return (
      <StateCard icon="search" title={emptyTitle}>
        {emptyText}
      </StateCard>
    );
  }
  return (
    <div className="card-grid">
      {destinations.map((destination) => (
        <DestinationCard key={destination.id} destination={destination} />
      ))}
    </div>
  );
}
