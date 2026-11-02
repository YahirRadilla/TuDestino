import { useCallback, useMemo } from 'react';
import { isValidCoordinate } from '../geo.js';
import LazyMapView from './LazyMapView.jsx';
import './map.css';

const round5 = (value) => Math.round(value * 100_000) / 100_000; // ~1 m

/**
 * Pick a point by tapping (or dragging the pin on) the map. Reusable: the host owns the value and
 * keeps its own numeric fields, which are the keyboard/screen-reader route to the same data.
 *   value     { lat, lng } as numbers or numeric strings; anything invalid means "no point yet"
 *   onChange  ({ lat, lng }) with numbers rounded to ~1 m
 */
export default function LocationPicker({
  value,
  onChange,
  label = 'Mapa para elegir la ubicación',
  hint = 'Toca el mapa para marcar el punto o arrastra el pin. También puedes escribir las coordenadas.',
}) {
  const point = useMemo(
    () => (isValidCoordinate(value) ? { lat: Number(value.lat), lng: Number(value.lng) } : null),
    [value?.lat, value?.lng], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pick = useCallback(({ lat, lng }) => onChange({ lat: round5(lat), lng: round5(lng) }), [onChange]);

  return (
    <div className="map-picker">
      <div className="map-picker__stage">
        <LazyMapView
          picked={point}
          center={point}
          zoom={point ? 14 : undefined}
          onPick={pick}
          onPickMove={pick}
          ariaLabel={label}
        />
      </div>
      <p className="map-picker__hint">{hint}</p>
    </div>
  );
}
