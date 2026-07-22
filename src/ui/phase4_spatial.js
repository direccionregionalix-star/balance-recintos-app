/**
 * phase4_spatial.js
 * Fase 4: Geoprocesamiento al vuelo. El usuario dibuja un poligono y se
 * identifican los recintos contenidos, recalculando totales solo para esa
 * seleccion y mostrando un cuadro resumen flotante. Tambien administra la
 * leyenda del semaforo.
 */

import { getState, setState, subscribe } from '../state/store.js';
import { createSection, createButton, showToast, el } from './uiComponents.js';
import { STATUS, aggregateSubset } from '../services/dataProcessing.js';
import { selectWithin } from '../services/spatialService.js';
import {
  setOnDrawEnd,
  highlightSelection,
  clearDrawn,
  applyResultStyles,
} from '../services/mapService.js';
import { fmt } from '../utils/helpers.js';

export function mountPhase4(container) {
  const { section, body } = createSection({
    step: 4,
    title: 'Seleccion espacial',
    subtitle: 'Dibuja un area para analizar un subconjunto',
  });
  section.classList.add('locked');
  container.appendChild(section);

  const hint = el('p', 'hint');
  hint.innerHTML =
    'Usa las herramientas de dibujo (arriba a la izquierda del mapa) para trazar un poligono o rectangulo. Los recintos dentro del trazado se recalculan aparte.';
  const clearBtn = createButton({
    label: 'Limpiar seleccion',
    variant: 'ghost',
    onClick: clearSelection,
  });
  body.append(hint, clearBtn);

  // Registra el callback de dibujo una sola vez.
  setOnDrawEnd(onPolygonDrawn);

  function onPolygonDrawn(drawnPolygon) {
    const st = getState();
    if (!drawnPolygon) {
      clearSelection();
      return;
    }
    if (!st.calc.done) {
      showToast('Ejecuta primero el calculo (Fase 2).', 'warn');
      return;
    }
    const ids = selectWithin(drawnPolygon, st.filteredFeatures, st.filters.keyColumn);
    if (!ids.length) {
      showToast('Ningun recinto cae dentro del trazado.', 'warn');
      updateSummary({ ids: [], totals: null });
      highlightSelection([]);
      setState({ spatialSelection: null });
      return;
    }
    const totals = aggregateSubset(st.results, ids);
    setState({ spatialSelection: { ids, totals } });
    highlightSelection(ids);
    updateSummary({ ids, totals });
    showToast(`${ids.length} recintos seleccionados espacialmente.`, 'success');
  }

  function clearSelection() {
    clearDrawn();
    highlightSelection([]);
    // Restaura los estilos por resultado.
    const st = getState();
    if (st.results && Object.keys(st.results).length) {
      applyResultStyles(st.results);
    }
    setState({ spatialSelection: null });
    hideSummary();
  }

  subscribe((state) => {
    if (state.calc.done) section.classList.remove('locked');
    else {
      section.classList.add('locked');
      hideSummary();
    }
  });
}

// ---------------------------------------------------------------------------
// Cuadro resumen flotante
// ---------------------------------------------------------------------------

function updateSummary({ ids, totals }) {
  const box = document.getElementById('spatial-summary');
  if (!box) return;
  if (!totals || !ids.length) {
    hideSummary();
    return;
  }
  box.innerHTML = `
    <div class="fs-head">
      <span class="fs-title">Seleccion espacial</span>
      <button class="fs-close" title="Cerrar">×</button>
    </div>
    <div class="fs-count">${ids.length} recintos</div>
    <div class="fs-grid">
      <div><span class="dot" style="background:${STATUS.holgura.color}"></span>Holgura <b>${totals.holgura}</b></div>
      <div><span class="dot" style="background:${STATUS.limite.color}"></span>Limite <b>${totals.limite}</b></div>
      <div><span class="dot" style="background:${STATUS.sobrecupo.color}"></span>Sobrecupo <b>${totals.sobrecupo}</b></div>
      <div><span class="dot" style="background:${STATUS.sinDato.color}"></span>Sin dato <b>${totals.sinDato}</b></div>
    </div>
    <div class="fs-totals">
      <div>Suma A: <b>${fmt(totals.sumA)}</b></div>
      <div>Suma B: <b>${fmt(totals.sumB)}</b></div>
      <div>Suma resultado: <b>${fmt(totals.sumResult)}</b></div>
    </div>
  `;
  box.classList.remove('hidden');
  box.querySelector('.fs-close')?.addEventListener('click', hideSummary);
}

function hideSummary() {
  const box = document.getElementById('spatial-summary');
  if (box) box.classList.add('hidden');
}

/** Renderiza la leyenda del semaforo (llamada desde Fase 2). */
export function renderLegend() {
  const box = document.getElementById('map-legend');
  if (!box) return;
  box.innerHTML =
    '<div class="legend-title">Estados</div>' +
    ['holgura', 'limite', 'sobrecupo', 'neutral', 'sinDato']
      .map(
        (k) =>
          `<div class="legend-row"><span class="dot" style="background:${STATUS[k].color}"></span>${STATUS[k].label}</div>`
      )
      .join('');
  box.classList.remove('hidden');
}
