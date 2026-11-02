import L from './clusterPlugin.js';
import { iconGeometry, markerSvg } from './markerIcons.js';

const cache = new Map();

// Own SVG icons (see markerIcons.js): Leaflet's default PNG icons are never used.
export function getIcon(variant) {
  if (!cache.has(variant)) {
    const { size, anchor } = iconGeometry(variant);
    cache.set(
      variant,
      L.divIcon({
        className: `map-pin map-pin--${variant}`,
        html: markerSvg(variant),
        iconSize: size,
        iconAnchor: anchor,
        popupAnchor: [0, -Math.round(anchor[1] * (anchor[1] > 20 ? 0.9 : 0.6))],
      }),
    );
  }
  return cache.get(variant);
}

export function clusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 38 : count < 100 ? 44 : 50;
  return L.divIcon({
    className: 'map-cluster',
    html: `<span>${count}</span>`,
    iconSize: [size, size],
  });
}
