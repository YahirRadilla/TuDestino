import { Link } from 'react-router-dom';
import { formatDistance } from '../geo.js';
import { markerSvg } from '../markerIcons.js';
import './map.css';

export const MAX_LIST_ITEMS = 100;

// Text alternative to the map (same pins, same actions) for screen readers, keyboard users and
// anyone who cannot use a map. The SVG comes from our own constants, never from user data.
export default function MapList({
  id = 'map-list',
  items,
  selectedId,
  onSelect,
  label = 'Lugares en el mapa',
}) {
  const shown = items.slice(0, MAX_LIST_ITEMS);
  return (
    <section id={id} aria-label={label} tabIndex={-1}>
      <p className="muted" role="status">
        {items.length === 1 ? '1 lugar' : `${items.length} lugares`}
        {items.length > shown.length && ` (se muestran los primeros ${shown.length})`}
      </p>
      <ul className="map-list">
        {shown.map((item) => (
          <li
            key={item.id}
            className="map-list__item"
            aria-current={item.id === selectedId ? 'true' : undefined}
          >
            <span
              className="map-list__icon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: markerSvg(item.variant) }}
            />
            <div>
              <p className="map-list__title">{item.title}</p>
              {item.lines?.map((line) => (
                <p key={line} className="map-list__meta">
                  {line}
                </p>
              ))}
              {item.distanceKm != null && (
                <p className="map-list__meta">A {formatDistance(item.distanceKm)} de ti</p>
              )}
            </div>
            <div className="map-list__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onSelect(item)}
                aria-label={`Ver ${item.title} en el mapa`}
              >
                En el mapa
              </button>
              {item.href && (
                <Link
                  to={item.href}
                  className="btn btn--ghost"
                  aria-label={`${item.linkLabel ?? 'Ver detalle'}: ${item.title}`}
                >
                  {item.linkLabel ?? 'Ver detalle'}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
