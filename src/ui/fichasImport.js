/**
 * fichasImport.js
 * v1.4a — Importación masiva de fichas comunales para actualizar la
 * "Capacidad real" (en mesas) de los recintos existentes.
 *
 * Flujo: cargar Plantilla 1 → cruzar por cod_recinto (tolerante a ceros a la
 * izquierda) → vista previa (cuántos casan / no casan) → aplicar. Al aplicar,
 * escribe las capacidades en `br_ediciones` (mismo mecanismo que la edición
 * manual, reversible por recinto) y recalcula el balance.
 */

import { getState, setState, subscribe } from '../state/store.js';
import {
  createSection,
  createFileInput,
  createButton,
  showToast,
  el,
} from './uiComponents.js';
import { readExcel } from '../services/excelService.js';
import { getFeatureId, guessColumn } from '../services/dataProcessing.js';
import { normalizeCode, toNumber, escapeHtml } from '../utils/helpers.js';
import {
  bulkUpsertEdiciones,
  addObservacion,
  backendDisponible,
} from '../services/backendService.js';

export function mountFichasImport(container) {
  const { section, body } = createSection({
    step: '1b',
    title: 'Importar fichas de capacidad',
    subtitle: 'Actualiza la Capacidad real (mesas) en lote',
  });
  section.classList.add('locked');
  container.appendChild(section);

  const hint = el('p', 'hint');
  hint.innerHTML =
    'Carga la <b>Plantilla 1</b> (fichas). Se cruza por <b>cod_recinto</b> y el valor de ' +
    '<b>CAPACIDAD_REAL_DEFINIDA_jefe</b> reemplaza la capacidad del recinto. ' +
    'Calcula con la variable de capacidad <b>en mesas</b> para que sea coherente.';

  const fileInput = createFileInput({
    id: 'fichas-file',
    label: 'Archivo de fichas (.xlsx)',
    accept: '.xlsx,.xls,.csv',
    onChange: handleFile,
  });

  const preview = el('div', 'fichas-preview');
  body.append(hint, fileInput.wrap, preview);

  let parsed = null; // { matched:[], unmatched:[], skipped:number }

  async function handleFile(file) {
    if (!file) return;
    const st = getState();
    if (!st.filteredFeatures.length || !st.filters.keyColumn) {
      showToast('Primero carga y filtra el GeoJSON (Fase 1).', 'warn');
      return;
    }
    try {
      const { columns, rows } = await readExcel(file);
      const codCol = guessColumn(columns, ['cod_recint', 'cod_recinto', 'codigo_rec', 'cod_rec', 'codigo', 'cod']);
      const capCol = guessColumn(columns, [
        'capacidad_real_definida', 'definida_jefe', 'capacidad_real_nueva',
        'capacidad_definida', 'capacidad_real', 'capacidad',
      ]);
      const obsCol = guessColumn(columns, ['observacion', 'observaciones', 'obs']);
      const potCol = guessColumn(columns, ['potencial_gimnasio', 'potencial', 'gimnasio']);
      const fechaCol = guessColumn(columns, ['fecha_ficha', 'fecha']);

      if (!codCol || !capCol) {
        showToast('No encuentro las columnas cod_recinto y/o capacidad en el archivo.', 'error');
        return;
      }

      // Índice de la capa por código normalizado (sin ceros a la izquierda).
      const index = new Map();
      for (const f of st.filteredFeatures) {
        const id = getFeatureId(f, st.filters.keyColumn);
        const k = normalizeCode(id);
        if (k !== null) index.set(k, { feature: f, id });
      }

      const toApply = []; // cruza y tiene valor -> se aplica
      const unmatched = []; // código no existe en la capa
      let matchedNoValue = 0; // cruza pero sin capacidad escrita aún

      for (const row of rows) {
        const codRaw = row[codCol];
        const k = normalizeCode(codRaw);
        const hit = k !== null ? index.get(k) : null;
        if (!hit) {
          // Solo reporta como "sin coincidencia" si la fila trae algún código.
          if (k !== null) unmatched.push(String(codRaw ?? '').trim());
          continue;
        }
        const cap = toNumber(row[capCol]);
        if (cap === null) {
          matchedNoValue++; // cruza, pero falta llenar la capacidad
          continue;
        }
        toApply.push({
          id: hit.id, // id real de la capa (para escribir la edición)
          codigo: String(codRaw ?? '').trim(),
          capacidad: cap,
          observacion: obsCol ? String(row[obsCol] ?? '').trim() : '',
          potencial: potCol ? row[potCol] : '',
          fecha: fechaCol ? row[fechaCol] : '',
        });
      }

      parsed = { toApply, unmatched, matchedNoValue };
      renderPreview();
    } catch (err) {
      console.error(err);
      showToast('No se pudo leer el archivo de fichas.', 'error');
    }
  }

  function renderPreview() {
    preview.innerHTML = '';
    if (!parsed) return;
    const { toApply, unmatched, matchedNoValue } = parsed;

    const resumen = el('div', 'fichas-stats');
    resumen.innerHTML = `
      <span class="ok">${toApply.length} para aplicar</span>
      <span class="muted">${matchedNoValue} cruzan sin valor</span>
      <span class="warn">${unmatched.length} sin coincidencia</span>
    `;
    preview.appendChild(resumen);

    // Guía cuando los códigos cruzan pero falta escribir la capacidad.
    if (!toApply.length && matchedNoValue > 0) {
      const tip = el('p', 'hint');
      tip.innerHTML =
        `Los códigos <b>sí cruzan</b> (${matchedNoValue}). Falta llenar la columna ` +
        `<b>CAPACIDAD_REAL_DEFINIDA_jefe</b> en las filas que quieras actualizar y volver a subir el archivo.`;
      preview.appendChild(tip);
    }

    if (unmatched.length) {
      const u = el('details', 'fichas-unmatched');
      u.innerHTML =
        `<summary>Códigos que no cruzan (${unmatched.length})</summary>` +
        `<div>${unmatched.map((c) => escapeHtml(c || '(vacío)')).join(', ')}</div>`;
      preview.appendChild(u);
    }

    if (toApply.length) {
      const list = el('div', 'fichas-matched');
      list.innerHTML = toApply
        .slice(0, 8)
        .map((m) => `<div><b>${escapeHtml(m.codigo)}</b> → ${m.capacidad} mesas</div>`)
        .join('') + (toApply.length > 8 ? `<div class="muted">…y ${toApply.length - 8} más</div>` : '');
      preview.appendChild(list);

      if (!backendDisponible) {
        const w = el('div', 'offline-warn');
        w.textContent = 'Sin conexión al backend: no se pueden aplicar los cambios.';
        preview.appendChild(w);
      } else {
        const btn = createButton({
          label: `Aplicar ${toApply.length} actualizaciones`,
          variant: 'accent',
          onClick: apply,
        });
        btn.classList.add('btn-block');
        preview.appendChild(btn);
      }
    }
  }

  async function apply() {
    if (!parsed || !parsed.toApply.length) return;
    const st = getState();
    const autor = `${st.session?.nombre || 'anónimo'} · ficha`;

    const ediciones = parsed.toApply.map((m) => ({
      cod_recinto: String(m.id),
      capacidad_real: m.capacidad,
      actualizado_por: autor,
    }));

    showToast('Aplicando fichas…', 'info');
    const saved = await bulkUpsertEdiciones(ediciones);
    if (!saved.length) {
      showToast('No se pudieron guardar las capacidades.', 'error');
      return;
    }

    // Deja trazabilidad como observación en las filas que traen texto/potencial.
    for (const m of parsed.toApply) {
      const notas = [];
      if (m.potencial !== '' && m.potencial != null) notas.push(`Potencial gimnasio: ${m.potencial} mesas`);
      if (m.fecha !== '' && m.fecha != null) notas.push(`Ficha: ${m.fecha}`);
      if (m.observacion) notas.push(m.observacion);
      if (!notas.length) continue;
      const row = await addObservacion({
        codRecinto: m.id,
        comentario: `Capacidad actualizada a ${m.capacidad} mesas por ficha. ${notas.join(' · ')}`,
        esSolucion: false,
        autor,
      });
      if (row) {
        const obs = getState().backend.observaciones;
        obs[m.id] = [row, ...(obs[m.id] || [])];
      }
    }

    // Fusiona ediciones en el store y fuerza el recálculo.
    const ed = { ...getState().backend.ediciones };
    for (const r of saved) ed[String(r.cod_recinto)] = r;
    const cur = getState();
    setState({
      backend: { ...cur.backend, ediciones: ed },
      backendVersion: cur.backendVersion + 1,
    });

    showToast(`${saved.length} capacidades actualizadas y recalculadas.`, 'success');
    fileInput.setText('Selecciona un archivo…');
    parsed = null;
    preview.innerHTML = '';
  }

  // Se habilita cuando ya hay recintos cargados y filtrados.
  subscribe((state) => {
    if (state.filteredFeatures.length && state.filters.keyColumn) {
      section.classList.remove('locked');
    } else {
      section.classList.add('locked');
    }
  });
}
