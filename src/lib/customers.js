// ─────────────────────────────────────────────────────────────────────────────
// Clientes
//
// Un cliente tiene nombre y, opcionalmente, celular. El celular se guarda
// también normalizado (phone_key) para no cargar dos veces a la misma persona.
// Las visitas son las ventas oficiales que tienen ese cliente (sales.customer_id).
// Cliente NUEVO en un período = su primera visita cae dentro de ese período,
// salvo que esté marcado como «ya venía antes» (existing_before): esos ya eran
// clientes del local antes de usar la app y nunca cuentan como nuevos.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

/** Solo dígitos, sin 54 ni 0 inicial. null si no queda nada. */
export function normPhone(phone) {
  let n = String(phone || '').replace(/\D/g, '')
  n = n.replace(/^54/, '').replace(/^9/, '').replace(/^0/, '')
  return n || null
}

/** Link de WhatsApp (Argentina) o '' si no hay celular */
export function waLink(phone) {
  const key = normPhone(phone)
  return key ? `https://wa.me/549${key}` : ''
}

// Saca caracteres que rompen el filtro de búsqueda de Supabase
function cleanTerm(t) {
  return String(t || '').replace(/[%,()*\\]/g, ' ').trim()
}

/** Busca clientes por nombre o celular */
export async function searchCustomers(tenantId, term, limit = 8) {
  let query = supabase.from('customers').select('*').eq('tenant_id', tenantId)
  const t = cleanTerm(term)
  if (t) {
    const key = normPhone(t)
    query = key && key.length >= 3
      ? query.or(`name.ilike.%${t}%,phone_key.ilike.%${key}%`)
      : query.ilike('name', `%${t}%`)
  }
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}

/**
 * Crea un cliente. Si ya hay uno con ese celular, devuelve ese (sin duplicar).
 * @returns { customer, existed }
 */
export async function createCustomer(tenantId, { name, phone, existing_before }) {
  const cleanName = String(name || '').trim()
  if (!cleanName) throw new Error('El nombre es obligatorio')
  const key = normPhone(phone)

  if (key) {
    const { data: found, error } = await supabase.from('customers').select('*')
      .eq('tenant_id', tenantId).eq('phone_key', key).maybeSingle()
    if (error) throw error
    if (found) return { customer: found, existed: true }
  }

  const { data, error } = await supabase.from('customers').insert({
    tenant_id: tenantId,
    name: cleanName,
    phone: String(phone || '').trim() || null,
    phone_key: key,
    existing_before: !!existing_before,
  }).select().single()
  if (error) throw error
  return { customer: data, existed: false }
}

/** Actualiza nombre / celular. Avisa si el celular ya es de otro cliente. */
export async function updateCustomer(tenantId, id, { name, phone, existing_before }) {
  const cleanName = String(name || '').trim()
  if (!cleanName) throw new Error('El nombre es obligatorio')
  const key = normPhone(phone)
  if (key) {
    const { data: other } = await supabase.from('customers').select('id,name')
      .eq('tenant_id', tenantId).eq('phone_key', key).neq('id', id).maybeSingle()
    if (other) throw new Error(`Ese celular ya es de ${other.name || 'otro cliente'}`)
  }
  const { data, error } = await supabase.from('customers').update({
    name: cleanName,
    phone: String(phone || '').trim() || null,
    phone_key: key,
    existing_before: !!existing_before,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Trae todas las filas de una consulta, de a 1000 (límite de Supabase) */
export async function fetchAllRows(build) {
  const out = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < page) break
  }
  return out
}

/**
 * Clientes atendidos en un período y cuáles son nuevos.
 * @param sales ventas del período (con customer_id)
 * @returns { attended: [ids], newIds: Set, customers: { [id]: customer } }
 */
export async function customerStatsForRange(tenantId, sales, from) {
  const ids = [...new Set((sales || []).map(s => s.customer_id).filter(Boolean))]
  if (ids.length === 0) return { attended: [], newIds: new Set(), customers: {} }

  const returning = new Set()
  const customers = {}
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    const [prev, info] = await Promise.all([
      fetchAllRows(() => supabase.from('sales').select('customer_id').eq('tenant_id', tenantId)
        .in('customer_id', chunk).lt('sale_date', from).order('id')),
      supabase.from('customers').select('id,name,phone,existing_before').in('id', chunk),
    ])
    if (info.error) throw info.error
    for (const r of prev) returning.add(r.customer_id)
    for (const c of info.data || []) {
      customers[c.id] = c
      if (c.existing_before) returning.add(c.id)   // ya venía antes de la app
    }
  }
  return { attended: ids, newIds: new Set(ids.filter(id => !returning.has(id))), customers }
}

/**
 * Crecimiento de clientes para el Dashboard: nuevos este mes y nuevos desde
 * que se empezó a cargar clientes (primera venta con cliente = la mudanza).
 * Los marcados "ya venía antes" nunca cuentan.
 * @returns { since, newTotal, newMonth } — since = null si todavía no hay ventas con cliente
 */
export async function customerGrowth(tenantId, monthStart) {
  const [visits, before] = await Promise.all([
    fetchAllRows(() => supabase.from('sales').select('customer_id,sale_date')
      .eq('tenant_id', tenantId).not('customer_id', 'is', null).order('id')),
    fetchAllRows(() => supabase.from('customers').select('id')
      .eq('tenant_id', tenantId).eq('existing_before', true).order('id')),
  ])
  const first = {}
  for (const v of visits) {
    if (!first[v.customer_id] || v.sale_date < first[v.customer_id]) first[v.customer_id] = v.sale_date
  }
  const dates = Object.values(first)
  if (dates.length === 0) return { since: null, newTotal: 0, newMonth: 0 }
  const old = new Set(before.map(c => c.id))
  const fresh = Object.entries(first).filter(([id]) => !old.has(id)).map(([, d]) => d)
  return {
    since:    dates.reduce((a, b) => (a < b ? a : b)),
    newTotal: fresh.length,
    newMonth: fresh.filter(d => d >= monthStart).length,
  }
}
