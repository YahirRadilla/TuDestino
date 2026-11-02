import { formatSyncTime } from '../utils/dates.js';

const FALLBACK_MESSAGES = {
  offline: 'Sin conexión: mostramos destinos de ejemplo guardados en la app.',
  unreachable: 'No pudimos contactar al servidor: mostramos destinos de ejemplo guardados en la app.',
};

const CACHE_MESSAGES = {
  offline: 'Sin conexión · mostrando datos guardados',
  unreachable: 'Servidor no disponible · mostrando datos guardados',
};

// The map keeps destination points on the device; report pins are public aggregates that are not mirrored.
const MAP_FALLBACK_MESSAGES = {
  offline:
    'Sin conexión: mostrando solo los puntos guardados (destinos de ejemplo). Los reportes no están disponibles.',
  unreachable: 'No pudimos contactar al servidor: mostrando solo los puntos guardados (destinos de ejemplo).',
};
const MAP_CACHE_MESSAGES = {
  offline: 'Sin conexión: mostrando solo los puntos guardados. Los reportes no están disponibles.',
  unreachable: 'Servidor no disponible: mostrando solo los puntos guardados.',
};

/**
 * Discreet notice shown when content does not come straight from the API.
 * source 'cache' = the copy saved on this device (with the time it was last refreshed);
 * source 'fallback' = the sample data bundled with the app. scope="map" words it for map points.
 */
export default function DataNotice({ source, reason, syncedAt, scope }) {
  if (source !== 'cache' && source !== 'fallback') return null;
  const key = reason === 'offline' ? 'offline' : 'unreachable';
  if (source === 'fallback') {
    return (
      <p className="data-notice" role="status">
        {(scope === 'map' ? MAP_FALLBACK_MESSAGES : FALLBACK_MESSAGES)[key]}
      </p>
    );
  }
  const synced = syncedAt ? formatSyncTime(syncedAt) : '';
  return (
    <p className="data-notice" role="status">
      {(scope === 'map' ? MAP_CACHE_MESSAGES : CACHE_MESSAGES)[key]}
      {synced && <span className="data-notice__time"> · Última sincronización: {synced}</span>}
    </p>
  );
}
