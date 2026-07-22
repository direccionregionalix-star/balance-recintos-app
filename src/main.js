/**
 * main.js
 * Punto de entrada. Inicializa el mapa, monta los paneles de cada fase y
 * conecta el store con la UI. La orquestacion vive aqui; la logica en los
 * servicios/modulos.
 */

import './styles/main.css';

import { initMap } from './services/mapService.js';
import { mountPhase1 } from './ui/phase1_load.js';
import { mountPhase2 } from './ui/phase2_calc.js';
import { mountPhase3 } from './ui/phase3_export.js';
import { mountPhase4 } from './ui/phase4_spatial.js';

function bootstrap() {
  // 1) Mapa base.
  initMap('map');

  // 2) Paneles de control (35% derecha).
  const panel = document.getElementById('panel-scroll');
  mountPhase1(panel);
  mountPhase2(panel);
  mountPhase4(panel); // seleccion espacial
  mountPhase3(panel); // exportacion al final del flujo

  // Asegura que Leaflet calcule bien su tamaño tras el layout.
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
