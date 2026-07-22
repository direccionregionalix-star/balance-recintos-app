# Balance de Recintos · Análisis Espacial

Aplicación web para el **análisis espacial y balance de capacidad de recintos
electorales**. Cruza una capa geográfica (GeoJSON) con una tabla de capacidad
(Excel), calcula balances por recinto, pinta un semáforo en el mapa y permite
seleccionar áreas dibujadas a mano alzada para recalcular subconjuntos.

Construida con **Vanilla JS modular + Vite** (sin framework): para una app
centrada en un mapa Leaflet, el manejo imperativo del mapa + un *store*
reactivo central resulta más robusto y liviano que React, evitando la fricción
entre el ciclo de reconciliación y el DOM que Leaflet administra por su cuenta.

---

## Stack

| Capa | Librería |
|------|----------|
| Build / dev server | [Vite](https://vitejs.dev) |
| Mapas | [Leaflet.js](https://leafletjs.com) |
| Dibujo en mapa | [Leaflet-Geoman](https://geoman.io) |
| Análisis espacial | [Turf.js](https://turfjs.org) |
| Lectura/exportación Excel | [SheetJS (xlsx)](https://sheetjs.com) |
| Servidor estático (Railway) | [serve](https://www.npmjs.com/package/serve) |

---

## Flujo funcional (4 fases)

1. **Carga y parametrización** — Cargas un GeoJSON; la app lee dinámicamente
   las propiedades del primer *feature* y genera desplegables para elegir la
   columna de Región, el valor a filtrar y la llave primaria. Aplicas el filtro
   y los polígonos se renderizan con `fitBounds`. Luego cargas un Excel y eliges
   su llave y su columna de capacidad para ejecutar el **cruce (JOIN)** en memoria.
2. **Motor de cálculo** — Eliges dos variables numéricas y un operador
   (**Resta** = disponibilidad, **Suma**, **Porcentaje** de ocupación). Se
   calcula el balance por recinto, se pintan tarjetas y se repinta el mapa según
   el estado: 🟢 Holgura · 🟡 Límite · 🔴 Sobrecupo/Déficit.
3. **Exportación** — Botón que genera un `.xlsx` con dos hojas (detalle por
   recinto + resumen agregado) vía SheetJS.
4. **Geoprocesamiento al vuelo** — Dibujas un polígono/rectángulo; Turf.js
   identifica qué recintos caen dentro (`intersect` con respaldo por centroide y
   `booleanPointInPolygon`) y recalcula los totales sólo de esa selección en un
   cuadro resumen flotante.

> **Robustez:** si un valor viene nulo, una llave no cruza o una geometría es
> inválida, el recinto se **omite silenciosamente** sin romper la ejecución.

---

## Estructura del proyecto

```
balance-recintos-app/
├── index.html                 # Layout 65% mapa / 35% panel
├── package.json
├── vite.config.js
├── railway.json               # Configuración de build/deploy en Railway
├── src/
│   ├── main.js                # Orquestador: inicializa mapa y monta fases
│   ├── state/
│   │   └── store.js           # Store reactivo central (pub/sub)
│   ├── services/
│   │   ├── mapService.js      # Leaflet + Geoman (imperativo)
│   │   ├── dataProcessing.js  # Filtro, JOIN, motor de cálculo, estados
│   │   ├── excelService.js    # SheetJS: lectura + exportación
│   │   └── spatialService.js  # Turf.js: selección espacial
│   ├── ui/
│   │   ├── uiComponents.js    # Fábrica de componentes reutilizables
│   │   ├── phase1_load.js     # Fase 1
│   │   ├── phase2_calc.js     # Fase 2
│   │   ├── phase3_export.js   # Fase 3
│   │   └── phase4_spatial.js  # Fase 4
│   ├── utils/
│   │   └── helpers.js         # Utilidades puras (parseo de números, etc.)
│   └── styles/
│       └── main.css           # Sistema visual
```

---

## Puesta en marcha (este repositorio)

```bash
# 1. Instala dependencias
npm install

# 2. Levanta el servidor de desarrollo (http://localhost:5173)
npm run dev

# 3. Compila para producción
npm run build

# 4. Previsualiza el build localmente
npm run preview
```

---

## Reproducir el andamiaje desde cero

Si quieres partir de un proyecto Vite vacío antes de pegar el código de `src/`,
estos son los comandos **exactos**:

```bash
# 1. Crea el proyecto Vite (plantilla vanilla)
npm create vite@latest balance-recintos-app -- --template vanilla

cd balance-recintos-app

# 2. Instala las dependencias de runtime
npm install leaflet @geoman-io/leaflet-geoman-free @turf/turf xlsx serve

# 3. Instala Vite como dependencia de desarrollo (ya viene con la plantilla)
npm install -D vite

# 4. Arranca en desarrollo
npm run dev
```

Luego reemplaza `index.html`, `package.json` (scripts) y el contenido de `src/`
por el de este repositorio, y agrega `vite.config.js` y `railway.json`.

---

## Despliegue en Railway

El repositorio ya incluye `railway.json`. Railway (Nixpacks) detecta Node,
ejecuta el build y sirve el estático:

- **Build:** `npm run build` → genera `dist/`
- **Start:** `npm run start` → `serve -s dist -l $PORT`

Pasos:

1. Sube el repositorio a GitHub.
2. En Railway: **New Project → Deploy from GitHub repo** y elige este repo.
3. Railway leerá `railway.json` automáticamente. No requiere variables de
   entorno adicionales (`serve` usa el `PORT` que Railway inyecta).
4. Al terminar el deploy, abre la URL pública generada.

> `serve` sirve la SPA sin depender del host, por lo que funciona con cualquier
> dominio que asigne Railway sin configuración extra.

---

## Notas técnicas

- **Parseo tolerante de números:** `helpers.toNumber` normaliza miles/decimales
  en formatos `1.234,56` y `1,234.56`, y trata el punto como separador de miles
  en patrones inequívocos (`1.200` → 1200), acorde al formato es-CL.
- **Estado central:** todo pasa por `store.js`; los módulos se suscriben y
  reaccionan de forma independiente, sin acoplarse entre sí.
- **Mapa imperativo:** ningún módulo toca la instancia de Leaflet directamente;
  sólo llama a la API de `mapService.js`.
