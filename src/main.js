/**
 * main.js
 * Punto de entrada. Inicializa el mapa, monta los paneles de cada fase y
 * conecta el store con la UI. La orquestacion vive aqui; la logica en los
 * servicios/modulos.
 */

import './styles/main.css';

import { getState, setState } from './state/store.js';
import { initMap, setOnFeatureSelect, setOnPropuestaSelect, renderPropuestas } from './services/mapService.js';
import { mountPhase1 } from './ui/phase1_load.js';
import { mountPhase2 } from './ui/phase2_calc.js';
import { mountPhase3 } from './ui/phase3_export.js';
import { mountPhase4 } from './ui/phase4_spatial.js';
import { mountRecintoDetail, openRecinto } from './ui/recintoDetail.js';
import { mountFichasImport } from './ui/fichasImport.js';
import { mountPropuestasImport } from './ui/propuestasImport.js';
import { mountPropuestaDetail, openPropuesta } from './ui/propuestaDetail.js';
import {
  fetchEdiciones,
  fetchObservaciones,
  fetchPropuestas,
  backendDisponible,
} from './services/backendService.js';
import { showToast } from './ui/uiComponents.js';
import { VERSION } from './version.js';

function bootstrap() {
  // 0) Identidad simple por sesión (para trazar quién edita/observa).
  ensureSessionName();
  showVersion();

  // 1) Mapa base.
  initMap('map');

  // 2) Paneles de control (35% derecha).
  const panel = document.getElementById('panel-scroll');
  mountPhase1(panel);
  mountFichasImport(panel); // v1.4a: actualización de capacidad por fichas
  mountPhase2(panel);
  mountPhase4(panel); // seleccion espacial
  mountPropuestasImport(panel); // v1.4c: candidatos para descongestionar
  mountPhase3(panel); // exportacion al final del flujo

  // 3) Fichas modales + enlaces desde el mapa.
  mountRecintoDetail();
  mountPropuestaDetail();
  setOnFeatureSelect(openRecinto);
  setOnPropuestaSelect(openPropuesta);

  // 4) Carga inicial de datos colaborativos (no bloquea el arranque).
  loadBackend();

  // Asegura que Leaflet calcule bien su tamaño tras el layout.
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

/** Muestra la versión en el encabezado (única fuente: version.js). */
function showVersion() {
  const sub = document.querySelector('.app-header .subtitle');
  if (sub) sub.textContent = `Análisis espacial & capacidad electoral · v${VERSION}`;
}

/** Pide (una vez) el nombre del funcionario y lo recuerda en el navegador. */
function ensureSessionName() {
  let nombre = '';
  try {
    nombre = localStorage.getItem('br_session_name') || '';
  } catch {
    /* localStorage no disponible */
  }
  if (!nombre) {
    const input = window.prompt(
      'Bienvenido/a a Balance de Recintos.\nEscribe tu nombre (queda registrado en tus observaciones y ediciones):',
      ''
    );
    nombre = (input || '').trim();
    try {
      if (nombre) localStorage.setItem('br_session_name', nombre);
    } catch {
      /* noop */
    }
  }
  setState({ session: { nombre: nombre || 'anónimo' } });
}

/** Trae ediciones y observaciones existentes y las deja en el store. */
async function loadBackend() {
  if (!backendDisponible) {
    showToast('Sin backend: modo solo lectura local.', 'warn');
    return;
  }
  try {
    const [ediciones, observaciones, propuestas] = await Promise.all([
      fetchEdiciones(),
      fetchObservaciones(),
      fetchPropuestas(),
    ]);
    const st = getState();
    setState({
      backend: { ediciones, observaciones, propuestas },
      backendVersion: st.backendVersion + 1,
    });
    renderPropuestas(propuestas); // dibuja los candidatos existentes
  } catch (err) {
    console.warn('[main] loadBackend:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
