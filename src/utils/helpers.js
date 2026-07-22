/**
 * helpers.js
 * Utilidades puras y transversales. Sin efectos secundarios ni dependencias
 * de DOM. Diseñadas para tolerar datos sucios (nulos, strings, vacios).
 */

/**
 * Intenta convertir un valor arbitrario a numero.
 * Acepta strings con separadores de miles ('1.234,56' o '1,234.56').
 * @returns {number|null} numero o null si no es convertible.
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let s = String(value).trim();
  if (s === '') return null;

  // Normaliza separadores comunes. Si hay coma y punto, se asume que el
  // ultimo separador es el decimal.
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // formato 1.234,56
    } else {
      s = s.replace(/,/g, ''); // formato 1,234.56
    }
  } else if (hasComma) {
    // Solo coma: podria ser decimal (12,5) o miles (1,200). Heuristica:
    // si son grupos exactos de 3 digitos -> separador de miles.
    if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    // Solo punto: en formato es-CL el punto suele ser separador de miles
    // (1.200 = mil doscientos). Solo se trata como miles cuando el patron
    // es inequivoco (grupos exactos de 3 digitos: 1.200, 1.200.000).
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    // En cualquier otro caso (1.2, 1.25, .5) se respeta como decimal.
  }
  s = s.replace(/[^0-9.\-eE]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza una llave para el JOIN: string, trim, minusculas. */
export function normalizeKey(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s.toLowerCase();
}

/** Formatea un numero para mostrar (separador de miles, N decimales). */
export function fmt(value, decimals = 2) {
  const n = toNumber(value);
  if (n === null) return '—';
  return n.toLocaleString('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** Escapa texto para insertar de forma segura en HTML. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Detecta si una columna es "mayoritariamente numerica" en una muestra.
 * @param {Array<Object>} rows
 * @param {string} col
 */
export function isNumericColumn(rows, col) {
  let numeric = 0;
  let checked = 0;
  for (const row of rows.slice(0, 50)) {
    const v = row?.[col];
    if (v === null || v === undefined || v === '') continue;
    checked++;
    if (toNumber(v) !== null) numeric++;
  }
  return checked > 0 && numeric / checked >= 0.6;
}

/** Devuelve un id de DOM seguro a partir de un texto. */
export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Busca en un objeto de propiedades (sin distinguir mayúsculas) el primer
 * atributo que coincida con alguno de los candidatos. Devuelve su valor como
 * string recortado, o null si ninguno tiene contenido.
 */
export function pickProp(properties, candidates) {
  if (!properties) return null;
  const lower = {};
  for (const k of Object.keys(properties)) lower[k.toLowerCase()] = k;
  for (const cand of candidates) {
    const realKey = lower[cand.toLowerCase()];
    if (realKey === undefined) continue;
    const v = properties[realKey];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/**
 * Nombre del recinto. Prioriza el nombre inyectado en el cruce
 * (`__recintoNombre`) y luego atributos habituales del GeoJSON/Excel.
 */
export function getRecintoName(properties) {
  return pickProp(properties, [
    '__recintoNombre', 'recinto', 'nombre', 'nombre_recinto', 'nom_recinto',
    'establecimiento', 'local', 'des_local', 'nombre_local',
  ]);
}

/**
 * Comuna del recinto. Revisa atributos comunes del GeoJSON y, como respaldo,
 * la comuna traída del Excel en el cruce (`__recintoComuna`).
 */
export function getComuna(properties) {
  return pickProp(properties, [
    'comuna', 'nom_comuna', 'glosa_comu', 'nombre_comuna', 'des_comuna',
    'municipio', '__recintoComuna',
  ]);
}
