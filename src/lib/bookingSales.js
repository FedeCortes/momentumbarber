// ─────────────────────────────────────────────────────────────────────────────
// Turno reservado → venta oficial / registro del barbero
//
// El cliente ya pagó el total por adelantado (transferencia o link de pago),
// así que el turno entra a la caja UNA sola vez, como una venta más:
//   · método de pago: «Transferencia» (o el que elija el admin)
//   · un servicio, al precio que pagó el cliente (puede ser el precio online)
//   · comisión del barbero: la de siempre para ese servicio (barber_services o su %)
//   · sin propina ni recargo (si el cliente deja propina o compra algo, se
//     carga aparte como una venta normal)
//   · booking_id: la base no deja cargar el mismo turno dos veces
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'
import { servicePct, overridesByBarber } from './earnings'
import { dateKeyAR } from './booking'

/** Método de pago para turnos prepagos: el que diga «transf», si no el primero que no sea efectivo */
export function prepaidMethod(methods) {
  const active = (methods || []).filter(m => m.is_active !== false)
  return active.find(m => /transf/i.test(m.name))
      || active.find(m => !/efectivo/i.test(m.name))
      || active[0] || null
}

/** Datos para calcular comisiones de varios turnos de una */
export async function loadBookingSaleContext(tenantId) {
  const [b, s, o, pm] = await Promise.all([
    supabase.from('barbers').select('*').eq('tenant_id', tenantId),
    supabase.from('services').select('*').eq('tenant_id', tenantId),
    supabase.from('barber_services').select('*').eq('tenant_id', tenantId),
    supabase.from('payment_methods').select('*').eq('tenant_id', tenantId).order('sort_order'),
  ])
  if (b.error || s.error || pm.error) throw new Error('No se pudieron cargar los datos de la barbería')
  return {
    barbers: b.data || [],
    services: s.data || [],
    overrides: overridesByBarber(o.data || []),
    methods: (pm.data || []).filter(m => m.is_active !== false),
  }
}

/** Reparto del turno entre barbero y local, igual que una venta normal */
export function bookingSplit(booking, ctx) {
  const barber  = ctx.barbers.find(b => b.id === booking.barber_id) || null
  const service = ctx.services.find(s => s.id === booking.service_id) || null
  const price   = Number(booking.price || 0)
  const pct     = barber && service ? servicePct(service, barber, ctx.overrides[barber.id]) : Number(barber?.commission_pct || 0)
  const forBarber = Math.round(price * pct / 100 * 100) / 100
  return { barber, service, price, pct, forBarber, forShop: price - forBarber }
}

function itemFor(booking, split) {
  if (!booking.service_id) return null   // el servicio se borró: queda solo el total
  return {
    item_type: 'service',
    item_id: booking.service_id,
    name: booking.service_name,
    price: split.price,
    quantity: 1,
    commission_pct: split.barber ? split.pct : null,
  }
}

function niceError(error) {
  const m = String(error?.message || error || '')
  if (/sales_booking_uq|drafts_booking_uq|duplicate key/i.test(m)) return 'Ese turno ya estaba cargado.'
  if (/booking_id/i.test(m)) return 'Falta correr la migración «reservas v2» en Supabase.'
  return 'No se pudo cargar el turno. Probá de nuevo.'
}

/** Crea la venta oficial de un turno. Devuelve la venta. */
export async function createSaleFromBooking(booking, ctx, paymentMethodId) {
  const split = bookingSplit(booking, ctx)
  const { data: sale, error } = await supabase.from('sales').insert({
    tenant_id: booking.tenant_id,
    barber_id: booking.barber_id,
    payment_method_id: paymentMethodId || prepaidMethod(ctx.methods)?.id || null,
    tip: 0,
    total_services: split.price,
    total_products: 0,
    total_drinks: 0,
    barber_earnings: split.forBarber,
    shop_earnings: split.forShop,
    surcharge_amt: 0,
    sale_date: dateKeyAR(booking.starts_at),
    booking_id: booking.id,
    ...(booking.customer_id ? { customer_id: booking.customer_id } : {}),
  }).select().single()
  if (error) throw new Error(niceError(error))
  const item = itemFor(booking, split)
  if (item) {
    const r = await supabase.from('sale_items').insert({ ...item, sale_id: sale.id })
    if (r.error) {
      await supabase.from('sales').delete().eq('id', sale.id)   // no dejar una venta a medias
      throw new Error(niceError(r.error))
    }
  }
  return sale
}

/** Crea el registro (borrador) del barbero para un turno. Devuelve el registro. */
export async function createDraftFromBooking(booking, ctx, paymentMethodId) {
  const split = bookingSplit(booking, ctx)
  const { data: draft, error } = await supabase.from('drafts').insert({
    tenant_id: booking.tenant_id,
    barber_id: booking.barber_id,
    draft_date: dateKeyAR(booking.starts_at),
    payment_method_id: paymentMethodId || prepaidMethod(ctx.methods)?.id || null,
    tip: 0,
    total_services: split.price,
    total_products: 0,
    total_drinks: 0,
    surcharge_amt: 0,
    booking_id: booking.id,
  }).select().single()
  if (error) throw new Error(niceError(error))
  const item = itemFor(booking, split)
  if (item) {
    const r = await supabase.from('draft_items').insert({ ...item, draft_id: draft.id })
    if (r.error) {
      await supabase.from('drafts').delete().eq('id', draft.id)
      throw new Error(niceError(r.error))
    }
  }
  return draft
}
