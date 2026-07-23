/**
 * dataProcessing.js
 * Lógica de negocio ajustada para análisis espacial electoral.
 */

import {
  toNumber,
  normalizeKey,
  isNumericColumn,
  getComuna,
  getRecintoName,
} from '../utils/helpers.js';

/**
 * Intenta adivinar una columna a partir de una lista de candidatos. Primero
 * busca coincidencia exacta (sin distinguir mayúsculas) y luego parcial.
 * Devuelve el nombre real de la columna o null.
 */
export function guessColumn(columns, candidates) {
  if (!Array.isArray(columns) || !columns.length) return null;
  const norm = columns.map((c) => ({ c, l: String(c).toLowerCase().trim() }));
  for (const cand of candidates) {
    const hit = norm.find((x) => x.l === cand.toLowerCase());
    if (hit) return hit.c;
  }
  for (const cand of candidates) {
    const hit = norm.find((x) => x.l.includes(cand.toLowerCase()));
    if (hit) return hit.c;
  }
  return null;
}

/** Lista ordenada de comunas presentes en los features. */
export function uniqueComunas(features) {
  const set = new Set();
  for (const f of features || []) {
    const c = getComuna(f?.properties);
    if (c) set.add(c);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/** Lista ordenada de nombres de recinto, opcionalmente acotada a una comuna. */
export function uniqueRecintos(features, comuna) {
  const set = new Set();
  for (const f of features || []) {
    if (comuna && getComuna(f?.properties) !== comuna) continue;
    const n = getRecintoName(f?.properties);
    if (n) set.add(n);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

export const STATUS = {
  holgura: { color: '#16a34a', label: 'Con Espacio (Holgura)' },
  limite: { color: '#eab308', label: 'Al Límite' },
  sobrecupo: { color: '#dc2626', label: 'Déficit (Sobrecupo)' },
  resuelto: { color: '#7c3aed', label: 'Con solución propuesta' },
  neutral: { color: '#3b82f6', label: 'Visualización' },
  sinDato: { color: '#cbd5e1', label: 'Sin dato' },
};

export function uniqueValues(geojson, column) {
  const set = new Set();
  const features = geojson?.features || [];
  for (const f of features) {
    const v = f?.properties?.[column];
    if (v !== null && v !== undefined && v !== '') set.add(String(v));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

export function featureKeys(geojson) {
  const first = geojson?.features?.[0];
  return first?.properties ? Object.keys(first.properties) : [];
}

export function filterByRegion(geojson, regionColumn, regionValue) {
  const features = geojson?.features || [];
  if (!regionColumn || regionValue === null || regionValue === undefined) {
    return features.slice();
  }
  return features.filter((f) => String(f?.properties?.[regionColumn]) === String(regionValue));
}

export function joinExcel(features, excel, geoKeyColumn) {
  const { rows, keyColumn, valueColumn, nameColumn, comunaColumn, latColumn, lonColumn } = excel;
  const total = features.length;
  let matched = 0;

  if (!keyColumn || !valueColumn || !Array.isArray(rows) || rows.length === 0) {
    return { matched: 0, total, numericFields: detectNumericFields(features) };
  }

  const index = new Map();
  for (const row of rows) {
    const k = normalizeKey(row?.[keyColumn]);
    if (k === null) continue;
    if (!index.has(k)) index.set(k, row);
  }

  const targetProp = safePropName(features, valueColumn);

  for (const f of features) {
    if (!f.properties) f.properties = {};
    f.properties.__joinMatched = false;
    f.properties[targetProp] = null;
    // Limpia atributos descriptivos de un cruce previo (re-ejecutable).
    delete f.properties.__recintoNombre;
    delete f.properties.__recintoComuna;
    delete f.properties.__lat;
    delete f.properties.__lon;

    const k = normalizeKey(f.properties?.[geoKeyColumn]);
    if (k === null) continue;

    const row = index.get(k);
    if (!row) continue;

    f.properties[targetProp] = row[valueColumn];

    // Arrastra nombre y comuna del Excel (si se indicaron) para mostrarlos en
    // las tarjetas y alimentar los filtros. Se guardan con prefijo `__` para
    // no ensuciar la detección de campos numéricos.
    if (nameColumn && row[nameColumn] != null && String(row[nameColumn]).trim() !== '') {
      f.properties.__recintoNombre = String(row[nameColumn]).trim();
    }
    if (comunaColumn && row[comunaColumn] != null && String(row[comunaColumn]).trim() !== '') {
      f.properties.__recintoComuna = String(row[comunaColumn]).trim();
    }
    // Coordenadas del recinto (para el punto de ubicación en el mapa).
    if (latColumn && row[latColumn] != null && String(row[latColumn]).trim() !== '') {
      f.properties.__lat = row[latColumn];
    }
    if (lonColumn && row[lonColumn] != null && String(row[lonColumn]).trim() !== '') {
      f.properties.__lon = row[lonColumn];
    }

    f.properties.__joinMatched = true;
    matched++;
  }

  return { matched, total, numericFields: detectNumericFields(features), injectedField: targetProp };
}

function safePropName(features, base) {
  const existing = new Set();
  const first = features[0]?.properties || {};
  Object.keys(first).forEach((k) => existing.add(k));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function detectNumericFields(features) {
  if (!features.length) return [];
  const rows = features.map((f) => f.properties || {});
  const keys = new Set();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const out = [];
  for (const k of keys) {
    if (k.startsWith('__')) continue;
    if (isNumericColumn(rows, k)) out.push(k);
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Motor de cálculo electoral.
 * Soporta modo 'symbology' (solo pintar colores) y 'electoral' (calcular escenarios).
 *
 * @param {Object} [overrides] mapa cod_recinto -> { capacidad_real, conteo, resuelto }
 *        Las ediciones online reemplazan los valores del archivo y `resuelto`
 *        fuerza el color/estado "Con solución propuesta".
 */
export function runCalculation(features, keyColumn, calc, overrides = {}) {
  const { mode, varCapacidad, isTables, varConteo, electorsPerTable } = calc;
  const results = {};
  const agg = {
    count: 0, sumCapacidad: 0, sumConteo: 0, sumBalance: 0,
    holgura: 0, limite: 0, sobrecupo: 0, resuelto: 0, neutral: 0, sinDato: 0,
  };

  for (const f of features) {
    const id = getFeatureId(f, keyColumn);
    if (id === null) continue;

    const ov = overrides?.[id] || null;
    // La capacidad ingresada por un humano (ficha comunal o edición manual) es
    // SIEMPRE en mesas: fija directamente las mesas físicas, sin ÷400 ni toggle.
    const capOverrideMesas = ov && ov.capacidad_real != null ? toNumber(ov.capacidad_real) : null;

    // Valor base del archivo (solo se usa si no hay override humano).
    const rawCap = capOverrideMesas !== null ? capOverrideMesas : toNumber(f.properties?.[varCapacidad]);

    if (rawCap === null) {
      results[id] = { value: null, status: 'sinDato', mesasRestantes: null, overridden: !!ov };
      agg.sinDato++;
      continue;
    }

    if (mode === 'symbology') {
      results[id] = { value: rawCap, status: 'neutral', rawCap, overridden: !!ov };
      agg.count++;
      agg.neutral++;
      continue;
    }

    // MODO ESCENARIO ELECTORAL
    const conteo =
      ov && ov.conteo != null ? toNumber(ov.conteo) : toNumber(f.properties?.[varConteo]);
    if (conteo === null) {
      results[id] = { value: null, status: 'sinDato', mesasRestantes: null, overridden: !!ov };
      agg.sinDato++;
      continue;
    }

    // Mesas físicas: el override es mesas directas; el archivo respeta el toggle.
    const mesasFisicas =
      capOverrideMesas !== null ? capOverrideMesas : (isTables ? rawCap : Math.floor(rawCap / 400));
    const capacidadSimuladaElectores = mesasFisicas * electorsPerTable;
    const balanceElectores = capacidadSimuladaElectores - conteo;
    const balanceMesas = balanceElectores / electorsPerTable;

    let status = 'sobrecupo';
    if (balanceElectores > 0) status = 'holgura';
    if (balanceElectores === 0) status = 'limite';

    // Si hay una solución propuesta en las observaciones, se recolorea.
    if (ov && ov.resuelto) status = 'resuelto';

    results[id] = {
      value: balanceElectores,
      status,
      capacidadSimulada: capacidadSimuladaElectores,
      mesasFisicas,
      mesasRestantes: balanceMesas,
      conteo,
      overridden: !!(ov && (ov.capacidad_real != null || ov.conteo != null)),
    };

    agg.count++;
    agg.sumCapacidad += capacidadSimuladaElectores;
    agg.sumConteo += conteo;
    agg.sumBalance += balanceElectores;
    agg[status]++;
  }

  return { results, totals: agg };
}

export function getFeatureId(feature, keyColumn) {
  if (!keyColumn) return feature?.id ?? null;
  const v = feature?.properties?.[keyColumn];
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

export function aggregateSubset(results, ids) {
  const agg = { count: 0, sumCapacidad: 0, sumConteo: 0, sumBalance: 0, holgura: 0, limite: 0, sobrecupo: 0, resuelto: 0, neutral: 0, sinDato: 0 };
  for (const id of ids) {
    const r = results[id];
    if (!r || r.status === 'sinDato' || r.value === null) {
      agg.sinDato++; continue;
    }
    agg.count++;
    agg.sumCapacidad += r.capacidadSimulada || 0;
    agg.sumConteo += r.conteo || 0;
    agg.sumBalance += r.value || 0;
    if (agg[r.status] !== undefined) agg[r.status]++;
  }
  return agg;
}
