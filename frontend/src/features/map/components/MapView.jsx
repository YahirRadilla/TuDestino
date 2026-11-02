import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Marker, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from '../clusterPlugin.js';
import SafeMapContainer from './SafeMapContainer.jsx';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { clusterIcon, getIcon } from '../leafletIcons.js';
import { BCS_CENTER, DEFAULT_ZOOM } from '../geo.js';
import './map.css';

// The one component that knows Leaflet. Everything else talks to it through plain props, so a
// different provider only has to honour this contract:
//   markers      [{ id, variant, position: {lat, lng}, title, lines?, href?, linkLabel? }]
//   center/zoom  view to show; changing `center` moves the map there
//   fitKey       when it changes, the map frames all markers
//   selectedId   marker to focus and open
//   userPosition {lat, lng} of the visitor (own dot, not clustered)
//   picked       {lat, lng} of a point chosen by the visitor; onPick(point) when the map is tapped
//   onSelect(marker), ariaLabel, offline
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

const FOCUS_ZOOM = 14;
const toLatLng = (point) => [point.lat, point.lng];

function PinPopup({ marker }) {
  return (
    <div className="map-popup">
      <p className="map-popup__title">{marker.title}</p>
      {marker.lines?.map((line) => (
        <p key={line} className="map-popup__line">
          {line}
        </p>
      ))}
      {marker.href && (
        <Link to={marker.href} className="map-popup__link">
          {marker.linkLabel ?? 'Ver detalle'}
          <span className="sr-only">: {marker.title}</span>
        </Link>
      )}
    </div>
  );
}

// Markers live in a Leaflet MarkerClusterGroup (maintained plugin, see README); the popup is a
// single React-rendered one so its content can use the router.
function ClusterLayer({ markers, activeId, onActivate }) {
  const map = useMap();
  const groupRef = useRef(null);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  useEffect(() => {
    const group = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      maxClusterRadius: 45,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
    });
    map.addLayer(group);
    groupRef.current = group;

    // Cluster bubbles are created by the plugin (focusable by default): take them out of the tab
    // order too, so a page with many pins is not a long run of tab stops. The list is the route.
    const pane = map.getPane('markerPane');
    const dropTabStops = () =>
      pane
        ?.querySelectorAll('.leaflet-marker-icon[tabindex="0"]')
        .forEach((icon) => icon.setAttribute('tabindex', '-1'));
    const observer = new MutationObserver(dropTabStops);
    if (pane) observer.observe(pane, { childList: true });
    dropTabStops();

    return () => {
      observer.disconnect();
      // The map may already be gone when the whole screen unmounts (its own cleanup removes layers).
      if (map.hasLayer(group)) map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    group.addLayers(
      markers.map((marker) => {
        const layer = L.marker(toLatLng(marker.position), {
          icon: getIcon(marker.variant),
          // Not a tab stop: the list next to the map is the keyboard route to every pin.
          keyboard: false,
          title: marker.title,
          alt: '',
        });
        layer.on('click', () => onActivateRef.current(marker.id, { fly: false }));
        return layer;
      }),
    );
  }, [markers]);

  const active = markers.find((marker) => marker.id === activeId);
  if (!active) return null;
  return (
    <Popup
      key={active.id}
      position={toLatLng(active.position)}
      offset={[0, active.variant === 'destination' ? -34 : -8]}
      eventHandlers={{
        add: (event) =>
          event.target
            .getElement?.()
            ?.querySelector('.leaflet-popup-close-button')
            ?.setAttribute('aria-label', 'Cerrar'),
        remove: () => onActivateRef.current(null, active.id),
      }}
    >
      <PinPopup marker={active} />
    </Popup>
  );
}

