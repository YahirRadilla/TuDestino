// Stand-in for the Leaflet map in tests that are about the screens around it (jsdom has no layout,
// so Leaflet itself is exercised in MapView.test.jsx). It exposes the MapView contract as DOM.
export default function FakeMapView({
  markers = [],
  center = null,
  userPosition = null,
  picked = null,
  onPick,
  onSelect,
  selectedId = null,
  offline = false,
  ariaLabel,
}) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      data-testid="map"
      data-center={center ? `${center.lat},${center.lng}` : ''}
      data-user={userPosition ? `${userPosition.lat},${userPosition.lng}` : ''}
      data-picked={picked ? `${picked.lat},${picked.lng}` : ''}
      data-selected={selectedId ?? ''}
      data-offline={String(offline)}
    >
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          data-testid="pin"
          data-variant={marker.variant}
          data-position={`${marker.position.lat},${marker.position.lng}`}
          onClick={() => onSelect?.(marker)}
        >
          pin {marker.title}
        </button>
      ))}
      {onPick && (
        <button type="button" onClick={() => onPick({ lat: 24.123456789, lng: -110.987654321 })}>
          tocar mapa
        </button>
      )}
    </div>
  );
}
