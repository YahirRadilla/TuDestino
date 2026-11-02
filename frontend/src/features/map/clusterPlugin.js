// leaflet.markercluster is a plain browser script that extends the global `L`. ES imports are
// evaluated in order, so the global is assigned in its own module BEFORE the plugin is loaded.
import './leafletGlobal.js';
import 'leaflet.markercluster';

export { default } from 'leaflet';
