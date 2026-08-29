import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Consultas con reintento.
//
// La conexión del local suele ser inestable y Supabase a veces tarda: una
// consulta puede fallar (error de red) o volver con error puntual. Sin
// reintento, la pantalla se quedaba a medias (p. ej. Registros "solo con lo
// del local" porque no cargó la lista de barberos) y sin avisar.
//
//   const barberos = await q(s => s.from('barbers').select('*').eq('tenant_id', id))
// ─────────────────────────────────────────────────────────────────────────────
export async function q(build, { tries = 3, delay = 500 } = {}) {
  let lastError
  for (let i = 0; i < tries; i++) {
    try {
      const res = await build(supabase)
      if (!res || !res.error) return res ? res.data : null
      lastError = res.error
    } catch (e) {
      lastError = e
    }
    if (i < tries - 1) await new Promise(r => setTimeout(r, delay * (i + 1)))
  }
  throw lastError || new Error('La consulta falló')
}

// Varias consultas en paralelo, todas con reintento. Si alguna agota los
// reintentos, se rechaza el conjunto (para mostrar "reintentar" en vez de
// datos incompletos).
export function qAll(builds, opts) {
  return Promise.all(builds.map(b => q(b, opts)))
}
