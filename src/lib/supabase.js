import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Pasa casi siempre en un deploy sin las variables cargadas.
  const msg =
    'Faltan las variables de entorno de Supabase (VITE_SUPABASE_URL / ' +
    'VITE_SUPABASE_ANON_KEY). En local: archivo .env en la raíz. ' +
    'En Netlify: Site settings → Environment variables, y re-deployá.'
  console.error(msg)
  if (typeof document !== 'undefined') {
    document.body.innerHTML =
      `<div style="font-family:system-ui;max-width:34rem;margin:15vh auto;padding:0 1.5rem;color:#111">
        <h1 style="font-size:1.1rem;margin:0 0 .5rem">Configuración incompleta</h1>
        <p style="color:#555;line-height:1.5;font-size:.9rem">${msg}</p>
      </div>`
  }
  throw new Error(msg)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
