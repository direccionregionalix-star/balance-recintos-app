/**
 * excelService.js
 * Envuelve SheetJS (xlsx) para leer archivos .xlsx/.csv y para exportar
 * el estado calculado a un .xlsx estructurado (Fase 3).
 */

import * as XLSX from 'xlsx';
import { getFeatureId, STATUS, OPERATORS } from './dataProcessing.js';
import { fmt } from '../utils/helpers.js';

/**
 * Lee un archivo Excel y devuelve { columns, rows }.
 * @param {File} file
 * @returns {Promise<{columns:string[], rows:Object[]}>}
 */
export function readExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheet];
        // defval: '' garantiza que todas las filas tengan las mismas llaves.
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
        const columns = rows.length ? Object.keys(rows[0]) : [];
        resolve({ columns, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Exporta los resultados calculados a un archivo .xlsx y dispara la descarga.
 *
 * @param {Object} params
 * @param {Array}  params.features features filtrados y cruzados
 * @param {string} params.keyColumn llave primaria del GeoJSON
 * @param {Object} params.results   featureId -> { value, status, a, b }
 * @param {Object} params.calc      { varA, varB, operator }
 * @param {Object} params.totals    agregados globales
 */
export function exportResults({ features, keyColumn, results, calc, totals }) {
  const opLabel = OPERATORS[calc.operator]?.label || calc.operator;

  // Hoja 1: detalle por recinto.
  const detail = features.map((f) => {
    const id = getFeatureId(f, keyColumn);
    const r = (id !== null && results[id]) || {};
    return {
      [keyColumn || 'ID']: id,
      [`A · ${calc.varA || ''}`]: r.a ?? '',
      [`B · ${calc.varB || ''}`]: r.b ?? '',
      Operacion: opLabel,
      Resultado: r.value ?? '',
      Estado: STATUS[r.status]?.label || 'Sin dato',
    };
  });

  // Hoja 2: resumen agregado.
  const summary = totals
    ? [
        { Metrica: 'Recintos calculados', Valor: totals.count },
        { Metrica: `Suma A (${calc.varA || ''})`, Valor: totals.sumA },
        { Metrica: `Suma B (${calc.varB || ''})`, Valor: totals.sumB },
        { Metrica: 'Suma Resultado', Valor: totals.sumResult },
        { Metrica: 'En holgura', Valor: totals.holgura },
        { Metrica: 'En limite', Valor: totals.limite },
        { Metrica: 'En sobrecupo/deficit', Valor: totals.sobrecupo },
        { Metrica: 'Neutrales', Valor: totals.neutral },
        { Metrica: 'Sin dato', Valor: totals.sinDato },
      ]
    : [{ Metrica: 'Sin calculo ejecutado', Valor: '' }];

  const wb = XLSX.utils.book_new();
  const wsDetail = XLSX.utils.json_to_sheet(detail);
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  autoWidth(wsDetail, detail);
  autoWidth(wsSummary, summary);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Balance por recinto');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `balance_recintos_${stamp}.xlsx`);
}

/** Ajusta el ancho de columnas segun el contenido mas largo. */
function autoWidth(ws, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  ws['!cols'] = cols.map((c) => {
    let max = c.length;
    for (const r of rows) {
      const val = r[c];
      const len = val === null || val === undefined ? 0 : String(val).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(max + 2, 40) };
  });
}

// Re-export util de formato por conveniencia de otros modulos si lo requieren.
export { fmt };
