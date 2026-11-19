// ─────────────────────────────────────────────────────────────────────────────
// Reservas online
//
// La página pública (/reservar/<slug>) no tiene login de Supabase: habla solo
// con las funciones rsv_* (security definer). El cliente se identifica con su
// WhatsApp; el servidor devuelve un token que se guarda en este navegador y
// funciona como su perfil (customers.booking_token).
//
// Todas las horas se muestran en hora de Argentina, sin importar dónde esté
// el teléfono del cliente.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

export const TZ = 'America/Argentina/Buenos_Aires'

export const STATUS = {
  pending:   { label: 'Pendiente de confirmar', short: 'Pendiente',  cls: 'badge-pending' },
  confirmed: { label: 'Confirmado',              short: 'Confirmado', cls: 'badge-active' },
  rejected:  { label: 'Rechazado',               short: 'Rechazado',  cls: 'badge-inactive' },
  cancelled: { label: 'Cancelado',               short: 'Cancelado',  cls: 'badge-inactive' },
}

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function money(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export function durationLabel(min) {
  const m = Number(min || 0)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

// ── Fechas en hora de Argentina ──────────────────────────────
const fmtCache = {}
function fmt(opts) {
  const k = JSON.stringify(opts)
  return (fmtCache[k] ||= new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...opts }))
}
/** "14:30" */
export const timeAR = d => fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d))
/** "2026-11-20" (día en Argentina) */
export function dateKeyAR(d = new Date()) {
  const p = Object.fromEntries(fmt({ year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(d)).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
const cap = t => t.charAt(0).toUpperCase() + t.slice(1)
/** "Jueves 20 de noviembre" */
export const longDateAR = d => cap(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d)).replace(',', ''))
/** Para un "YYYY-MM-DD": { dow: 'jue', day: '20', month: 'nov' } */
export function dayParts(key) {
  const d = new Date(key + 'T12:00:00-03:00')
  return {
    dow:   fmt({ weekday: 'short' }).format(d).replace('.', ''),
    day:   fmt({ day: 'numeric' }).format(d),
    month: fmt({ month: 'short' }).format(d).replace('.', ''),
    long:  cap(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d).replace(',', '')),
  }
}
/** "YYYY-MM-DD" + "HH:MM" (hora AR) → Date */
export const fromLocalAR = (dateKey, hhmm) => new Date(`${dateKey}T${hhmm}:00-03:00`)
export function addDaysKey(key, n) {
  const d = new Date(key + 'T12:00:00-03:00')
  d.setUTCDate(d.getUTCDate() + n)
  return dateKeyAR(d)
}

// ── Sesión del cliente (por barbería) ───────────────────────
const sessKey = slug => `mb_rsv_${slug}`
export function loadClient(slug) {
  try { return JSON.parse(localStorage.getItem(sessKey(slug)) || 'null') } catch { return null }
}
export function saveClient(slug, data) {
  try { data ? localStorage.setItem(sessKey(slug), JSON.stringify(data)) : localStorage.removeItem(sessKey(slug)) } catch {}
}

// ── Llamadas ────────────────────────────────────────────────
function cleanError(error) {
  const msg = String(error?.message || error || '')
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisá internet y probá de nuevo.'
  return msg || 'Algo falló. Probá de nuevo.'
}
async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(cleanError(error))
  return data
}

export const fetchShop  = slug => rpc('rsv_shop', { p_slug: slug })
export const fetchDays  = (slug, serviceId, barberId) =>
  rpc('rsv_days', { p_slug: slug, p_service: serviceId, p_barber: barberId || null })
export const fetchSlots = (slug, serviceId, barberId, dateKey) =>
  rpc('rsv_slots', { p_slug: slug, p_service: serviceId, p_barber: barberId || null, p_date: dateKey })
/**
 * Grilla del día con libres y ocupados: [{ starts_at, barber_id, free }].
 * Si la migración v2 no corrió todavía, cae a los libres de siempre.
 */
export async function fetchGrid(slug, serviceId, barberId, dateKey) {
  const args = { p_slug: slug, p_service: serviceId, p_barber: barberId || null, p_date: dateKey }
  const { data, error } = await supabase.rpc('rsv_grid', args)
  if (!error) return data || []
  const rows = await fetchSlots(slug, serviceId, barberId, dateKey)
  return (rows || []).map(r => ({ ...r, free: true }))
}
export const login      = (slug, phone, name) =>
  rpc('rsv_login', { p_slug: slug, p_phone: phone, p_name: name || null })
export const fetchMe    = token => rpc('rsv_me', { p_token: token })
export const rename     = (token, name) => rpc('rsv_rename', { p_token: token, p_name: name })
export const cancelBooking = (token, id) => rpc('rsv_cancel', { p_token: token, p_id: id })
export const book = ({ token, slug, serviceId, barberId, startsAt, receiptPath }) =>
  rpc('rsv_book', {
    p_token: token, p_slug: slug, p_service: serviceId, p_barber: barberId || null,
    p_starts_at: startsAt, p_receipt_path: receiptPath,
  })

// Comprobante: imágenes se achican (sin recortar); PDF va tal cual.
function shrinkKeepRatio(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo leer la imagen'))), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Esa imagen no se puede abrir')) }
    img.src = url
  })
}
export async function uploadReceipt(tenantId, file) {
  if (!file) throw new Error('Elegí el comprobante')
  const isPdf = file.type === 'application/pdf'
  if (!isPdf && !/^image\//.test(file.type)) throw new Error('Subí una foto o captura, o un PDF')
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo pesa demasiado (máx. 10 MB)')
  const body = isPdf ? file : await shrinkKeepRatio(file)
  const ext = isPdf ? 'pdf' : 'jpg'
  const rnd = (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2))
  const path = `${tenantId}/${dateKeyAR()}/${rnd}.${ext}`
  const { error } = await supabase.storage.from('booking-receipts')
    .upload(path, body, { contentType: isPdf ? 'application/pdf' : 'image/jpeg', upsert: false })
  if (error) throw new Error(cleanError(error))
  return path
}

/** Link firmado (10 min) para que la barbería vea un comprobante */
export async function receiptUrl(path) {
  const { data, error } = await supabase.storage.from('booking-receipts').createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}

/** Link de WhatsApp a un número de Argentina con texto */
export function waTo(phone, text) {
  let n = String(phone || '').replace(/\D/g, '')
  n = n.replace(/^54/, '').replace(/^9/, '').replace(/^0/, '')
  if (!n) return ''
  return `https://wa.me/549${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
