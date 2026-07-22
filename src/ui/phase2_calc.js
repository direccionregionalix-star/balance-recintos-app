/**
 * phase2_calc.js
 * Fase 2: Configuración de Escenarios Electorales y Simbología con Filtros
 */

import { getState, setState, patchBranch, subscribe } from '../state/store.js';
import { createSection, createSelect, createButton, createInput, resultCard, statTile, showToast, el } from './uiComponents.js';
import { runCalculation, getFeatureId, STATUS } from '../services/dataProcessing.js';
import { fmt } from '../utils/helpers.js';
import { applyResultStyles } from '../services/mapService.js';
import { renderLegend } from './phase4_spatial.js';

export function mountPhase2(container) {
  const { section, body } = createSection({
    step: 2,
    title: 'Análisis de Capacidad',
    subtitle: 'Simulación de escenarios y simbología',
  });
  section.classList.add('locked');
  container.appendChild(section);

  const controls = el('div', 'dynamic');
  const dynamicInputs = el('div', 'dynamic-inputs');

  // Contenedor para filtros visuales
  const filtersContainer = el('div', 'filters-container');
  filtersContainer.style.padding = '15px';
  filtersContainer.style.background = '#f8fafc';
  filtersContainer.style.borderRadius = '8px';
  filtersContainer.style.marginTop = '15px';
  filtersContainer.style.display = 'none';

  const kpis = el('div', 'kpi-grid');
  const resultsHost = el('div', 'results-list');
  const resultsHead = el('div', 'results-head hidden');
  resultsHead.innerHTML = '<span>Estado por recinto</span>';

  body.append(controls, dynamicInputs, filtersContainer, el('br'), kpis, resultsHead, resultsHost);

  let built = false;

  function buildControls() {
    controls.innerHTML = '';
    const st = getState();
    const numOpts = st.numericFields.map((f) => ({ value: f, label: f }));

    if (!st.calc.mode) patchBranch('calc', { mode: 'electoral', electorsPerTable: 400, isTables: false });

    const modeSelect = createSelect({
      id: 'calc-mode', label: 'Modo de Análisis',
      options: [
        { value: 'electoral', label: 'Evaluar Escenario (Balance)' },
        { value: 'symbology', label: 'Solo Explorar Simbología' }
      ],
      value: st.calc.mode,
      onChange: (v) => {
        patchBranch('calc', { mode: v });
        renderDynamicInputs(numOpts);
      },
    });

    controls.append(modeSelect.wrap);
    renderDynamicInputs(numOpts);
    built = true;
  }

  function renderDynamicInputs(numOpts) {
    dynamicInputs.innerHTML = '';
    const st = getState();
    const mode = st.calc.mode;

    const varCap = createSelect({
      id: 'calc-var-cap', label: mode === 'symbology' ? 'Variable a visualizar' : 'Capacidad Base (Neto / Real)',
      options: numOpts, value: st.calc.varCapacidad,
      onChange: (v) => patchBranch('calc', { varCapacidad: v || null }),
    });
    dynamicInputs.append(varCap.wrap);

    if (mode === 'electoral') {
      const typeCap = createSelect({
        id: 'calc-is-tables', label: '¿La capacidad está en...?',
        options: [{ value: 'false', label: 'Electores' }, { value: 'true', label: 'Mesas' }],
        value: String(st.calc.isTables || false),
        onChange: (v) => patchBranch('calc', { isTables: v === 'true' }),
      });

      const varConteo = createSelect({
        id: 'calc-var-conteo', label: 'Demanda (Conteo última elección)',
        options: numOpts, value: st.calc.varConteo,
        onChange: (v) => patchBranch('calc', { varConteo: v || null }),
      });

      const umbralWrap = el('div', 'input-wrap');
      umbralWrap.innerHTML = `<label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600; color:#475569;">Electores por mesa (Escenario)</label>
                              <input type="number" id="input-electors" value="${st.calc.electorsPerTable || 400}" 
                              style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit;">`;

      umbralWrap.querySelector('input').addEventListener('change', (e) => {
        patchBranch('calc', { electorsPerTable: parseFloat(e.target.value) || 400 });
      });

      dynamicInputs.append(typeCap.wrap, varConteo.wrap, umbralWrap);
    }

    const btn = createButton({ label: 'Ejecutar', variant: 'primary', onClick: calculate });
    dynamicInputs.append(btn);
  }

  function buildFilters() {
    filtersContainer.innerHTML = '<h4 style="margin:0 0 10px 0; font-size:0.9rem; color:#0f172a;">Filtros de Búsqueda</h4>';
    const st = getState();

    const searchInput = createInput({
      id: 'view-filter-text',
      label: 'Buscar Comuna / Recinto',
      placeholder: 'Ej: Valdivia o San Pablo',
      value: st.viewFilters.textSearch,
      onChange: (v) => {
        patchBranch('viewFilters', { textSearch: v });
        reRenderResults();
      }
    });

    const statusSelect = createSelect({
      id: 'view-filter-status',
      label: 'Filtrar por Estado',
      options: [
        { value: 'holgura', label: 'Con Espacio (Holgura)' },
        { value: 'limite', label: 'Al Límite' },
        { value: 'sobrecupo', label: 'Déficit (Sobrecupo)' },
        { value: 'sinDato', label: 'Sin Dato' }
      ],
      value: st.viewFilters.statusFilter,
      placeholder: 'Todos los estados',
      onChange: (v) => {
        patchBranch('viewFilters', { statusFilter: v });
        reRenderResults();
      }
    });

    filtersContainer.append(searchInput.wrap, statusSelect.wrap);
    filtersContainer.style.display = 'block';
  }

  function calculate() {
    const st = getState();
    if (!st.calc.varCapacidad) {
      showToast('Selecciona la variable principal.', 'warn'); return;
    }
    if (st.calc.mode === 'electoral' && !st.calc.varConteo) {
      showToast('Para evaluar escenarios, selecciona la variable de conteo.', 'warn'); return;
    }

    // --- DIAGNÓSTICO EN CONSOLA ---
    console.warn("=== DIAGNÓSTICO DE DATOS GEOJSON ===");
    console.log(`Buscando columnas: '${st.calc.varCapacidad}' y '${st.calc.varConteo}'`);
    console.log("Atributos puros del primer recinto de la lista:");
    console.table(st.filteredFeatures[0]?.properties);
    // --------------------------------

    const { results, totals } = runCalculation(st.filteredFeatures, st.filters.keyColumn, st.calc);
    setState({ results, totals });
    patchBranch('calc', { done: true });

    applyResultStyles(results);
    renderKpis(totals, st.calc.mode);

    buildFilters(); 
    reRenderResults(); 

    renderLegend();
    showToast(`Ejecución lista. Si hay "Sin dato", revisa la consola (F12).`, 'success');
  }

  function renderKpis(totals, mode) {
    kpis.innerHTML = '';
    if (!totals) return;

    if (mode === 'symbology') {
      kpis.append(
        statTile({ label: 'Registros graficados', value: totals.count }),
        statTile({ label: 'Sin dato', value: totals.sinDato, color: STATUS.sinDato.color })
      );
    } else {
      kpis.append(
        statTile({ label: STATUS.holgura.label, value: totals.holgura, color: STATUS.holgura.color }),
        statTile({ label: 'Déficit Crítico', value: totals.sobrecupo, color: STATUS.sobrecupo.color }),
        statTile({ label: 'Balance Global', value: fmt(totals.sumBalance) }),
        statTile({ label: 'Sin dato', value: totals.sinDato, color: STATUS.sinDato.color })
      );
    }
  }

  function reRenderResults() {
    const st = getState();
    renderResults(st.filteredFeatures, st.filters.keyColumn, st.results, st.calc, st.viewFilters);
  }

  function renderResults(features, keyColumn, results, calc, viewFilters) {
    resultsHost.innerHTML = '';
    resultsHead.classList.remove('hidden');

    const order = { sobrecupo: 0, limite: 1, neutral: 2, holgura: 3, sinDato: 4 };

    // 1. Filtrado
    let filteredRows = features
      .map((f) => ({ f, id: getFeatureId(f, keyColumn) }))
      .filter((x) => x.id !== null && results[x.id]);

    if (viewFilters.statusFilter) {
      filteredRows = filteredRows.filter(x => results[x.id].status === viewFilters.statusFilter);
    }

    if (viewFilters.textSearch) {
      const q = viewFilters.textSearch.toLowerCase();
      filteredRows = filteredRows.filter(x => {
        const rawString = Object.values(x.f.properties).join(' ').toLowerCase();
        return rawString.includes(q);
      });
    }

    // 2. Ordenamiento
    filteredRows.sort((a, b) => order[results[a.id].status] - order[results[b.id].status]);

    const frag = document.createDocumentFragment();
    for (const { id } of filteredRows) {
      const r = results[id];
      const s = STATUS[r.status];

      let valText, aText, bText;
      if (calc.mode === 'symbology') {
        valText = fmt(r.value);
        aText = 'N/A'; bText = 'N/A';
      } else {
        const prefijo = r.value > 0 ? '+' : '';
        valText = r.value === null ? '—' : `${prefijo}${fmt(r.value)} electores`;
        aText = r.mesasRestantes === null ? '—' : `${prefijo}${fmt(r.mesasRestantes, 1)} mesas de espacio`;
        bText = r.mesasFisicas === undefined ? '—' : `Físicas: ${r.mesasFisicas} mesas`;
      }

      frag.appendChild(
        resultCard({
          id, value: valText, status: r.status, statusLabel: s.label, color: s.color,
          a: aText, b: bText, aLabel: 'Balance Mesas', bLabel: 'Realidad Recinto',
        })
      );
    }

    if (filteredRows.length === 0) {
      resultsHost.innerHTML = '<p style="text-align:center; color:#64748b; margin-top: 20px;">No hay recintos que coincidan con el filtro.</p>';
    } else {
      resultsHost.appendChild(frag);
    }
  }

  subscribe((state) => {
    if (state.joined && state.numericFields.length) {
      section.classList.remove('locked');
      if (!built) buildControls();
    } else {
      section.classList.add('locked');
      built = false;
      controls.innerHTML = ''; dynamicInputs.innerHTML = ''; kpis.innerHTML = ''; resultsHost.innerHTML = '';
      filtersContainer.style.display = 'none';
      resultsHead.classList.add('hidden');
    }
  });
}
