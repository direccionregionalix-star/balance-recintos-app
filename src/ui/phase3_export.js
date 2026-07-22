/**
 * phase3_export.js
 * Fase 3: Exportacion de datos. Toma el estado calculado y descarga un .xlsx
 * estructurado usando SheetJS.
 */

import { getState, subscribe } from '../state/store.js';
import { createSection, createButton, showToast, el } from './uiComponents.js';
import { exportResults } from '../services/excelService.js';

export function mountPhase3(container) {
  const { section, body } = createSection({
    step: 3,
    title: 'Exportacion de resultados',
    subtitle: 'Descarga el balance calculado en Excel',
  });
  section.classList.add('locked');
  container.appendChild(section);

  const hint = el('p', 'hint');
  hint.textContent =
    'Se exporta el detalle por recinto (A, B, operacion, resultado y estado) y una hoja de resumen agregado.';

  const btn = createButton({
    label: '⬇  Exportar resultados (Excel)',
    variant: 'accent',
    id: 'export-btn',
    onClick: doExport,
  });
  btn.classList.add('btn-block');

  body.append(hint, btn);

  function doExport() {
    const st = getState();
    if (!st.calc.done || !st.totals) {
      showToast('Ejecuta primero el calculo (Fase 2).', 'warn');
      return;
    }
    try {
      exportResults({
        features: st.filteredFeatures,
        keyColumn: st.filters.keyColumn,
        results: st.results,
        calc: st.calc,
        totals: st.totals,
      });
      showToast('Archivo Excel generado.', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo generar el Excel.', 'error');
    }
  }

  subscribe((state) => {
    if (state.calc.done && state.totals) section.classList.remove('locked');
    else section.classList.add('locked');
  });
}
