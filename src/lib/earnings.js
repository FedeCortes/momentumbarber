// ─────────────────────────────────────────────────────────────────────────────
// Comisiones por barbero y servicio
//
// Cada barbero tiene un % general. Además puede tener, para servicios puntuales,
// un % propio y/o tenerlos deshabilitados (tabla barber_services).
//
// Sin fila en barber_services → el servicio le aparece y paga su % general.
// ─────────────────────────────────────────────────────────────────────────────

/** Filas de barber_services → { [service_id]: fila } */
export function overridesMap(rows) {
  return Object.fromEntries((rows || []).map(r => [r.service_id, r]))
}

/** Filas de barber_services de varios barberos → { [barber_id]: { [service_id]: fila } } */
export function overridesByBarber(rows) {
  const out = {}
  for (const r of rows || []) {
    ;(out[r.barber_id] ||= {})[r.service_id] = r
  }
  return out
}

/** ¿Ese servicio le aparece al barbero? */
export function isServiceEnabled(service, overrides) {
  return overrides?.[service.id]?.is_enabled !== false
}

/** Servicios que le aparecen al barbero */
export function enabledServices(services, overrides) {
  return services.filter(s => isServiceEnabled(s, overrides))
}

/** ¿Tiene un % propio para ese servicio, distinto del general? */
export function hasCustomPct(service, overrides) {
  return overrides?.[service.id]?.commission_pct != null
}

/** % que se lleva el barbero por ese servicio */
export function servicePct(service, barber, overrides) {
  if (!barber) return 0
  const own = overrides?.[service.id]?.commission_pct
  return own != null ? Number(own) : Number(barber.commission_pct || 0)
}

/**
 * Reparte los servicios seleccionados entre barbero y local, servicio por servicio.
 * @returns { total, barberAmt, shopAmt, lines }
 */
export function splitServices(sel, services, barber, overrides) {
  const lines = []
  let total = 0
  let barberAmt = 0

  for (const [id, qty] of Object.entries(sel || {})) {
    const service = services.find(s => s.id === id)
    if (!service) continue
    const amount    = Number(service.price) * qty
    const pct       = servicePct(service, barber, overrides)
    const forBarber = amount * pct / 100
    total     += amount
    barberAmt += forBarber
    lines.push({ service, qty, amount, pct, forBarber, custom: hasCustomPct(service, overrides) })
  }

  return { total, barberAmt, shopAmt: total - barberAmt, lines }
}

/** Ítems de servicio listos para insertar, guardando el % aplicado a cada uno */
export function buildServiceItems(sel, services, barber, overrides, key) {
  return Object.entries(sel || {}).filter(([id]) => services.some(s => s.id === id)).map(([id, qty]) => {
    const service = services.find(s => s.id === id)
    return {
      ...key,
      item_type:      'service',
      item_id:        id,
      name:           service.name,
      price:          service.price,
      quantity:       qty,
      commission_pct: barber ? servicePct(service, barber, overrides) : null,
    }
  })
}

/**
 * Agrupa ítems de servicio ya guardados por el % con el que se pagaron.
 * Los ítems viejos (sin commission_pct) caen en el % general del barbero.
 * @returns [{ pct, amount, barberAmt, count }] ordenado por % descendente
 */
export function groupByPct(saleItems, barber) {
  const fallback = Number(barber?.commission_pct || 0)
  const map = new Map()

  for (const it of saleItems) {
    if (it.item_type !== 'service') continue
    const pct    = it.commission_pct != null ? Number(it.commission_pct) : fallback
    const amount = Number(it.subtotal != null ? it.subtotal : Number(it.price) * it.quantity)
    const prev   = map.get(pct) || { pct, amount: 0, barberAmt: 0, count: 0 }
    prev.amount    += amount
    prev.barberAmt += amount * pct / 100
    prev.count     += it.quantity
    map.set(pct, prev)
  }

  return [...map.values()].sort((a, b) => b.pct - a.pct)
}
