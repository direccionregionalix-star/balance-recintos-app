# Changelog — Balance de Recintos

Registro de versiones. El número visible aparece en el encabezado de la app
(fuente única: `src/version.js`).

## v1.5.0
- **Propuestas de nuevos recintos (v1.4c):** importa la Plantilla 2 y dibuja
  los candidatos como rombos en el mapa (coloreados por estado). Ficha editable
  por propuesta: estado, capacidad (mesas), recintos que descongestiona (alivio)
  y observación; con líneas al/los recinto(s) que alivia. Persistente en
  `br_propuestas`.
- **Simulación what-if:** toggle "Simular propuestas aprobadas" que traslada la
  demanda descongestionada de los recintos y recalcula el balance en vivo.

## v1.4.0
- **Importador de fichas de capacidad (v1.4a):** carga masiva de la planilla de
  fichas comunales; cruce por `cod_recinto` tolerante a ceros a la izquierda;
  vista previa (cuántos cruzan / no cruzan / sin valor) antes de aplicar.
  Actualiza la "Capacidad real" en lote (vía `br_ediciones`) con trazabilidad
  y recalcula el balance.
- Badge de versión visible en el encabezado + este CHANGELOG.

## v1.3.0
- **Colaboración online (Supabase):** observaciones por recinto, edición de
  capacidad/conteo y estado "Con solución propuesta", persistentes y
  compartidos. Identidad simple por nombre de sesión.
- **Punto de ubicación** por recinto usando lat/lon del Excel.
- Ficha de recinto (modal) con observaciones + edición + trazabilidad
  (quién y cuándo).

## v1.2.0
- Nombres de recinto desde el Excel; filtros como desplegables en cascada
  (Comuna → Recinto); auto-detección de columnas en la carga.

## v1.1.0
- Filtrado profundo (KPIs + mapa reaccionan al filtro) y bidireccionalidad
  Mapa ↔ Tabla (clic en tarjeta enfoca el mapa; clic en polígono resalta la
  tarjeta).

## v1.0.0
- App base: carga GeoJSON + Excel, motor de cálculo electoral, exportación a
  Excel y dibujo/selección espacial.
