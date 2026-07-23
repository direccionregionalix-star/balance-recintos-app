/**
 * uiComponents.js
 * Fabrica de componentes de UI reutilizables (sin framework)[cite: 2]. Cada helper
 * devuelve un elemento DOM o una pequeña API para manipularlo[cite: 2].
 */

import { escapeHtml, slug, getRecintoName, getComuna } from '../utils/helpers.js';

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

// NUEVO: Input de texto para los filtros
export function createInput({ id, label, type = 'text', placeholder, value, onChange }) {
  const wrap = el('div', 'field');
  wrap.innerHTML = `
    <label class="field-label" for="${id}">${escapeHtml(label)}</label>
    <input type="${type}" id="${id}" class="select" placeholder="${escapeHtml(placeholder || '')}" value="${escapeHtml(String(value || ''))}" style="padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; width: 100%; box-sizing: border-box;" />
  `;
  const input = wrap.querySelector('input');
  input.addEventListener('input', (e) => onChange?.(e.target.value));
  return { wrap, input };
}

export function createButton({ label, variant = 'primary', onClick, disabled, id }) {
  const btn = el('button', `btn btn-${variant}`);
  if (id) btn.id = id;
  btn.textContent = label;
  btn.disabled = !!disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Deriva el título (nombre del recinto) y subtítulo (comuna · ID) a partir de
 * las propiedades del feature (incluye lo traído del Excel en el cruce).
 * El ID queda como referencia secundaria.
 */
export function recintoLabels(properties, id) {
  const nombre = getRecintoName(properties);
  const comuna = getComuna(properties);
  const title = nombre || comuna || `Recinto ${id}`;
  const parts = [];
  if (comuna && comuna !== title) parts.push(comuna);
  if (id !== null && id !== undefined) parts.push(`ID: ${id}`);
  return { title, subtitle: parts.join(' · ') };
}

/**
 * Tarjeta de resultado por recinto. Muestra Nombre + Comuna como encabezado y
 * el ID como subtítulo. Si se pasa `onClick`, la tarjeta es interactiva y
 * expone `data-recinto-id` para el enlace bidireccional Mapa ↔ Tabla.
 */
export function resultCard({
  id, properties, value, status, statusLabel, color, a, b, aLabel, bLabel, onClick, edited,
}) {
  const card = el('div', `result-card status-${status}`);
  card.style.setProperty('--status-color', color);
  card.dataset.recintoId = id;

  const { title, subtitle } = recintoLabels(properties, id);
  const editedBadge = edited ? '<span class="edited-badge" title="Editado en línea">✎</span>' : '';

  card.innerHTML = `
    <div class="result-top">
      <div class="result-titles">
        <span class="result-name">${editedBadge}${escapeHtml(title)}</span>
        ${subtitle ? `<span class="result-sub">${escapeHtml(subtitle)}</span>` : ''}
      </div>
      <span class="result-chip" style="background:${color}22;color:${color}">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="result-value">${value}</div>
    <div class="result-meta">
      <span>${escapeHtml(aLabel)}: <b>${a}</b></span>
      <span>${escapeHtml(bLabel)}: <b>${b}</b></span>
    </div>
  `;

  if (typeof onClick === 'function') {
    card.classList.add('is-clickable');
    card.addEventListener('click', () => onClick(id));
  }
  return card;
}

export function statTile({ label, value, color }) {
  const t = el('div', 'stat-tile');
  if (color) t.style.setProperty('--tile-color', color);
  t.innerHTML = `
    <div class="stat-value">${escapeHtml(String(value))}</div>
    <div class="stat-label">${escapeHtml(label)}</div>
  `;
  return t;
}

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

export function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export { slug };
