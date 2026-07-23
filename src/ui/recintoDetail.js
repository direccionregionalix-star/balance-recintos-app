/**
 * recintoDetail.js
 * Ficha del recinto (modal): observaciones colaborativas + edición de
 * capacidad/conteo + marcado de "solución" (recolorea). Todo se persiste en
 * Supabase y actualiza el store para que el cálculo y el mapa reaccionen.
 */

import { getState, setState } from '../state/store.js';
import { getFeatureId, STATUS } from '../services/dataProcessing.js';
import {
  getRecintoName,
  getComuna,
  getLat,
  getLon,
  escapeHtml,
  fmt,
} from '../utils/helpers.js';
import {
  upsertEdicion,
  addObservacion,
  deleteObservacion,
  backendDisponible,
} from '../services/backendService.js';
import { showToast } from './uiComponents.js';

let overlay = null;
let bodyEl = null;
let currentId = null;

/** Crea el modal (oculto) una sola vez. */
export function mountRecintoDetail() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'recinto-modal';
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <button class="modal-close" title="Cerrar">×</button>
      <div class="modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  bodyEl = overlay.querySelector('.modal-body');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.modal-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
  });
}

function close() {
  overlay?.classList.add('hidden');
  currentId = null;
}

/** Abre la ficha de un recinto por su id. */
export function openRecinto(id) {
  if (!overlay) mountRecintoDetail();
  if (id === null || id === undefined) return;
  currentId = String(id);
  render();
  overlay.classList.remove('hidden');
}

/** Busca el feature actual por id. */
function findFeature(id) {
  const st = getState();
  return st.filteredFeatures.find((f) => getFeatureId(f, st.filters.keyColumn) === String(id));
}

function render() {
  const st = getState();
  const id = currentId;
  const feature = findFeature(id);
  const props = feature?.properties || {};
  const r = st.results?.[id] || {};
  const edicion = st.backend.ediciones?.[id] || {};
  const observaciones = st.backend.observaciones?.[id] || [];
  const s = STATUS[r.status] || STATUS.sinDato;

  const nombre = getRecintoName(props) || `Recinto ${id}`;
  const comuna = getComuna(props);
  const lat = getLat(props);
  const lon = getLon(props);

  // Valores efectivos (edición si existe, si no el del archivo).
  const capActual = edicion.capacidad_real ?? '';
  const conteoActual = edicion.conteo ?? (r.conteo ?? '');
  const resuelto =
    edicion.estado_override === 'resuelto' || observaciones.some((o) => o.es_solucion);

  const modBadge = edicion.actualizado_en
    ? `<div class="mod-info">Última modificación: <b>${escapeHtml(edicion.actualizado_por || 'anónimo')}</b> · ${fechaCorta(edicion.actualizado_en)}</div>`
    : '';

  const offlineWarn = backendDisponible
    ? ''
    : '<div class="offline-warn">Sin conexión al backend: los cambios no se guardarán en línea.</div>';

  bodyEl.innerHTML = `
    <div class="modal-head" style="--status-color:${s.color}">
      <div>
        <h3 class="modal-title">${escapeHtml(nombre)}</h3>
        <div class="modal-sub">${comuna ? escapeHtml(comuna) + ' · ' : ''}ID: ${escapeHtml(String(id))}</div>
      </div>
      <span class="result-chip" style="background:${s.color}22;color:${s.color}">${escapeHtml(s.label)}</span>
    </div>

    ${r.value !== null && r.value !== undefined
      ? `<div class="modal-metrics">
           <div><span>Balance</span><b style="color:${s.color}">${r.value > 0 ? '+' : ''}${fmt(r.value)} electores</b></div>
           <div><span>Mesas físicas</span><b>${r.mesasFisicas ?? '—'}</b></div>
           <div><span>Coordenada</span><b>${lat !== null && lon !== null ? `${lat.toFixed(4)}, ${lon.toFixed(4)}` : 'sin dato'}</b></div>
         </div>`
      : ''}

    ${offlineWarn}

    <div class="modal-section">
      <h4>Editar datos del recinto</h4>
      <div class="edit-grid">
        <label>Capacidad real
          <input type="number" id="edit-cap" value="${capActual}" placeholder="${r.mesasFisicas != null ? 'del archivo' : ''}">
        </label>
        <label>Conteo (demanda)
          <input type="number" id="edit-conteo" value="${conteoActual}">
        </label>
      </div>
      <label class="chk"><input type="checkbox" id="edit-resuelto" ${resuelto ? 'checked' : ''}> Marcar como "con solución" (recolorea a morado)</label>
      ${modBadge}
      <button class="btn btn-primary btn-block" id="save-edit">Guardar cambios</button>
    </div>

    <div class="modal-section">
      <h4>Observaciones del equipo (${observaciones.length})</h4>
      <div class="obs-list">
        ${observaciones.length
          ? observaciones.map((o) => obsRow(o)).join('')
          : '<p class="hint">Aún no hay observaciones. Registra el conocimiento del terreno aquí.</p>'}
      </div>
      <textarea id="obs-text" rows="3" placeholder="Ej: El gimnasio anexo permite habilitar 4 mesas más en elecciones."></textarea>
      <label class="chk"><input type="checkbox" id="obs-sol"> Esta observación ofrece una solución al colapso</label>
      <button class="btn btn-accent btn-block" id="add-obs">Agregar observación</button>
    </div>
  `;

  wire(id);
}

