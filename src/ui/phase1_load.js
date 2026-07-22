/**
 * phase1_load.js
 * Fase 1: Carga dinamica y parametrizacion (Cruce GeoJSON x Excel).
 */

import { getState, setState, patchBranch, subscribe } from '../state/store.js';
import {
  createSection,
  createFileInput,
  createSelect,
  createButton,
  showToast,
  el,
} from './uiComponents.js';
import {
  featureKeys,
  uniqueValues,
  filterByRegion,
  joinExcel,
} from '../services/dataProcessing.js';
import { readExcel } from '../services/excelService.js';
import { renderFeatures } from '../services/mapService.js';

export function mountPhase1(container) {
  const { section, body } = createSection({
    step: 1,
    title: 'Carga y parametrizacion',
    subtitle: 'Cruce dinamico GeoJSON × Excel',
  });
  container.appendChild(section);

  // --- Sub-bloque GeoJSON ---
  const geoBlock = el('div', 'sub-block');
  const geoInput = createFileInput({
    id: 'geojson-file',
    label: 'Archivo GeoJSON de recintos',
    accept: '.geojson,.json,application/geo+json,application/json',
    onChange: handleGeojson,
  });
  geoBlock.appendChild(geoInput.wrap);
  const geoControls = el('div', 'dynamic'); // se llena tras cargar
  geoBlock.appendChild(geoControls);
  body.appendChild(geoBlock);

  // --- Sub-bloque Excel ---
  const xlsBlock = el('div', 'sub-block disabled');
  xlsBlock.id = 'excel-block';
  const xlsInput = createFileInput({
    id: 'excel-file',
    label: 'Archivo Excel (.xlsx) de capacidad',
    accept: '.xlsx,.xls,.csv',
    onChange: handleExcel,
  });
  xlsBlock.appendChild(xlsInput.wrap);
  const xlsControls = el('div', 'dynamic');
  xlsBlock.appendChild(xlsControls);
  body.appendChild(xlsBlock);

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

  async function handleGeojson(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const geojson = JSON.parse(text);
      if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        showToast('El GeoJSON debe ser un FeatureCollection valido.', 'error');
        return;
      }
      const geoProps = featureKeys(geojson);
      if (!geoProps.length) {
        showToast('El GeoJSON no tiene propiedades legibles.', 'warn');
      }
      setState({
        geojson,
        geoProps,
        filteredFeatures: [],
        joined: false,
        results: {},
        totals: null,
      });
      patchBranch('filters', { regionColumn: null, regionValue: null, keyColumn: null });
      showToast(`GeoJSON cargado: ${geojson.features.length} features.`, 'success');
      renderGeoControls(geoControls);
    } catch (err) {
      console.error(err);
      showToast('No se pudo parsear el GeoJSON.', 'error');
    }
  }

  async function handleExcel(file) {
    if (!file) return;
    try {
      const { columns, rows } = await readExcel(file);
      if (!columns.length) {
        showToast('El Excel no contiene columnas legibles.', 'warn');
        return;
      }
      patchBranch('excel', { columns, rows, keyColumn: null, valueColumn: null });
      setState({ joined: false, results: {}, totals: null });
      showToast(`Excel cargado: ${rows.length} filas.`, 'success');
      renderExcelControls(xlsControls);
    } catch (err) {
      console.error(err);
      showToast('No se pudo leer el archivo Excel.', 'error');
    }
  }

  // ---------------------------------------------------------------------
  // Renderizado de controles dinamicos
  // ---------------------------------------------------------------------

  function renderGeoControls(host) {
    host.innerHTML = '';
    const st = getState();
    const propOpts = st.geoProps.map((p) => ({ value: p, label: p }));

    const regionCol = createSelect({
      id: 'geo-region-col',
      label: 'Columna de Region',
      placeholder: '— Selecciona —',
      options: propOpts,
      value: st.filters.regionColumn,
      onChange: (v) => {
        patchBranch('filters', { regionColumn: v || null, regionValue: null });
        refreshRegionValues();
      },
    });

    const regionVal = createSelect({
      id: 'geo-region-val',
      label: 'Valor de Region a filtrar',
      placeholder: '— Todas —',
      options: [],
      value: st.filters.regionValue,
      onChange: (v) => patchBranch('filters', { regionValue: v || null }),
    });

    const keyCol = createSelect({
      id: 'geo-key-col',
      label: 'Llave primaria (ID del recinto)',
      placeholder: '— Selecciona —',
      options: propOpts,
      value: st.filters.keyColumn,
      onChange: (v) => patchBranch('filters', { keyColumn: v || null }),
    });

    const applyBtn = createButton({
      label: 'Aplicar filtro y renderizar',
      variant: 'primary',
      onClick: applyFilter,
    });

    host.append(regionCol.wrap, regionVal.wrap, keyCol.wrap, applyBtn);
    host.__regionValSelect = regionVal.select;
    refreshRegionValues();
  }

  function refreshRegionValues() {
    const host = geoControls;
    const sel = host.__regionValSelect;
    if (!sel) return;
    const st = getState();
    const col = st.filters.regionColumn;
    const values = col ? uniqueValues(st.geojson, col) : [];
    sel.innerHTML =
      '<option value="">— Todas —</option>' +
      values.map((v) => `<option value="${v}">${v}</option>`).join('');
  }

  function applyFilter() {
    const st = getState();
    if (!st.geojson) {
      showToast('Primero carga un GeoJSON.', 'warn');
      return;
    }
    if (!st.filters.keyColumn) {
      showToast('Selecciona la llave primaria del recinto.', 'warn');
      return;
    }
    const filtered = filterByRegion(
      st.geojson,
      st.filters.regionColumn,
      st.filters.regionValue
    );
    if (!filtered.length) {
      showToast('El filtro no devolvio recintos.', 'warn');
      return;
    }
    // Clona para no mutar el geojson original al cruzar.
    const clone = filtered.map((f) => ({
      ...f,
      properties: { ...(f.properties || {}) },
    }));
    setState({ filteredFeatures: clone, joined: false, results: {}, totals: null });
    renderFeatures(clone, st.filters.keyColumn);
    showToast(`${clone.length} recintos renderizados.`, 'success');

    // Habilita el bloque Excel.
    document.getElementById('excel-block')?.classList.remove('disabled');
  }

  function renderExcelControls(host) {
    host.innerHTML = '';
    const st = getState();
    const colOpts = st.excel.columns.map((c) => ({ value: c, label: c }));

    const keyCol = createSelect({
      id: 'xls-key-col',
      label: 'Llave primaria del Excel (para el JOIN)',
      placeholder: '— Selecciona —',
      options: colOpts,
      value: st.excel.keyColumn,
      onChange: (v) => patchBranch('excel', { keyColumn: v || null }),
    });

    const valCol = createSelect({
      id: 'xls-val-col',
      label: 'Columna de Capacidad / Valor nuevo',
      placeholder: '— Selecciona —',
      options: colOpts,
      value: st.excel.valueColumn,
      onChange: (v) => patchBranch('excel', { valueColumn: v || null }),
    });

    const joinBtn = createButton({
      label: 'Cruzar datos (JOIN)',
      variant: 'primary',
      onClick: doJoin,
    });

    host.append(keyCol.wrap, valCol.wrap, joinBtn);
  }

  function doJoin() {
    const st = getState();
    if (!st.filteredFeatures.length) {
      showToast('Primero aplica el filtro del GeoJSON.', 'warn');
      return;
    }
    if (!st.excel.keyColumn || !st.excel.valueColumn) {
      showToast('Selecciona la llave y la columna de valor del Excel.', 'warn');
      return;
    }
    const res = joinExcel(st.filteredFeatures, st.excel, st.filters.keyColumn);
    setState({
      joined: true,
      joinStats: { matched: res.matched, total: res.total },
      numericFields: res.numericFields,
    });
    if (res.matched === 0) {
      showToast('El cruce no coincidio con ningun recinto. Revisa las llaves.', 'warn');
    } else {
      showToast(
        `Cruce ejecutado: ${res.matched}/${res.total} recintos con dato.`,
        'success'
      );
    }
  }

  // Reacciona a resets globales.
  subscribe((state) => {
    if (!state.geojson) geoControls.innerHTML = '';
    if (!state.excel.columns.length) xlsControls.innerHTML = '';
  });
}
