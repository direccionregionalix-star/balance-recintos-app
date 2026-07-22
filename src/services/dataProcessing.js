/**
 * dataProcessing.js
 * Logica pura de negocio: filtrado por region, cruce GeoJSON x Excel,
 * motor de calculo matematico y clasificacion de estados (colores).
 *
 * Regla de robustez transversal: si un valor viene nulo o una llave no
 * cruza, se omite silenciosamente sin romper la ejecucion.
 */

import { toNumber, normalizeKey, isNumericColumn } from '../utils/helpers.js';

// Paleta semantica de estados. Compartida con mapService y uiComponents.
export const STATUS = {
  holgura: { color: '#16a34a', label: 'Holgura' },
  limite: { color: '#eab308', label: 'Limite' },
  sobrecupo: { color: '#dc2626', label: 'Deficit / Sobrecupo' },
  neutral: { color: '#3b82f6', label: 'Neutral' },
  sinDato: { color: '#cbd5e1', label: 'Sin dato' },
};

export const OPERATORS = {
  subtract: { label: 'Resta (Disponibilidad = A − B)', symbol: '−' },
  add: { label: 'Suma (A + B)', symbol: '+' },
  percent: { label: 'Porcentaje de ocupacion (B / A × 100)', symbol: '%' },
};

/**
 * Extrae los valores unicos de una propiedad a lo largo de todos los features.
 * @param {Object} geojson FeatureCollection
 * @param {string} column
 * @returns {string[]}
 */
export function uniqueValues(geojson, column) {
  const set = new Set();
  const features = geojson?.features || [];
  for (const f of features) {
    const v = f?.properties?.[column];
    if (v !== null && v !== undefined && v !== '') set.add(String(v));
  }
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true })
  );
}

/** Devuelve las llaves de propiedades del primer feature. */
export function featureKeys(geojson) {
  const first = geojson?.features?.[0];
  return first?.properties ? Object.keys(first.properties) : [];
}

/**
 * Filtra los features por region. Si no se indica columna/valor de region,
 * devuelve todos los features (sin filtrar).
 */
export function filterByRegion(geojson, regionColumn, regionValue) {
  const features = geojson?.features || [];
  if (!regionColumn || regionValue === null || regionValue === undefined) {
    return features.slice();
  }
  return features.filter(
    (f) => String(f?.properties?.[regionColumn]) === String(regionValue)
  );
}

/**
 * Ejecuta el cruce (JOIN) entre los features filtrados y las filas del Excel.
 * Muta las propiedades del feature agregando la columna de valor del Excel.
 *
 * @param {Array} features features ya filtrados por region
 * @param {Object} excel { rows, keyColumn, valueColumn }
 * @param {string} geoKeyColumn llave primaria en el GeoJSON
 * @returns {{ matched:number, total:number, numericFields:string[] }}
 */
export function joinExcel(features, excel, geoKeyColumn) {
  const { rows, keyColumn, valueColumn } = excel;
  const total = features.length;
  let matched = 0;

  if (!keyColumn || !valueColumn || !Array.isArray(rows) || rows.length === 0) {
    return { matched: 0, total, numericFields: detectNumericFields(features) };
  }

  // Indexa las filas del Excel por llave normalizada para un JOIN O(n).
  const index = new Map();
  for (const row of rows) {
    const k = normalizeKey(row?.[keyColumn]);
    if (k === null) continue; // llave nula -> se omite silenciosamente
    if (!index.has(k)) index.set(k, row);
  }

  // El nombre del atributo inyectado. Evita colisiones con propiedades previas.
  const targetProp = safePropName(features, valueColumn);

  for (const f of features) {
    if (!f.properties) f.properties = {};
    // Limpia un cruce previo para permitir re-ejecutar el JOIN.
    f.properties.__joinMatched = false;
    f.properties[targetProp] = null;

    const k = normalizeKey(f.properties?.[geoKeyColumn]);
    if (k === null) continue; // recinto sin llave -> se omite

    const row = index.get(k);
    if (!row) continue; // no cruza -> se omite silenciosamente

    const raw = row[valueColumn];
    f.properties[targetProp] = raw; // guarda crudo; el calculo lo normaliza
    f.properties.__joinMatched = true;
    matched++;
  }

  return {
    matched,
    total,
    numericFields: detectNumericFields(features),
    injectedField: targetProp,
  };
}

