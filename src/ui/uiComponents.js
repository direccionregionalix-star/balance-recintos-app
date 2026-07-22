/**
 * uiComponents.js
 * Fabrica de componentes de UI reutilizables (sin framework). Cada helper
 * devuelve un elemento DOM o una pequeña API para manipularlo. Mantiene el
 * markup consistente y las clases alineadas con el CSS.
 */

import { escapeHtml, slug } from '../utils/helpers.js';

/** Crea una tarjeta/seccion colapsable con titulo, paso y cuerpo. */
export function createSection({ step, title, subtitle }) {
  const section = el('section', 'card section');
  section.innerHTML = `
    <div class="section-head">
      <div class="step-badge">${escapeHtml(String(step))}</div>
      <div>
        <h2 class="section-title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="section-sub">${escapeHtml(subtitle)}</p>` : ''}
      </div>
    </div>
    <div class="section-body"></div>
  `;
  const body = section.querySelector('.section-body');
  return { section, body };
}

/** Input de archivo estilizado. */
export function createFileInput({ id, label, accept, onChange }) {
  const wrap = el('div', 'field');
  wrap.innerHTML = `
    <label class="field-label" for="${id}">${escapeHtml(label)}</label>
    <label class="file-drop" for="${id}">
      <span class="file-icon">⬆</span>
      <span class="file-text" id="${id}-text">Selecciona un archivo…</span>
      <input type="file" id="${id}" accept="${accept}" hidden />
    </label>
  `;
  const input = wrap.querySelector('input');
  const text = wrap.querySelector(`#${id}-text`);
  input.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) text.textContent = file.name;
    onChange?.(file);
  });
  return { wrap, input, setText: (t) => (text.textContent = t) };
}

/** Desplegable (select) con etiqueta. */
export function createSelect({ id, label, options = [], value, onChange, placeholder }) {
  const wrap = el('div', 'field');
  const optHtml = [
    placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : '',
    ...options.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}" ${
          String(o.value) === String(value) ? 'selected' : ''
        }>${escapeHtml(o.label)}</option>`
    ),
  ].join('');
  wrap.innerHTML = `
    <label class="field-label" for="${id}">${escapeHtml(label)}</label>
    <div class="select-wrap">
      <select id="${id}" class="select">${optHtml}</select>
    </div>
  `;
  const select = wrap.querySelector('select');
  select.addEventListener('change', (e) => onChange?.(e.target.value));
  return { wrap, select };
}

/** Boton generico. */
export function createButton({ label, variant = 'primary', onClick, disabled, id }) {
  const btn = el('button', `btn btn-${variant}`);
  if (id) btn.id = id;
  btn.textContent = label;
  btn.disabled = !!disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Tarjeta de resultado por recinto (Fase 2). */
export function resultCard({ id, value, status, statusLabel, color, a, b, aLabel, bLabel }) {
  const card = el('div', `result-card status-${status}`);
  card.style.setProperty('--status-color', color);
  card.innerHTML = `
    <div class="result-top">
      <span class="result-id">${escapeHtml(String(id))}</span>
      <span class="result-chip" style="background:${color}22;color:${color}">${escapeHtml(
    statusLabel
  )}</span>
    </div>
    <div class="result-value">${value}</div>
    <div class="result-meta">
      <span>${escapeHtml(aLabel)}: <b>${a}</b></span>
      <span>${escapeHtml(bLabel)}: <b>${b}</b></span>
    </div>
  `;
  return card;
}

/** Tarjeta de metrica global (KPI). */
export function statTile({ label, value, color }) {
  const t = el('div', 'stat-tile');
  if (color) t.style.setProperty('--tile-color', color);
  t.innerHTML = `
    <div class="stat-value">${escapeHtml(String(value))}</div>
    <div class="stat-label">${escapeHtml(label)}</div>
  `;
  return t;
}

/** Muestra un toast temporal. type: info | success | warn | error */
export function showToast(message, type = 'info', ms = 3600) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = el('div', `toast toast-${type}`);
  t.textContent = message;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/** Crea un elemento con clase. */
export function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export { slug };
