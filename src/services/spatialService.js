/**
 * spatialService.js
 * Analisis espacial al vuelo con Turf.js. Dado un poligono dibujado a mano,
 * identifica que recintos caen dentro del trazado.
 *
 * Estrategia: se prueba primero interseccion topologica (turf.intersect) y,
 * como respaldo robusto y rapido, la pertenencia del centroide del recinto
 * (turf.booleanPointInPolygon). Cualquier geometria invalida se omite.
 */

import {
  booleanPointInPolygon,
  centroid,
  intersect,
  featureCollection,
} from '@turf/turf';

import { getFeatureId } from './dataProcessing.js';

/**
 * Devuelve los ids de los recintos contenidos/intersectados por el poligono.
 *
 * @param {Object} drawnPolygon Feature<Polygon> dibujado (GeoJSON)
 * @param {Array}  features recintos actuales
 * @param {string} keyColumn llave primaria del GeoJSON
 * @returns {string[]} ids seleccionados
 */
export function selectWithin(drawnPolygon, features, keyColumn) {
  const selected = [];
  const draw = normalizePolygon(drawnPolygon);
  if (!draw) return selected;

  for (const f of features) {
    const id = getFeatureId(f, keyColumn);
    if (id === null) continue;

    try {
      if (isInside(f, draw)) selected.push(id);
    } catch {
      // Geometria problematica -> se omite silenciosamente.
      continue;
    }
  }
  return selected;
}

/** Determina si un feature esta dentro del poligono dibujado. */
function isInside(feature, draw) {
  const geomType = feature?.geometry?.type;

  // Para poligonos: interseccion topologica (mas preciso).
  if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
    try {
      const inter = intersect(featureCollection([feature, draw]));
      if (inter) return true;
    } catch {
      /* cae al respaldo por centroide */
    }
    // Respaldo: centroide dentro del trazado.
    const c = centroid(feature);
    return booleanPointInPolygon(c, draw);
  }

  // Para puntos: prueba directa.
  if (geomType === 'Point') {
    return booleanPointInPolygon(feature, draw);
  }

  // Otras geometrias: usa el centroide.
  const c = centroid(feature);
  return booleanPointInPolygon(c, draw);
}

/** Valida y normaliza el poligono dibujado a un Feature<Polygon>. */
function normalizePolygon(drawn) {
  if (!drawn) return null;
  const geom = drawn.type === 'Feature' ? drawn.geometry : drawn;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
    return null;
  }
  return drawn.type === 'Feature'
    ? drawn
    : { type: 'Feature', properties: {}, geometry: geom };
}
