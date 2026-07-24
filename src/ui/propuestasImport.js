/**
 * propuestasImport.js
 * v1.4c — Importa la Plantilla 2 (recintos candidatos) a `br_propuestas`.
 * Parsea nombre/comuna/sector, coordenada (lat/lon o pegado de Maps),
 * capacidad y los códigos que descongestiona.
 */

import { getState, setState } from '../state/store.js';
import { createSection, createFileInput, createButton, showToast, el } from './uiComponents.js';
import { readExcel } from '../services/excelService.js';
import { guessColumn } from '../services/dataProcessing.js';
import { toNumber, getLat, getLon } from '../utils/helpers.js';
import { bulkInsertPropuestas, backendDisponible } from '../services/backendService.js';
import { renderPropuestas } from '../services/mapService.js';

export function mountPropuestasImport(container) {
  const { section, body } = createSection({
    step: '4b',
    title: 'Importar propuestas (nuevos recintos)',
    subtitle: 'Candidatos para descongestionar el colapso',
  });
  container.appendChild(section);

  const hint = el('p', 'hint');
  hint.innerHTML =
    'Carga la <b>Plantilla 2</b>. Cada candidato se dibuja en el mapa (rombo) con ' +
    'su ubicación y a qué recinto(s) descongestiona. La simulación what-if se activa en la Fase 2.';

  const fileInput = createFileInput({
    id: 'propuestas-file',
    label: 'Archivo de propuestas (.xlsx)',
    accept: '.xlsx,.xls,.csv',
    onChange: handleFile,
  });
  const preview = el('div', 'fichas-preview');
  body.append(hint, fileInput.wrap, preview);

  let parsed = null;

  async function handleFile(file) {
    if (!file) return;
    try {
      const { columns, rows } = await readExcel(file);
      const col = {
        nombre: guessColumn(columns, ['nombre']),
        comuna: guessColumn(columns, ['comuna']),
        sector: guessColumn(columns, ['sector_o_localidad', 'sector', 'localidad']),
        lat: guessColumn(columns, ['latitud', 'lat']),
        lon: guessColumn(columns, ['longitud', 'lon', 'lng']),
        coord: guessColumn(columns, ['coordenada_maps', 'coordenada']),
        cap: guessColumn(columns, ['capacidad_propuesta', 'capacidad']),
        desc: guessColumn(columns, ['descongestiona']),
        estado: guessColumn(columns, ['estado']),
        obs: guessColumn(columns, ['observacion']),
      };
      if (!col.nombre) {
        showToast('No encuentro la columna "nombre" en el archivo.', 'error');
        return;
      }

      const listas = [];
      let sinCoord = 0;
      for (const row of rows) {
        const nombre = String(row[col.nombre] ?? '').trim();
        if (!nombre) continue;
        const { lat, lon } = leerCoord(row, col);
        if (lat === null || lon === null) { sinCoord++; continue; }

        const capacidad = col.cap ? toNumber(row[col.cap]) : null;
        const alivio = parseAlivio(col.desc ? row[col.desc] : '', capacidad);
        listas.push({
          nombre,
          comuna: col.comuna ? String(row[col.comuna] ?? '').trim() : null,
          sector: col.sector ? String(row[col.sector] ?? '').trim() : null,
          lat, lon,
          capacidad_mesas: capacidad,
          estado: (col.estado && String(row[col.estado] ?? '').trim()) || 'propuesto',
          alivio,
          observacion: col.obs ? String(row[col.obs] ?? '').trim() : null,
        });
      }
      parsed = { listas, sinCoord };
      renderPreview();
    } catch (err) {
      console.error(err);
      showToast('No se pudo leer el archivo de propuestas.', 'error');
    }
  }

  function renderPreview() {
    preview.innerHTML = '';
    if (!parsed) return;
    const { listas, sinCoord } = parsed;
    const stats = el('div', 'fichas-stats');
    stats.innerHTML =
      `<span class="ok">${listas.length} con coordenada</span>` +
      `<span class="warn">${sinCoord} sin coordenada (se omiten)</span>`;
    preview.appendChild(stats);

    if (listas.length && backendDisponible) {
      const btn = createButton({
        label: `Importar ${listas.length} propuestas`,
        variant: 'accent',
        onClick: importar,
      });
      btn.classList.add('btn-block');
      preview.appendChild(btn);
    } else if (!backendDisponible) {
      const w = el('div', 'offline-warn');
      w.textContent = 'Sin conexión al backend: no se pueden importar.';
      preview.appendChild(w);
    }
  }

  async function importar() {
    if (!parsed?.listas.length) return;
    const autor = `${getState().session?.nombre || 'anónimo'}`;
    const payload = parsed.listas.map((p) => ({ ...p, autor }));
    showToast('Importando propuestas…', 'info');
    const saved = await bulkInsertPropuestas(payload);
    if (!saved.length) {
      showToast('No se pudieron importar las propuestas.', 'error');
      return;
    }
    const st = getState();
    const propuestas = [...st.backend.propuestas, ...saved];
    setState({ backend: { ...st.backend, propuestas } });
    renderPropuestas(propuestas);
    showToast(`${saved.length} propuestas importadas y dibujadas.`, 'success');
    parsed = null;
    preview.innerHTML = '';
    fileInput.setText('Selecciona un archivo…');
  }
}

/** Lee lat/lon de columnas dedicadas o del pegado de Maps ("lat, lon"). */
function leerCoord(row, col) {
  let lat = col.lat ? toNumber(row[col.lat]) : null;
  let lon = col.lon ? toNumber(row[col.lon]) : null;
  if ((lat === null || lon === null) && col.coord) {
    const raw = String(row[col.coord] ?? '').trim();
    const m = raw.split(',');
    if (m.length >= 2) {
      lat = toNumber(m[0]);
      lon = toNumber(m[1]);
    }
  }
  // Fallback: propiedades sueltas tipo __lat/__lon si vinieran.
  if (lat === null) lat = getLat(row);
  if (lon === null) lon = getLon(row);
  return { lat, lon };
}

/** Convierte "02596; 02917" en [{cod, mesas}], repartiendo la capacidad. */
function parseAlivio(raw, capacidad) {
  const cods = String(raw ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!cods.length) return [];
  const porCada = capacidad ? Math.max(1, Math.round(capacidad / cods.length)) : 0;
  return cods.map((cod) => ({ cod, mesas: porCada }));
}
