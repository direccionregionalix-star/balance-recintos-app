/**
 * supabaseClient.js
 * Cliente Supabase para la persistencia compartida (observaciones y ediciones).
 *
 * La URL y la clave publicable son datos publicos por diseño (la seguridad la
 * imponen las policies RLS en la base). Se pueden sobreescribir con variables
 * de entorno de Vite (VITE_SUPABASE_URL / VITE_SUPABASE_KEY) sin tocar código.
 */

import { createClient } from '@supabase/supabase-js';

const URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://cbqpeusznwotoeftkegw.supabase.co';
const KEY =
  import.meta.env.VITE_SUPABASE_KEY ||
  'sb_publishable_jp4zBRi9mDjZREBckfkyIA_kZ0dcHon';

// Cliente único de la app. Si por alguna razón faltara la config, exportamos
// null y el resto de la app degrada con elegancia (features online desactivadas).
export const supabase =
  URL && KEY ? createClient(URL, KEY, { auth: { persistSession: false } }) : null;

export const backendDisponible = !!supabase;
