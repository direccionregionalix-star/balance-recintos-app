/**
 * phase2_calc.js
 * Fase 2: Motor de calculo matematico. Selecciona dos variables numericas,
 * un operador, calcula el balance por recinto y repinta el mapa.
 */

import { getState, setState, patchBranch, subscribe } from '../state/store.js';
import {
  createSection,
  createSelect,
  createButton,
  resultCard,
  statTile,
  showToast,
  el,
} from './uiComponents.js';
import {
  runCalculation,
  getFeatureId,
  STATUS,
  OPERATORS,
} from '../services/dataProcessing.js';
import { fmt } from '../utils/helpers.js';
import { applyResultStyles } from '../services/mapService.js';
import { renderLegend } from './phase4_spatial.js';

export function mountPhase2(container) {
  const { section, body } = createSection({
    step: 2,
    title: 'Motor de calculo',
    subtitle: 'Balance por recinto y semaforo espacial',
  });
  section.classList.add('locked');
  container.appendChild(section);

  const controls = el('div', 'dynamic');
  const kpis = el('div', 'kpi-grid');
  const resultsHost = el('div', 'results-list');
  const resultsHead = el('div', 'results-head hidden');
  resultsHead.innerHTML = '<span>Balance por recinto</span>';

  body.append(controls, kpis, resultsHead, resultsHost);

  let built = false;

  function buildControls() {
    controls.innerHTML = '';
    const st = getState();
    const numOpts = st.numericFields.map((f) => ({ value: f, label: f }));
    const opOpts = Object.entries(OPERATORS).map(([value, o]) => ({
      value,
      label: o.label,
    }));

    const varA = createSelect({
      id: 'calc-var-a',
      label: 'Variable A',
      placeholder: '— Selecciona —',
      options: numOpts,
      value: st.calc.varA,
      onChange: (v) => patchBranch('calc', { varA: v || null }),
    });
    const varB = createSelect({
      id: 'calc-var-b',
      label: 'Variable B',
      placeholder: '— Selecciona —',
      options: numOpts,
      value: st.calc.varB,
      onChange: (v) => patchBranch('calc', { varB: v || null }),
    });
    const op = createSelect({
      id: 'calc-op',
      label: 'Operador',
      options: opOpts,
      value: st.calc.operator,
      onChange: (v) => patchBranch('calc', { operator: v || 'subtract' }),
    });
    const btn = createButton({
      label: 'Calcular balance',
      variant: 'primary',
      onClick: calculate,
    });

    controls.append(varA.wrap, varB.wrap, op.wrap, btn);
    built = true;
  }

  function calculate() {
    const st = getState();
    if (!st.calc.varA || !st.calc.varB) {
      showToast('Selecciona las dos variables numericas.', 'warn');
      return;
    }
    if (st.calc.varA === st.calc.varB) {
      showToast('Elige dos variables distintas.', 'warn');
      return;
    }
    const { results, totals } = runCalculation(
      st.filteredFeatures,
      st.filters.keyColumn,
      st.calc
    );
    setState({ results, totals });
    patchBranch('calc', { done: true });

    applyResultStyles(results); // repinta el mapa
    renderKpis(totals);
    renderResults(st.filteredFeatures, st.filters.keyColumn, results, st.calc);
    renderLegend(); // muestra la leyenda del semaforo
    showToast(`Calculo listo: ${totals.count} recintos con resultado.`, 'success');
  }

  function renderKpis(totals) {
    kpis.innerHTML = '';
    if (!totals) return;
    kpis.append(
      statTile({ label: 'Calculados', value: totals.count }),
      statTile({ label: STATUS.holgura.label, value: totals.holgura, color: STATUS.holgura.color }),
      statTile({ label: STATUS.limite.label, value: totals.limite, color: STATUS.limite.color }),
      statTile({
        label: 'Sobrecupo',
        value: totals.sobrecupo,
        color: STATUS.sobrecupo.color,
      }),
      statTile({ label: 'Suma resultado', value: fmt(totals.sumResult) }),
      statTile({ label: 'Sin dato', value: totals.sinDato, color: STATUS.sinDato.color })
    );
  }

  function renderResults(features, keyColumn, results, calc) {
    resultsHost.innerHTML = '';
    resultsHead.classList.remove('hidden');
    const isPercent = calc.operator === 'percent';

    // Ordena por severidad: primero sobrecupo, luego limite, luego holgura.
    const order = { sobrecupo: 0, limite: 1, neutral: 2, holgura: 3, sinDato: 4 };
    const rows = features
      .map((f) => ({ f, id: getFeatureId(f, keyColumn) }))
      .filter((x) => x.id !== null && results[x.id])
      .sort((a, b) => order[results[a.id].status] - order[results[b.id].status]);

    const frag = document.createDocumentFragment();
    for (const { id } of rows) {
      const r = results[id];
      const s = STATUS[r.status];
      frag.appendChild(
        resultCard({
          id,
          value:
            r.value === null
              ? '—'
              : isPercent
              ? `${fmt(r.value, 1)} %`
              : fmt(r.value),
          status: r.status,
          statusLabel: s.label,
          color: s.color,
          a: fmt(r.a),
          b: fmt(r.b),
          aLabel: calc.varA,
          bLabel: calc.varB,
        })
      );
    }
    resultsHost.appendChild(frag);
  }

  // Habilita la fase cuando el cruce esta listo; refresca las variables.
  subscribe((state) => {
    if (state.joined && state.numericFields.length) {
      section.classList.remove('locked');
      if (!built) buildControls();
    } else {
      section.classList.add('locked');
      built = false;
      controls.innerHTML = '';
      kpis.innerHTML = '';
      resultsHost.innerHTML = '';
      resultsHead.classList.add('hidden');
    }
  });
}