/** Genera un nombre de propiedad que no pise uno existente. */
function safePropName(features, base) {
  const existing = new Set();
  const first = features[0]?.properties || {};
  Object.keys(first).forEach((k) => existing.add(k));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

/**
 * Detecta campos numericos disponibles en las propiedades de los features.
 * Considera tanto columnas originales del GeoJSON como las inyectadas.
 */
export function detectNumericFields(features) {
  if (!features.length) return [];
  const rows = features.map((f) => f.properties || {});
  const keys = new Set();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const out = [];
  for (const k of keys) {
    if (k.startsWith('__')) continue; // metadatos internos
    if (isNumericColumn(rows, k)) out.push(k);
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Motor de calculo. Aplica el operador seleccionado por cada feature y
 * clasifica el estado. Los features sin dato valido reciben status 'sinDato'
 * y NO rompen el agregado.
 *
 * @param {Array} features
 * @param {string} keyColumn llave primaria del GeoJSON (para el id)
 * @param {{varA:string, varB:string, operator:string}} calc
 * @returns {{ results:Object, totals:Object }}
 */
export function runCalculation(features, keyColumn, calc) {
  const { varA, varB, operator } = calc;
  const results = {};
  const agg = {
    count: 0,
    sumA: 0,
    sumB: 0,
    sumResult: 0,
    holgura: 0,
    limite: 0,
    sobrecupo: 0,
    neutral: 0,
    sinDato: 0,
  };

  for (const f of features) {
    const id = getFeatureId(f, keyColumn);
    if (id === null) continue;

    const a = toNumber(f.properties?.[varA]);
    const b = toNumber(f.properties?.[varB]);

    if (a === null || b === null) {
      results[id] = { value: null, status: 'sinDato', a, b };
      agg.sinDato++;
      continue;
    }

    const value = applyOperator(operator, a, b);
    if (value === null) {
      results[id] = { value: null, status: 'sinDato', a, b };
      agg.sinDato++;
      continue;
    }

    const status = classify(operator, value, a, b);
    results[id] = { value, status, a, b };

    agg.count++;
    agg.sumA += a;
    agg.sumB += b;
    agg.sumResult += value;
    agg[status]++;
  }

  return { results, totals: agg };
}

/** Aplica el operador matematico. Protege division por cero. */
export function applyOperator(operator, a, b) {
  switch (operator) {
    case 'subtract':
      return a - b;
    case 'add':
      return a + b;
    case 'percent':
      if (a === 0) return null; // evita division por cero -> sin dato
      return (b / a) * 100;
    default:
      return null;
  }
}

/**
 * Clasifica el estado segun el operador y los operandos.
 * - subtract: disponibilidad. >0 holgura, ==0 limite, <0 sobrecupo.
 * - percent: ocupacion. <90 holgura, 90..100 limite, >100 sobrecupo.
 * - add: sin semantica de deficit -> neutral.
 */
export function classify(operator, value, a, b) {
  if (operator === 'subtract') {
    if (value > 0) return 'holgura';
    if (value === 0) return 'limite';
    return 'sobrecupo';
  }
  if (operator === 'percent') {
    if (value < 90) return 'holgura';
    if (value <= 100) return 'limite';
    return 'sobrecupo';
  }
  return 'neutral';
}

/** Obtiene el id de un feature usando la llave primaria elegida. */
export function getFeatureId(feature, keyColumn) {
  if (!keyColumn) return feature?.id ?? null;
  const v = feature?.properties?.[keyColumn];
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

/**
 * Agrega los resultados restringidos a un subconjunto de ids (Fase 4).
 */
export function aggregateSubset(results, ids) {
  const agg = {
    count: 0,
    sumA: 0,
    sumB: 0,
    sumResult: 0,
    holgura: 0,
    limite: 0,
    sobrecupo: 0,
    neutral: 0,
    sinDato: 0,
  };
  for (const id of ids) {
    const r = results[id];
    if (!r) continue;
    if (r.status === 'sinDato' || r.value === null) {
      agg.sinDato++;
      continue;
    }
    agg.count++;
    agg.sumA += r.a;
    agg.sumB += r.b;
    agg.sumResult += r.value;
    agg[r.status]++;
  }
  return agg;
}
