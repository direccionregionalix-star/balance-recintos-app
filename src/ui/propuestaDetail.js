/**
 * propuestaDetail.js
 * v1.4c — Ficha editable de una propuesta: estado, capacidad, recintos que
 * descongestiona (alivio) y observación. Persiste y refresca el what-if.
 */

import { getState, setState } from '../state/store.js';
import { escapeHtml } from '../utils/helpers.js';
import { updatePropuesta, deletePropuesta } from '../services/backendService.js';
import { renderPropuestas, highlightPropuestaLinks, clearPropuestaLinks } from '../services/mapService.js';
import { showToast } from './uiComponents.js';

const ESTADOS = [
  ['propuesto', 'Propuesto'],
  ['en_evaluacion', 'En evaluación'],
  ['aprobado', 'Aprobado'],
  ['descartado', 'Descartado'],
];

let overlay = null;
let bodyEl = null;
let currentId = null;
let alivioDraft = []; // edición local de [{cod, mesas}]

export function mountPropuestaDetail() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'propuesta-modal';
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <button class="modal-close" title="Cerrar">×</button>
      <div class="modal-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  bodyEl = overlay.querySelector('.modal-body');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal-close').addEventListener('click', close);
}

function close() {
  overlay?.classList.add('hidden');
  currentId = null;
  clearPropuestaLinks();
}

export function openPropuesta(id) {
  if (!overlay) mountPropuestaDetail();
  const p = getState().backend.propuestas.find((x) => String(x.id) === String(id));
  if (!p) return;
  currentId = id;
  alivioDraft = Array.isArray(p.alivio) ? p.alivio.map((a) => ({ ...a })) : [];
  render(p);
  overlay.classList.remove('hidden');
  highlightPropuestaLinks(p);
}

function render(p) {
  bodyEl.innerHTML = `
    <div class="modal-head" style="--status-color:#7c3aed">
      <div>
        <h3 class="modal-title">${escapeHtml(p.nombre)}</h3>
        <div class="modal-sub">${[p.comuna, p.sector].filter(Boolean).map(escapeHtml).join(' · ')}</div>
      </div>
    </div>

    <div class="modal-section" style="border-top:none;padding-top:0">
      <div class="edit-grid">
        <label>Estado
          <select id="prop-estado">
            ${ESTADOS.map(([v, t]) => `<option value="${v}" ${p.estado === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <label>Capacidad (mesas)
          <input type="number" id="prop-cap" value="${p.capacidad_mesas ?? ''}">
        </label>
      </div>
    </div>

    <div class="modal-section">
      <h4>Descongestiona a (recintos)</h4>
      <div id="alivio-list"></div>
      <button class="btn btn-ghost btn-block" id="alivio-add">+ Agregar recinto</button>
      <p class="hint">Cada fila: código de recinto y cuántas mesas de demanda se le trasladan. Se usa en el what-if (solo si la propuesta está <b>Aprobada</b>).</p>
    </div>

    <div class="modal-section">
      <h4>Observación</h4>
      <textarea id="prop-obs" rows="2">${escapeHtml(p.observacion || '')}</textarea>
    </div>

    <button class="btn btn-primary btn-block" id="prop-save">Guardar cambios</button>
    <button class="btn btn-ghost btn-block" id="prop-del" style="margin-top:8px;color:#dc2626">Eliminar propuesta</button>
  `;
  renderAlivio();
  wire();
}

function renderAlivio() {
  const host = bodyEl.querySelector('#alivio-list');
  host.innerHTML = '';
  alivioDraft.forEach((a, i) => {
    const row = document.createElement('div');
    row.className = 'alivio-row';
    row.innerHTML = `
      <input type="text" placeholder="cod_recinto" value="${escapeHtml(a.cod ?? '')}" data-k="cod" data-i="${i}">
      <input type="number" placeholder="mesas" value="${a.mesas ?? ''}" data-k="mesas" data-i="${i}">
      <button data-del="${i}" title="Quitar">🗑</button>`;
    host.appendChild(row);
  });
  host.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      const i = +e.target.dataset.i, k = e.target.dataset.k;
      alivioDraft[i][k] = k === 'mesas' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value.trim();
    });
  });
  host.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => { alivioDraft.splice(+btn.dataset.del, 1); renderAlivio(); });
  });
}

function wire() {
  bodyEl.querySelector('#alivio-add').addEventListener('click', () => {
    alivioDraft.push({ cod: '', mesas: null });
    renderAlivio();
  });

  bodyEl.querySelector('#prop-save').addEventListener('click', async () => {
    const patch = {
      estado: bodyEl.querySelector('#prop-estado').value,
      capacidad_mesas: numOrNull(bodyEl.querySelector('#prop-cap').value),
      alivio: alivioDraft.filter((a) => a.cod),
      observacion: bodyEl.querySelector('#prop-obs').value.trim() || null,
    };
    const row = await updatePropuesta(currentId, patch);
    if (!row) { showToast('No se pudo guardar.', 'error'); return; }
    applyPropuesta(row);
    showToast('Propuesta actualizada.', 'success');
    render(row);
    highlightPropuestaLinks(row);
  });

  bodyEl.querySelector('#prop-del').addEventListener('click', async () => {
    if (!window.confirm('¿Eliminar esta propuesta?')) return;
    const ok = await deletePropuesta(currentId);
    if (!ok) { showToast('No se pudo eliminar.', 'error'); return; }
    const st = getState();
    const propuestas = st.backend.propuestas.filter((x) => String(x.id) !== String(currentId));
    setState({ backend: { ...st.backend, propuestas }, backendVersion: st.backendVersion + 1 });
    renderPropuestas(propuestas);
    showToast('Propuesta eliminada.', 'success');
    close();
  });
}

/** Reemplaza la propuesta en el store, re-dibuja y fuerza recálculo what-if. */
function applyPropuesta(row) {
  const st = getState();
  const propuestas = st.backend.propuestas.map((x) => (String(x.id) === String(row.id) ? row : x));
  setState({ backend: { ...st.backend, propuestas }, backendVersion: st.backendVersion + 1 });
  renderPropuestas(propuestas);
}

function numOrNull(v) {
  const s = String(v).trim();
  return s === '' ? null : Number(s);
}
