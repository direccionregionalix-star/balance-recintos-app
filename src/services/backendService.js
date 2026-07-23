/**
 * backendService.js
 * Capa de acceso a datos sobre Supabase. Toda la app usa estas funciones y
 * nunca el cliente directamente. Si el backend no responde, las funciones
 * degradan con elegancia (devuelven vacío / false) para no romper la app.
 */

import { supabase, backendDisponible } from './supabaseClient.js';

/** Carga todas las ediciones y las indexa por cod_recinto. */
export async function fetchEdiciones() {
  if (!backendDisponible) return {};
  try {
    const { data, error } = await supabase.from('br_ediciones').select('*');
    if (error) throw error;
    const map = {};
    for (const row of data || []) map[String(row.cod_recinto)] = row;
    return map;
  } catch (err) {
    console.warn('[backend] fetchEdiciones:', err.message);
    return {};
  }
}

/** Carga todas las observaciones y las agrupa por cod_recinto (más recientes primero). */
export async function fetchObservaciones() {
  if (!backendDisponible) return {};
  try {
    const { data, error } = await supabase
      .from('br_observaciones')
      .select('*')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    const map = {};
    for (const row of data || []) {
      const k = String(row.cod_recinto);
      (map[k] = map[k] || []).push(row);
    }
    return map;
  } catch (err) {
    console.warn('[backend] fetchObservaciones:', err.message);
    return {};
  }
}

/**
 * Inserta/actualiza la edición de un recinto (capacidad, conteo, color).
 * Devuelve la fila resultante o null.
 */
export async function upsertEdicion(codRecinto, patch, autor) {
  if (!backendDisponible) return null;
  try {
    const payload = {
      cod_recinto: String(codRecinto),
      ...patch,
      actualizado_por: autor || null,
      actualizado_en: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('br_ediciones')
      .upsert(payload, { onConflict: 'cod_recinto' })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[backend] upsertEdicion:', err.message);
    return null;
  }
}

/**
 * Inserta/actualiza muchas ediciones de una vez (importación de fichas).
 * @param {Array<Object>} list filas { cod_recinto, capacidad_real, ... }
 * @returns {Promise<Array>} filas resultantes (vacío si falla)
 */
export async function bulkUpsertEdiciones(list) {
  if (!backendDisponible || !Array.isArray(list) || !list.length) return [];
  try {
    const now = new Date().toISOString();
    const payload = list.map((x) => ({ ...x, actualizado_en: now }));
    const { data, error } = await supabase
      .from('br_ediciones')
      .upsert(payload, { onConflict: 'cod_recinto' })
      .select();
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[backend] bulkUpsertEdiciones:', err.message);
    return [];
  }
}

/** Agrega una observación a un recinto. Devuelve la fila creada o null. */
export async function addObservacion({ codRecinto, comentario, esSolucion, autor }) {
  if (!backendDisponible) return null;
  try {
    const { data, error } = await supabase
      .from('br_observaciones')
      .insert({
        cod_recinto: String(codRecinto),
        comentario,
        es_solucion: !!esSolucion,
        autor: autor || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[backend] addObservacion:', err.message);
    return null;
  }
}

/** Elimina una observación por id. Devuelve true/false. */
export async function deleteObservacion(id) {
  if (!backendDisponible) return false;
  try {
    const { error } = await supabase.from('br_observaciones').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[backend] deleteObservacion:', err.message);
    return false;
  }
}

export { backendDisponible };
