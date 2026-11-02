import { useCallback, useMemo, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import DataNotice from '../../../shared/components/DataNotice.jsx';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import { useNearMe } from '../../../shared/hooks/useNearMe.js';
import { useOnlineStatus } from '../../../shared/hooks/useOnlineStatus.js';
import LazyMapView from '../components/LazyMapView.jsx';
import MapLegend from '../components/MapLegend.jsx';
import MapList from '../components/MapList.jsx';
import { sortByDistance } from '../geo.js';
import { useMapPins } from '../hooks/useMapPins.js';
import { filterMarkers, uniqueOptions } from '../mapModel.js';
import '../components/map.css';

export const NEAR_ME_PROBLEMS = {
  denied:
    'No diste permiso para usar tu ubicación. Puedes activarlo en tu navegador o seguir explorando el mapa.',
  unsupported: 'Este dispositivo no permite obtener la ubicación.',
  error: 'No pudimos obtener tu ubicación. Inténtalo de nuevo.',
};

const NEARBY_COUNT = 3;
const LEGEND = ['destination', 'report-contaminacion', 'report-animal-varado', 'report-other'];

export default function MapPage() {
  const result = useMapPins();
  const online = useOnlineStatus();
  const nearMe = useNearMe();
  const [layers, setLayers] = useState({ destinations: true, reports: true });
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [selection, setSelection] = useState({ id: null, n: 0 });

  const all = useMemo(
    () => (result.data ? [...result.data.destinations, ...result.data.reports] : []),
    [result.data],
  );
  const visible = useMemo(
    () => filterMarkers(all, { layers, category, type }),
    [all, layers, category, type],
  );
  const origin = nearMe.status === 'active' ? nearMe.coords : null;

  // With a known position the destinations come nearest first; reports stay after them.
  const listItems = useMemo(() => {
    if (!origin) return visible;
    const destinations = visible.filter((item) => item.kind === 'destination');
    const rest = visible.filter((item) => item.kind !== 'destination');
    return [...sortByDistance(destinations, origin), ...rest];
  }, [visible, origin]);
  const nearby = origin ? listItems.filter((item) => item.kind === 'destination').slice(0, NEARBY_COUNT) : [];

  const categories = useMemo(() => uniqueOptions(all, 'categorySlug', 'categoryName', 'destination'), [all]);
  const types = useMemo(() => uniqueOptions(all, 'typeSlug', 'typeName', 'report'), [all]);

  const select = useCallback(
    (marker) => setSelection((current) => ({ id: marker.id, n: current.n + 1 })),
    [],
  );
  const toggleLayer = (name) => setLayers((current) => ({ ...current, [name]: !current[name] }));
  const fitKey =
    result.status === 'ready' ? `${layers.destinations}|${layers.reports}|${category}|${type}` : undefined;
  const problem = NEAR_ME_PROBLEMS[nearMe.status];

  return (
    <div className="container page map-page">
      <PageHeader title="Mapa" />
      <p className="map-page__intro">
        Destinos de Baja California Sur y reportes ciudadanos ya resueltos. Los reportes se muestran de forma
        aproximada para proteger a las personas y a la fauna.
      </p>
      <DataNotice scope="map" source={result.source} reason={result.reason} syncedAt={result.syncedAt} />

      {result.status === 'error' ? (
        <ErrorState title="No pudimos cargar el mapa" onRetry={result.reload} />
      ) : (
        <div className="map-page__layout">
          <div className="map-page__stage">
            <LazyMapView
              markers={visible}
              center={origin}
              fitKey={fitKey}
              selectedId={selection.id}
              selectRequest={selection.n}
              userPosition={origin}
              onSelect={select}
              offline={!online}
              ariaLabel="Mapa de destinos y reportes. Hay una lista equivalente junto al mapa."
            />
          </div>

          <div className="map-page__panel">
            <a href="#map-list" className="btn btn--ghost map-skip">
              Ir a la lista de lugares
            </a>
            <div className="map-toolbar">
              <fieldset>
                <legend>Capas</legend>
                <div className="map-toolbar__row">
                  <label className="map-check">
                    <input
                      type="checkbox"
                      checked={layers.destinations}
                      onChange={() => toggleLayer('destinations')}
                    />
                    Destinos
                  </label>
                  <label className="map-check">
                    <input type="checkbox" checked={layers.reports} onChange={() => toggleLayer('reports')} />
                    Reportes resueltos
                  </label>
                </div>
              </fieldset>
              <div className="map-toolbar__row">
                <div className="field">
                  <label htmlFor="map-category" className="field__label">
                    Categoría de destino
                  </label>
                  <select
                    id="map-category"
                    className="field__input field__select"
                    value={category}
                    disabled={!layers.destinations}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    <option value="">Todas</option>
                    {categories.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="map-type" className="field__label">
                    Tipo de reporte
                  </label>
                  <select
                    id="map-type"
                    className="field__input field__select"
                    value={type}
                    disabled={!layers.reports}
                    onChange={(event) => setType(event.target.value)}
                  >
                    <option value="">Todos</option>
                    {types.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="map-toolbar__row">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={origin ? nearMe.clear : nearMe.request}
                  disabled={nearMe.status === 'locating'}
                  aria-pressed={Boolean(origin)}
                >
                  <Icon name="navigation" size={18} />
                  {nearMe.status === 'locating'
                    ? 'Ubicando…'
                    : origin
                      ? 'Quitar mi ubicación'
                      : 'Mi ubicación'}
                </button>
              </div>
              {problem && (
                <p className="field__error" role="alert">
                  {problem}
                </p>
              )}
              <MapLegend variants={LEGEND} />
            </div>

            {nearby.length > 0 && (
              <section className="map-near" aria-label="Destinos cercanos">
                <h3>Cerca de ti</h3>
                <ul>
                  {nearby.map((item) => (
                    <li key={item.id}>
                      {item.title} · {Math.round(item.distanceKm * 10) / 10} km
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.status === 'loading' && (
              <p className="muted" role="status">
                Cargando los puntos del mapa…
              </p>
            )}
            {result.status === 'ready' && result.data.truncated && (
              <p className="muted">Hay más puntos de los que se muestran.</p>
            )}
            {result.status === 'ready' && (
              <MapList items={listItems} selectedId={selection.id} onSelect={select} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
