/**
 * dataProcessing.js
 * Lógica de negocio ajustada para análisis espacial electoral.
 */

import { toNumber, normalizeKey, isNumericColumn } from '../utils/helpers.js';

export const STATUS = {
  holgura: { color: '#16a34a', label: 'Con Espacio (Holgura)' },
  limite: { color: '#eab308', label: 'Al Límite' },
  sobrecupo: { color: '#dc2626', label: 'Déficit (Sobrecupo)' },
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
  const { rows, keyColumn, valueColumn } = excel;
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

    const k = normalizeKey(f.properties?.[geoKeyColumn]);
    if (k === null) continue;

    const row = index.get(k);
    if (!row) continue;

    f.properties[targetProp] = row[valueColumn];
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
 */
export function runCalculation(features, keyColumn, calc) {
  const { mode, varCapacidad, isTables, varConteo, electorsPerTable } = calc;
  const results = {};
  const agg = {
    count: 0, sumCapacidad: 0, sumConteo: 0, sumBalance: 0,
    holgura: 0, limite: 0, sobrecupo: 0, neutral: 0, sinDato: 0,
  };

  for (const f of features) {
    const id = getFeatureId(f, keyColumn);
    if (id === null) continue;

    const rawCap = toNumber(f.properties?.[varCapacidad]);

    if (rawCap === null) {
      results[id] = { value: null, status: 'sinDato', mesasRestantes: null };
      agg.sinDato++;
      continue;
    }

    if (mode === 'symbology') {
      // Solo visualización. Asignamos neutral para que el mapa gradúe por opacidad.
      results[id] = { value: rawCap, status: 'neutral', rawCap };
      agg.count++;
      agg.neutral++;
      continue;
    }

    // MODO ESCENARIO ELECTORAL
    const conteo = toNumber(f.properties?.[varConteo]);
    if (conteo === null) {
      results[id] = { value: null, status: 'sinDato', mesasRestantes: null };
      agg.sinDato++;
      continue;
    }

    // 1. Determinar cuántas mesas físicas soporta realmente el local
    // Si el dato base viene en electores (ej. 4000), asumimos histórico de 400 por mesa = 10 mesas.
    const mesasFisicas = isTables ? rawCap : Math.floor(rawCap / 400); 
    
    // 2. Capacidad máxima real bajo el NUEVO umbral de la ley
    const capacidadSimuladaElectores = mesasFisicas * electorsPerTable;
    
    // 3. Balance: Cuántos sobran o faltan
    const balanceElectores = capacidadSimuladaElectores - conteo;
    const balanceMesas = balanceElectores / electorsPerTable;

    let status = 'sobrecupo';
    if (balanceElectores > 0) status = 'holgura';
    if (balanceElectores === 0) status = 'limite';

    results[id] = { 
      value: balanceElectores, 
      status, 
      capacidadSimulada: capacidadSimuladaElectores, 
      mesasFisicas,
      mesasRestantes: balanceMesas,
      conteo 
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
  const agg = { count: 0, sumCapacidad: 0, sumConteo: 0, sumBalance: 0, holgura: 0, limite: 0, sobrecupo: 0, neutral: 0, sinDato: 0 };
  for (const id of ids) {
    const r = results[id];
    if (!r || r.status === 'sinDato' || r.value === null) {
      agg.sinDato++; continue;
    }
    agg.count++;
    agg.sumCapacidad += r.capacidadSimulada || 0;
    agg.sumConteo += r.conteo || 0;
    agg.sumBalance += r.value || 0;
    agg[r.status]++;
  }
  return agg;
}
