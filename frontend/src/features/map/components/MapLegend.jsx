import { LEGEND_LABELS, markerSvg } from '../markerIcons.js';
import './map.css';

// Key to the pins; built from the same SVGs the map draws.
export default function MapLegend({ variants }) {
  return (
    <ul className="map-legend" aria-label="Leyenda del mapa">
      {variants.map((variant) => (
        <li key={variant}>
          <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markerSvg(variant) }} />
          {LEGEND_LABELS[variant]}
        </li>
      ))}
    </ul>
  );
}
