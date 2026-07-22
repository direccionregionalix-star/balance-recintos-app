/**
 * store.js
 * Store reactivo central (patron pub/sub). Es la unica fuente de verdad
 * del estado de la aplicacion. Los modulos se suscriben a cambios y
 * reaccionan de forma independiente, evitando acoplamiento directo.
 */

const initialState = () => ({
  // ---- Fase 1: carga GeoJSON ----
  geojson: null, // FeatureCollection cruda parseada
  geoProps: [], // llaves de propiedades del primer feature
  filters: {
    regionColumn: null,
    regionValue: null,
    keyColumn: null, // llave primaria en el GeoJSON
  },
  filteredFeatures: [], // features tras aplicar filtro de region

  // ---- Fase 1: carga Excel + cruce ----
  excel: {
    rows: [], // array de objetos (filas)
    columns: [], // encabezados
    keyColumn: null, // llave primaria en el Excel (para el JOIN)
    valueColumn: null, // columna de "Capacidad" / "Valor Nuevo"
  },
  joined: false, // indica si ya se ejecuto el cruce
  joinStats: { matched: 0, total: 0 },

  // ---- Fase 2: motor de calculo ----
  numericFields: [], // campos numericos disponibles tras el cruce
  calc: {
    varA: null,
    varB: null,
    operator: 'subtract', // subtract | add | percent
    done: false,
  },
  results: {}, // featureId -> { value, status, a, b }
  totals: null, // agregados globales

  // ---- Fase 4: seleccion espacial ----
  spatialSelection: null, // { ids:[], totals:{} }
});

let state = initialState();
const listeners = new Set();

/** Devuelve una referencia (no clon) al estado actual. Solo lectura. */
export function getState() {
  return state;
}

/**
 * Aplica un parche superficial (merge de primer nivel) y notifica.
 * @param {Object} patch
 */
export function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

/**
 * Actualiza una rama anidada del estado de forma inmutable.
 * @param {string} key rama de primer nivel (ej. 'filters', 'calc', 'excel')
 * @param {Object} patch
 */
export function patchBranch(key, patch) {
  state = { ...state, [key]: { ...state[key], ...patch } };
  emit();
}

/** Reinicia el estado a sus valores iniciales. */
export function resetState() {
  state = initialState();
  emit();
}

/**
 * Suscribe un listener. Devuelve funcion para desuscribir.
 * @param {(state:Object)=>void} fn
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      // Un listener fallido no debe tumbar al resto.
      console.error('[store] listener error:', err);
    }
  }
}
