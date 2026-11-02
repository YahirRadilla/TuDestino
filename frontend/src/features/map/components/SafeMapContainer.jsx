import { useEffect, useRef, useState } from 'react';
import { Map as LeafletMap } from 'leaflet';
import { LeafletProvider, createLeafletContext } from '@react-leaflet/core';

/**
 * Replacement for react-leaflet's MapContainer.
 *
 * MapContainer creates the map in a ref callback. When React hides a Suspense tree that is still
 * mounted (e.g. the next page is still loading and the person goes back) and reveals it again, it
 * detaches and re-attaches refs, and MapContainer then builds a SECOND map on the same element:
 * "Map container is already initialized" and a blank screen. Passive effects are not re-run on
 * reveal, so creating and destroying the map in an effect is safe. The context, hooks (`useMap`)
 * and layer components of react-leaflet keep working unchanged.
 */
export default function SafeMapContainer({ children, className, style, center, zoom, ...options }) {
  const nodeRef = useRef(null);
  const [context, setContext] = useState(null);

  useEffect(() => {
    const map = new LeafletMap(nodeRef.current, { center, zoom, ...options });
    setContext(createLeafletContext(map));
    return () => {
      // Leaflet 1.9 leaves a timer that finishes a zoom animation 250 ms later; if the map is
      // removed in between, it reads a pane that no longer exists and throws. Cancel that step.
      map.stop();
      if ('_animatingZoom' in map) map._animatingZoom = false;
      map.remove();
      setContext(null);
    };
    // The map is created once; later changes go through the camera component.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={nodeRef} className={className} style={style}>
      {context ? <LeafletProvider value={context}>{children}</LeafletProvider> : null}
    </div>
  );
}
