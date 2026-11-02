import { useCallback, useMemo, useRef, useState } from 'react';
import { SelectField } from '../../../shared/components/FieldControls.jsx';
import { REPORT_STATUS_LABELS } from '../../admin/adminLabels.js';
import { AdminError, AdminLoading } from '../../admin/components/AdminStates.jsx';
import { REPORT_TYPES } from '../../reports/reportTypes.js';
import LazyMapView from '../components/LazyMapView.jsx';
import MapLegend from '../components/MapLegend.jsx';
import MapList from '../components/MapList.jsx';
import { useAdminMapPins } from '../hooks/useMapPins.js';
import '../components/map.css';

const STATUS_OPTIONS = Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const TYPE_OPTIONS = REPORT_TYPES.map((type) => ({ value: type.slug, label: type.name }));
const LEGEND = ['status-pending', 'status-in_review', 'status-resolved', 'status-dismissed'];
const NO_MARKERS = [];

// Staff map: every report with its EXACT position (the public map only shows rounded ones).
export default function AdminMapPage() {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const result = useAdminMapPins({ status, type });
  const [selection, setSelection] = useState({ id: null, n: 0 });
  // While a new filter loads, keep showing the previous pins instead of tearing the map down.
  const lastMarkers = useRef(NO_MARKERS);
  const markers = useMemo(() => {
    if (result.status === 'ready') lastMarkers.current = result.data.reports;
    return lastMarkers.current;
  }, [result.status, result.data]);
  const select = useCallback(
    (marker) => setSelection((current) => ({ id: marker.id, n: current.n + 1 })),
    [],
  );

  return (
    <div className="admin-section map-admin">
      <h2 className="admin__heading">Mapa de reportes</h2>
      <p className="muted">
        Ubicación exacta de cada reporte. Esta información es solo para el personal autorizado: no compartas
        capturas del mapa.
      </p>
      <div className="form__row">
        <SelectField
          id="admin-map-status"
          label="Estado"
          placeholder="Todos"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(event) => setStatus(event.target.value)}
        />
        <SelectField
          id="admin-map-type"
          label="Tipo"
          placeholder="Todos"
          value={type}
          options={TYPE_OPTIONS}
          onChange={(event) => setType(event.target.value)}
        />
      </div>
      <MapLegend variants={LEGEND} />

      {result.status === 'error' && <AdminError error={result.error} onRetry={result.reload} />}
      {result.status === 'loading' && <AdminLoading label="Cargando el mapa de reportes…" />}
      {result.status !== 'error' && (
        <>
          <div className="map-page__stage map-admin__stage">
            <LazyMapView
              markers={markers}
              fitKey={result.status === 'ready' ? `${status}|${type}` : undefined}
              selectedId={selection.id}
              selectRequest={selection.n}
              onSelect={select}
              ariaLabel="Mapa de reportes con ubicación exacta. Hay una lista equivalente debajo."
            />
          </div>
          {result.status === 'ready' && result.data.truncated && (
            <p className="muted">Hay más reportes de los que se muestran. Filtra por estado o tipo.</p>
          )}
          {result.status === 'ready' && markers.length === 0 && (
            <p className="muted" role="status">
              No hay reportes con esos filtros.
            </p>
          )}
          {markers.length > 0 && (
            <MapList
              id="admin-map-list"
              label="Reportes en el mapa"
              items={markers}
              selectedId={selection.id}
              onSelect={select}
            />
          )}
        </>
      )}
    </div>
  );
}
