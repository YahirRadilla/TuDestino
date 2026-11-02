import { useMemo } from 'react';
import LazyMapView from './LazyMapView.jsx';
import './map.css';

// Read-only map with one pin (e.g. the exact position of a report in the staff panel).
export default function MiniMap({ marker, label = 'Mapa de la ubicación' }) {
  const markers = useMemo(
    () => [marker],
    [marker.id, marker.variant, marker.position.lat, marker.position.lng], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <div className="map-mini">
      <LazyMapView markers={markers} center={marker.position} zoom={15} selectedId={null} ariaLabel={label} />
    </div>
  );
}
