/**
 * mapService.js
 * Encapsula toda la interaccion con Leaflet de forma imperativa. El resto de
 * la app nunca toca la instancia del mapa directamente: solo llama estos
 * metodos. Esto evita el acoplamiento y los problemas de reconciliacion.
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

import { STATUS, getFeatureId } from './dataProcessing.js';
import { getLat, getLon, normalizeCode } from '../utils/helpers.js';

let map = null;
let geoLayer = null; // capa de recintos (GeoJSON)
let pointsLayer = null; // capa de puntos de ubicacion (coordenadas del recinto)
let propuestasLayer = null; // capa de recintos candidatos (v1.4c)
let linksLayer = null; // lineas propuesta -> recintos que descongestiona
let drawnLayer = null; // ultimo poligono dibujado (Fase 4)
let currentKeyColumn = null;
let currentResults = null; // ultimo resultado del calculo (para recolorear)
let onDrawEnd = null; // callback (geojsonPolygon) => void
let onFeatureSelect = null; // callback (id) => void al seleccionar un recinto
let onPropuestaSelect = null; // callback (propuestaId) => void
let resultsHostRef = null; // contenedor de tarjetas del panel (enlace Mapa -> Tabla)
let pointRenderer = null; // renderer SVG dedicado para los puntos de ubicacion

// Colores por estado de propuesta.
const PROP_COLOR = {
  propuesto: '#64748b',
  en_evaluacion: '#eab308',
  aprobado: '#7c3aed',
  descartado: '#cbd5e1',
};

/** Inicializa el mapa base sobre un contenedor. */
export function initMap(containerId = 'map') {
  if (map) return map;

  map = L.map(containerId, {
    center: [-33.45, -70.66], // Santiago, CL como vista inicial neutral
    zoom: 5,
    zoomControl: true,
    preferCanvas: true, // mejor rendimiento con muchos poligonos
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  // Renderer SVG para los puntos (los polígonos usan canvas por rendimiento).
  pointRenderer = L.svg();

  initDrawTools();
  return map;
}

export function getMap() {
  return map;
}

/**
 * Renderiza (o re-renderiza) los recintos filtrados en el mapa.
 * @param {Array} features
 * @param {string} keyColumn llave primaria para popups/estilos
 */
export function renderFeatures(features, keyColumn) {
  if (!map) return;
  currentKeyColumn = keyColumn;

  if (geoLayer) {
    geoLayer.remove();
    geoLayer = null;
  }
  if (!features || !features.length) return;

  const fc = { type: 'FeatureCollection', features };

  geoLayer = L.geoJSON(fc, {
    style: () => baseStyle(),
    onEachFeature: (feature, layer) => {
      const id = getFeatureId(feature, keyColumn);
      layer.__recintoId = id;
      layer.bindPopup(buildPopup(feature, keyColumn));
      // Enlace Mapa -> Tabla + apertura de la ficha del recinto.
      layer.on('click', () => {
        scrollToCard(id);
        if (typeof onFeatureSelect === 'function') onFeatureSelect(id);
      });
    },
  }).addTo(map);

  renderPoints(features, keyColumn);

  fitToLayer();
}

/**
 * Dibuja un punto (circleMarker) en la coordenada real de cada recinto, para
 * verificar su ubicación. Se colorea luego según el estado del cálculo.
 */
export function renderPoints(features, keyColumn) {
  if (!map) return;
  if (pointsLayer) {
    pointsLayer.remove();
    pointsLayer = null;
  }
  const markers = [];
  for (const f of features || []) {
    const lat = getLat(f.properties);
    const lon = getLon(f.properties);
    if (lat === null || lon === null) continue; // sin coordenada -> se omite
    const id = getFeatureId(f, keyColumn);
    const m = L.circleMarker([lat, lon], { ...pointStyle('sinDato'), renderer: pointRenderer });
    m.__recintoId = id;
    m.bindTooltip(String(id ?? ''), { direction: 'top' });
    m.on('click', () => {
      scrollToCard(id);
      if (typeof onFeatureSelect === 'function') onFeatureSelect(id);
    });
    markers.push(m);
  }
  if (markers.length) {
    pointsLayer = L.layerGroup(markers).addTo(map);
  }
}

/** Registra el contenedor de tarjetas para el enlace Mapa -> Tabla. */
export function setResultsHost(node) {
  resultsHostRef = node;
}

/** Registra el callback que abre la ficha del recinto al seleccionarlo. */
export function setOnFeatureSelect(cb) {
  onFeatureSelect = cb;
}

// ---------------------------------------------------------------------------
// Propuestas de nuevos recintos (v1.4c)
// ---------------------------------------------------------------------------

export function setOnPropuestaSelect(cb) {
  onPropuestaSelect = cb;
}

/** Dibuja las propuestas como rombos coloreados por estado. */
export function renderPropuestas(propuestas) {
  if (!map) return;
  if (propuestasLayer) { propuestasLayer.remove(); propuestasLayer = null; }
  clearPropuestaLinks();
  const markers = [];
  for (const p of propuestas || []) {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue; // sin coord -> se omite
    const color = PROP_COLOR[p.estado] || PROP_COLOR.propuesto;
    const icon = L.divIcon({
      className: 'prop-divicon',
      html: `<div class="prop-marker" style="background:${color}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    const m = L.marker([lat, lon], { icon });
    m.__propuestaId = p.id;
    m.bindTooltip(`${p.nombre} (${p.capacidad_mesas ?? '?'} mesas)`, { direction: 'top' });
    m.on('click', () => {
      if (typeof onPropuestaSelect === 'function') onPropuestaSelect(p.id);
    });
    markers.push(m);
  }
  if (markers.length) propuestasLayer = L.layerGroup(markers).addTo(map);
}

/**
 * Dibuja líneas desde una propuesta hacia los recintos que descongestiona y
 * centra la vista en ese conjunto.
 */
export function highlightPropuestaLinks(propuesta) {
  clearPropuestaLinks();
  if (!map || !propuesta) return;
  const lat = Number(propuesta.lat);
  const lon = Number(propuesta.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const from = L.latLng(lat, lon);
  const lines = [];
  const pts = [from];
  const alivio = Array.isArray(propuesta.alivio) ? propuesta.alivio : [];
  for (const a of alivio) {
    const center = recintoCenter(a.cod);
    if (!center) continue;
    lines.push(L.polyline([from, center], {
      color: '#7c3aed', weight: 2, dashArray: '5 5', opacity: 0.9,
    }));
    pts.push(center);
  }
  lines.push(L.circleMarker(from, { radius: 7, color: '#7c3aed', weight: 2, fillColor: '#7c3aed', fillOpacity: 0.4 }));
  linksLayer = L.layerGroup(lines).addTo(map);
  try {
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14 });
    else map.flyTo(from, Math.max(map.getZoom(), 13), { duration: 0.5 });
  } catch { /* noop */ }
}

export function clearPropuestaLinks() {
  if (linksLayer) { linksLayer.remove(); linksLayer = null; }
}

/** Centro aproximado del recinto cuyo código (tolerante a ceros) coincide. */
function recintoCenter(cod) {
  if (!geoLayer) return null;
  const target = normalizeCode(cod);
  let center = null;
  geoLayer.eachLayer((layer) => {
    if (center) return;
    if (normalizeCode(layer.__recintoId) === target) {
      try {
        center = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();
      } catch { center = null; }
    }
  });
  return center;
}

/**
 * Enlace Tabla -> Mapa: centra el mapa en el recinto indicado (flyToBounds /
 * flyTo) y abre su popup automaticamente.
 */
export function focusFeature(id) {
  if (!map || !geoLayer || id === null || id === undefined) return;
  let target = null;
  geoLayer.eachLayer((layer) => {
    if (String(layer.__recintoId) === String(id)) target = layer;
  });
  if (!target) return;
  try {
    if (typeof target.getBounds === 'function') {
      const b = target.getBounds();
      if (b.isValid()) map.flyToBounds(b, { padding: [60, 60], maxZoom: 16, duration: 0.6 });
    } else if (typeof target.getLatLng === 'function') {
      map.flyTo(target.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
  } catch {
    /* omitir silenciosamente geometrias invalidas */
  }
  target.openPopup();
}

/** Enlace Mapa -> Tabla: desplaza y resalta la tarjeta del recinto. */
function scrollToCard(id) {
  if (!resultsHostRef || id === null || id === undefined) return;
  const safe = String(id).replace(/"/g, '\\"');
  const card = resultsHostRef.querySelector(`[data-recinto-id="${safe}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('card-flash');
  setTimeout(() => card.classList.remove('card-flash'), 1600);
}

/**
 * Filtrado de visibilidad del mapa (Fase 2). Deja visibles solo los recintos
 * cuyos ids se pasan, atenua fuertemente el resto y hace fitBounds a la
 * seleccion. Con `ids` nulo o vacio, restaura todos con su color por estado.
 */
export function filterMapVisibility(ids) {
  if (!map || !geoLayer) return;
  const set = ids && ids.length ? new Set(ids.map(String)) : null;
  const selected = [];

  geoLayer.eachLayer((layer) => {
    const id = layer.__recintoId;
    if (!set) {
      // Sin filtro: color por estado y visibilidad plena.
      const r = currentResults?.[id];
      layer.setStyle(styleForStatus(r?.status || 'sinDato'));
    } else if (set.has(String(id))) {
      const r = currentResults?.[id];
      layer.setStyle(styleForStatus(r?.status || 'sinDato'));
      selected.push(layer);
    } else {
      // Fuera del filtro: atenuado casi transparente.
      layer.setStyle({
        color: '#94a3b8', weight: 1, opacity: 0.12,
        fillColor: '#94a3b8', fillOpacity: 0.04,
      });
    }
  });

  // Espeja la visibilidad en la capa de puntos.
  if (pointsLayer) {
    pointsLayer.eachLayer((m) => {
      const id = m.__recintoId;
      if (!set) {
        m.setStyle(pointStyle(currentResults?.[id]?.status || 'sinDato'));
      } else if (set.has(String(id))) {
        m.setStyle(pointStyle(currentResults?.[id]?.status || 'sinDato'));
      } else {
        m.setStyle({ opacity: 0.1, fillOpacity: 0.05 });
      }
    });
  }

  if (set) {
    if (selected.length) {
      try {
        const b = L.featureGroup(selected).getBounds();
        if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
      } catch {
        /* noop */
      }
    }
  } else {
    fitToLayer();
  }
}

/** Ajusta el zoom a la extension de los recintos (fitBounds). */
export function fitToLayer() {
  if (!map || !geoLayer) return;
  try {
    const b = geoLayer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
  } catch {
    /* omitir silenciosamente si la geometria es invalida */
  }
}

/**
 * Repinta cada recinto segun el resultado del calculo.
 * @param {Object} results featureId -> { value, status }
 */
export function applyResultStyles(results) {
  if (!geoLayer) return;
  currentResults = results; // memoriza para el filtrado de visibilidad
  geoLayer.eachLayer((layer) => {
    const id = layer.__recintoId;
    const r = id != null ? results[id] : null;
    const status = r?.status || 'sinDato';
    layer.setStyle(styleForStatus(status));
    // Actualiza el popup con el valor calculado.
    if (layer.getPopup()) {
      layer.setPopupContent(buildPopup(layer.feature, currentKeyColumn, r));
    }
  });
  // Recolorea los puntos de ubicación según el estado.
  if (pointsLayer) {
    pointsLayer.eachLayer((m) => {
      const id = m.__recintoId;
      m.setStyle(pointStyle((id != null && results[id]?.status) || 'sinDato'));
    });
  }
}

/** Estilo del punto de ubicación según el estado. */
function pointStyle(status) {
  const c = STATUS[status]?.color || STATUS.sinDato.color;
  return {
    radius: 5,
    color: '#ffffff',
    weight: 1.5,
    opacity: 1,
    fillColor: c,
    fillOpacity: 1,
  };
}

/** Resalta un subconjunto de recintos (seleccion espacial) y atenua el resto. */
export function highlightSelection(ids) {
  if (!geoLayer) return;
  const set = new Set(ids);
  geoLayer.eachLayer((layer) => {
    const selected = set.has(layer.__recintoId);
    if (!ids.length) {
      layer.setStyle({ opacity: 1, fillOpacity: 0.55, weight: 1 });
    } else if (selected) {
      layer.setStyle({
        color: STATUS.neutral.color,
        weight: 3,
        opacity: 1,
        fillOpacity: 0.7,
      });
    } else {
      layer.setStyle({ opacity: 0.25, fillOpacity: 0.12, weight: 1 });
    }
  });
}

/** Limpia el resaltado de seleccion, volviendo al estilo por resultado. */
export function clearHighlight(results) {
  if (results) applyResultStyles(results);
  else if (geoLayer) geoLayer.eachLayer((l) => l.setStyle(baseStyle()));
}

// ---------------------------------------------------------------------------
// Herramientas de dibujo (Leaflet-Geoman) — Fase 4
// ---------------------------------------------------------------------------

function initDrawTools() {
  map.pm.addControls({
    position: 'topleft',
    drawMarker: false,
    drawCircleMarker: false,
    drawPolyline: false,
    drawText: false,
    drawCircle: false,
    cutPolygon: false,
    rotateMode: false,
    drawRectangle: true,
    drawPolygon: true,
    editMode: true,
    dragMode: false,
    removalMode: true,
  });
  map.pm.setLang('es');

  map.on('pm:create', (e) => {
    // Solo mantenemos un poligono de seleccion a la vez.
    if (drawnLayer) {
      try {
        drawnLayer.remove();
      } catch {
        /* noop */
      }
    }
    drawnLayer = e.layer;
    styleDrawn(drawnLayer);
    emitDraw();

    // Recalcular cuando el usuario edite el poligono.
    drawnLayer.on('pm:edit', emitDraw);
    drawnLayer.on('pm:dragend', emitDraw);
  });

  map.on('pm:remove', () => {
    drawnLayer = null;
    if (typeof onDrawEnd === 'function') onDrawEnd(null);
  });
}

function styleDrawn(layer) {
  if (layer.setStyle) {
    layer.setStyle({
      color: STATUS.neutral.color,
      weight: 2,
      dashArray: '6 4',
      fillColor: STATUS.neutral.color,
      fillOpacity: 0.08,
    });
  }
}

function emitDraw() {
  if (!drawnLayer || typeof onDrawEnd !== 'function') return;
  try {
    const gj = drawnLayer.toGeoJSON();
    onDrawEnd(gj);
  } catch {
    onDrawEnd(null);
  }
}

/** Registra el callback que recibe el poligono dibujado (GeoJSON). */
export function setOnDrawEnd(cb) {
  onDrawEnd = cb;
}

/** Elimina el poligono de dibujo actual. */
export function clearDrawn() {
  if (drawnLayer) {
    try {
      drawnLayer.remove();
    } catch {
      /* noop */
    }
    drawnLayer = null;
  }
}

// ---------------------------------------------------------------------------
// Estilos y popups
// ---------------------------------------------------------------------------

function baseStyle() {
  return {
    color: '#64748b',
    weight: 1,
    opacity: 1,
    fillColor: '#94a3b8',
    fillOpacity: 0.35,
  };
}

function styleForStatus(status) {
  const c = STATUS[status]?.color || STATUS.sinDato.color;
  return {
    color: c,
    weight: 1.2,
    opacity: 1,
    fillColor: c,
    fillOpacity: 0.55,
  };
}

function buildPopup(feature, keyColumn, result) {
  const id = getFeatureId(feature, keyColumn);
  let html = `<div class="popup"><strong>${keyColumn || 'ID'}:</strong> ${
    id ?? '—'
  }`;
  if (result && result.value !== null && result.value !== undefined) {
    const label = STATUS[result.status]?.label || '';
    html += `<br><strong>Resultado:</strong> ${round(result.value)}`;
    html += `<br><strong>Estado:</strong> ${label}`;
  }
  html += '</div>';
  return html;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