// Keeps the camera in step with the props.
function Camera({ markers, center, zoom, fitKey, activeId, flyRequest }) {
  const map = useMap();
  const lastFit = useRef(null);

  useEffect(() => {
    if (!center) return;
    map.setView(toLatLng(center), zoom ?? Math.max(map.getZoom(), 12));
  }, [map, center?.lat, center?.lng, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fitKey === undefined || lastFit.current === fitKey || markers.length === 0) return;
    lastFit.current = fitKey;
    const bounds = L.latLngBounds(markers.map((marker) => toLatLng(marker.position)));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [map, markers, fitKey]);

  useEffect(() => {
    if (!flyRequest) return;
    const marker = markers.find((item) => item.id === activeId);
    if (marker) map.setView(toLatLng(marker.position), Math.max(map.getZoom(), FOCUS_ZOOM));
  }, [flyRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function PickHandler({ onPick }) {
  useMapEvents({ click: (event) => onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng }) });
  return null;
}

// Leaflet measures its container once: tell it when the layout around it changes size.
function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function MapView({
  markers = [],
  center,
  zoom,
  fitKey,
  selectedId = null,
  selectRequest = 0,
  userPosition = null,
  picked = null,
  onPick,
  onSelect,
  onPickMove,
  ariaLabel = 'Mapa',
  offline = false,
  className = '',
}) {
  const [activeId, setActiveId] = useState(null);
  const [flyRequest, setFlyRequest] = useState(0);
  const [tilesFailed, setTilesFailed] = useState(false);
  const markersById = useMemo(() => new Map(markers.map((marker) => [marker.id, marker])), [markers]);

  // An outside selection (a click on the list) opens the pin and moves the camera to it.
  useEffect(() => {
    if (!selectedId || !markersById.has(selectedId)) return;
    setActiveId(selectedId);
    setFlyRequest((n) => n + 1);
  }, [selectedId, selectRequest, markersById]);

  const activate = (id, closedId) => {
    if (id === null) {
      // Only the popup that closed may clear the selection (a replaced popup must not).
      setActiveId((current) => (current === closedId ? null : current));
      return;
    }
    setActiveId(id);
    const marker = id ? markersById.get(id) : null;
    if (marker) onSelect?.(marker);
  };

  const initial = center ?? BCS_CENTER;
  const tileEvents = useMemo(
    () => ({ tileerror: () => setTilesFailed(true), tileload: () => setTilesFailed(false) }),
    [],
  );
  const showOfflineNote = offline && tilesFailed;

  return (
    <div
      className={`map-view${showOfflineNote ? ' map-view--no-tiles' : ''}${className ? ` ${className}` : ''}`}
      role="region"
      aria-label={ariaLabel}
    >
      <SafeMapContainer
        center={toLatLng(initial)}
        zoom={zoom ?? DEFAULT_ZOOM}
        zoomControl={false}
        worldCopyJump
        className="map-view__canvas"
        minZoom={5}
      >
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          maxZoom={19}
          // CORS tiles: the service worker can cache them as readable (not opaque, not quota-padded)
          // responses. OSM serves Access-Control-Allow-Origin: *.
          crossOrigin
          eventHandlers={tileEvents}
        />
        <ZoomControl position="bottomright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
        <ResizeWatcher />
        <Camera
          markers={markers}
          center={center}
          zoom={zoom}
          fitKey={fitKey}
          activeId={activeId}
          flyRequest={flyRequest}
        />
        <ClusterLayer markers={markers} activeId={activeId} onActivate={activate} />
        {userPosition && (
          <Marker
            position={toLatLng(userPosition)}
            icon={getIcon('user')}
            interactive={false}
            keyboard={false}
          />
        )}
        {picked && (
          <Marker
            position={toLatLng(picked)}
            icon={getIcon('picker')}
            draggable={Boolean(onPickMove)}
            keyboard={false}
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = event.target.getLatLng();
                onPickMove?.({ lat, lng });
              },
            }}
          />
        )}
        {onPick && <PickHandler onPick={onPick} />}
      </SafeMapContainer>
      {showOfflineNote && (
        <p className="map-view__note" role="status">
          Sin conexión: mostrando solo los puntos guardados
        </p>
      )}
    </div>
  );
}
