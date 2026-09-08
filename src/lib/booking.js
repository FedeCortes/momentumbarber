// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de la agenda de turnos (compartidas entre la página pública de
// reserva y la agenda del admin).
// ─────────────────────────────────────────────────────────────────────────────

export const WEEKDAYS = [
  { i: 1, short: 'Lun', long: 'Lunes' },
  { i: 2, short: 'Mar', long: 'Martes' },
  { i: 3, short: 'Mié', long: 'Miércoles' },
  { i: 4, short: 'Jue', long: 'Jueves' },
  { i: 5, short: 'Vie', long: 'Viernes' },
  { i: 6, short: 'Sáb', long: 'Sábado' },
  { i: 0, short: 'Dom', long: 'Domingo' },
]

export const STATUS_LABEL = {
  pending:   'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Atendido',
  no_show:   'No vino',
}

// Clase de badge (definidas en index.css) por estado
export const STATUS_BADGE = {
  pending:   'badge-pending',
  confirmed: 'badge-active',
  cancelled: 'badge-inactive',
  completed: 'badge-active',
  no_show:   'badge-inactive',
}

const DTF_TIME = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
const DTF_DAY  = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
const DTF_DAY_SHORT = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })

export const capFirst = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
export const fmtTime = d => DTF_TIME.format(new Date(d))
export const fmtDay  = d => capFirst(DTF_DAY.format(new Date(d)))
export const fmtDayShort = d => DTF_DAY_SHORT.format(new Date(d))
// Abreviatura de día de la semana, solo letras ("lun", "mié")
export const weekdayAbbr = d =>
  DTF_DAY_SHORT.format(new Date(d)).split(/[\s,]+/)[0].replace(/[^\p{L}]/gu, '')

// 'YYYY-MM-DD' local (sin corrimiento de zona)
export function toDateKey(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export const addDays  = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const isSameDay = (a, b) => toDateKey(a) === toDateKey(b)

// Franja del día para agrupar slots
export function dayPart(d) {
  const h = new Date(d).getHours()
  if (h < 12) return 'Mañana'
  if (h < 18) return 'Tarde'
  return 'Noche'
}

// Normaliza un teléfono a dígitos con código de país AR por defecto (54)
export function waNumber(phone) {
  if (!phone) return ''
  let n = String(phone).replace(/\D/g, '')
  if (n.startsWith('0')) n = n.slice(1)
  if (!n.startsWith('54')) n = '54' + n
  return n
}

// Clave para identificar al cliente: número nacional (sin 54, sin 0 inicial).
// DEBE dar el mismo resultado que public.norm_phone() en Supabase.
export function normPhone(phone) {
  let n = String(phone || '').replace(/\D/g, '')
  n = n.replace(/^54/, '').replace(/^0/, '')
  return n || null
}

// Alta/actualización de cliente por teléfono (usa el RPC customer_upsert).
// Devuelve el customer_id, o null si el teléfono no sirve para identificar.
export async function customerUpsert(supabase, { tenantId, phone, name, email }) {
  if (!normPhone(phone)) return null
  const { data, error } = await supabase.rpc('customer_upsert', {
    p_tenant: tenantId, p_phone: phone || '', p_name: name || '', p_email: email || '',
  })
  if (error) { console.warn('customer_upsert:', error.message); return null }
  return data || null
}

// Busca clientes del tenant por nombre o teléfono. Devuelve hasta `limit`.
export async function customerSearch(supabase, tenantId, term, limit = 8) {
  let query = supabase.from('customers').select('*').eq('tenant_id', tenantId)
  const t = (term || '').trim()
  if (t) {
    const key = normPhone(t)
    query = key
      ? query.or(`name.ilike.%${t}%,phone_key.ilike.%${key}%`)
      : query.ilike('name', `%${t}%`)
  }
  const { data } = await query.order('updated_at', { ascending: false }).limit(limit)
  return data || []
}

// Registra un canje (RPC customer_redeem). Devuelve true si salió bien.
export async function customerRedeem(supabase, customerId) {
  const { error } = await supabase.rpc('customer_redeem', { p_customer: customerId })
  if (error) throw new Error(error.message)
  return true
}

export function waLink(phone, text) {
  const n = waNumber(phone)
  if (!n) return ''
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function telLink(phone) {
  return `tel:${String(phone || '').replace(/[^\d+]/g, '')}`
}

// Link "Agregar a Google Calendar"
export function googleCalLink({ title, details, start, end, location }) {
  const fmt = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Turno',
    dates: `${fmt(start)}/${fmt(end)}`,
    details: details || '',
    location: location || '',
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-AR')}`
}

export function fmtDuration(min) {
  const m = Number(min) || 0
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
