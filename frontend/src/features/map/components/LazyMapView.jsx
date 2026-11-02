import { lazy, Suspense } from 'react';

// Leaflet and its plugins weigh far more than the rest of the app: the map chunk is only fetched
// when a screen that shows a map is opened (never part of the initial bundle).
const MapView = lazy(() => import('./MapView.jsx'));

export default function LazyMapView(props) {
  return (
    <Suspense
      fallback={
        <div className="map-view" role="status" aria-busy="true">
          <p className="map-view__note">Cargando el mapa…</p>
        </div>
      }
    >
      <MapView {...props} />
    </Suspense>
  );
}
