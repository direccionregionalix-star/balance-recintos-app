/**
 * store.js
 * Store reactivo central (patron pub/sub). Es la unica fuente de verdad
 * del estado de la aplicacion[cite: 1]. Los modulos se suscriben a cambios y
 * reaccionan de forma independiente, evitando acoplamiento directo[cite: 1].
 */

const initialState = () => ({
  // ---- Fase 1: carga GeoJSON ----
  geojson: null,
  geoProps: [],
  filters: {
    regionColumn: null,
    regionValue: null,
    keyColumn: null,
  },
  filteredFeatures: [],

  // ---- Fase 1: carga Excel + cruce ----
  excel: {
    rows: [],
    columns: [],
    keyColumn: null,
    valueColumn: null,
    nameColumn: null, // columna del Excel con el nombre del recinto
    comunaColumn: null, // columna del Excel con la comuna
    latColumn: null, // columna de latitud
    lonColumn: null, // columna de longitud
  },
  joined: false,
  joinStats: { matched: 0, total: 0 },

  // ---- Fase 2: motor de calculo ----
  numericFields: [],
  calc: {
    mode: 'electoral', // electoral | symbology
    varCapacidad: null,
    varConteo: null,
    isTables: false,
    electorsPerTable: 400,
    done: false,
  },
  
  // ---- Filtros de Vista (desplegables en cascada) ----
  viewFilters: {
    comuna: '', // comuna seleccionada
    recinto: '', // recinto seleccionado (acotado por la comuna)
    statusFilter: '', // aislar solo "sobrecupo" / "holgura" / etc.
  },

  results: {},
  totals: null,

  // ---- Fase 4: seleccion espacial ----
  spatialSelection: null,

  // ---- Colaboracion online (Supabase) ----
  session: { nombre: '' }, // identidad simple por sesion
  backend: {
    ediciones: {}, // cod_recinto -> { capacidad_real, conteo, estado_override, actualizado_por, actualizado_en }
    observaciones: {}, // cod_recinto -> [ { id, comentario, es_solucion, autor, creado_en } ]
  },
  backendVersion: 0, // se incrementa para forzar recálculo tras un cambio online
});

let state = initialState();
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

export function patchBranch(key, patch) {
  state = { ...state, [key]: { ...state[key], ...patch } };
  emit();
}

export function resetState() {
  state = initialState();
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('[store] listener error:', err);
    }
  }
}