function obsRow(o) {
  const chip = o.es_solucion
    ? `<span class="obs-chip">Solución</span>`
    : '';
  return `
    <div class="obs-item ${o.es_solucion ? 'is-sol' : ''}">
      <div class="obs-top">
        <span class="obs-autor">${escapeHtml(o.autor || 'anónimo')}</span>
        ${chip}
        <span class="obs-fecha">${fechaCorta(o.creado_en)}</span>
        <button class="obs-del" data-obs-id="${o.id}" title="Eliminar">🗑</button>
      </div>
      <div class="obs-text">${escapeHtml(o.comentario)}</div>
    </div>
  `;
}

function wire(id) {
  const autor = getState().session?.nombre || '';

  bodyEl.querySelector('#save-edit')?.addEventListener('click', async () => {
    const capRaw = bodyEl.querySelector('#edit-cap').value.trim();
    const conteoRaw = bodyEl.querySelector('#edit-conteo').value.trim();
    const resuelto = bodyEl.querySelector('#edit-resuelto').checked;
    const patch = {
      capacidad_real: capRaw === '' ? null : Number(capRaw),
      conteo: conteoRaw === '' ? null : Number(conteoRaw),
      estado_override: resuelto ? 'resuelto' : null,
    };
    const row = await upsertEdicion(id, patch, autor);
    if (row) {
      updateBackend({ ediciones: { ...getState().backend.ediciones, [id]: row } });
      showToast('Cambios guardados en línea.', 'success');
      render();
    } else {
      showToast('No se pudieron guardar los cambios.', 'error');
    }
  });

  bodyEl.querySelector('#add-obs')?.addEventListener('click', async () => {
    const texto = bodyEl.querySelector('#obs-text').value.trim();
    const esSolucion = bodyEl.querySelector('#obs-sol').checked;
    if (!texto) {
      showToast('Escribe una observación.', 'warn');
      return;
    }
    const row = await addObservacion({ codRecinto: id, comentario: texto, esSolucion, autor });
    if (row) {
      const obs = getState().backend.observaciones;
      updateBackend({ observaciones: { ...obs, [id]: [row, ...(obs[id] || [])] } });
      showToast('Observación registrada.', 'success');
      render();
    } else {
      showToast('No se pudo registrar la observación.', 'error');
    }
  });

  bodyEl.querySelectorAll('.obs-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const obsId = btn.getAttribute('data-obs-id');
      const ok = await deleteObservacion(obsId);
      if (ok) {
        const obs = getState().backend.observaciones;
        updateBackend({
          observaciones: {
            ...obs,
            [id]: (obs[id] || []).filter((o) => String(o.id) !== String(obsId)),
          },
        });
        render();
      } else {
        showToast('No se pudo eliminar.', 'error');
      }
    });
  });
}

/** Actualiza la rama backend y fuerza el recálculo (backendVersion++). */
function updateBackend(patch) {
  const st = getState();
  setState({
    backend: { ...st.backend, ...patch },
    backendVersion: st.backendVersion + 1,
  });
}

function fechaCorta(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}
