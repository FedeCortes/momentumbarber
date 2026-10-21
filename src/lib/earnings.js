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

// ─────────────────────────────────────────────────────────────────────────────
// Comisión del barbero en PRODUCTOS de vitrina y BEBIDAS
//
// Se configura en Configuración y es igual para todos los barberos:
//   · Cada producto/bebida puede tener su comisión propia, en $ por unidad
//     (barber_commission_amt) o en % (barber_commission_pct). 0 = no deja nada.
//   · Si no tiene propia, usa la general de la barbería (tenant_config:
//     product_commission_amt/pct o drink_commission_amt/pct). Así un producto
//     nuevo ya nace con la general.
//   · Sin propia ni general → 100% para el local.
// La venta guarda lo aplicado (commission_amt o commission_pct): lo ya
// vendido no cambia si mañana se modifica la configuración.
// ─────────────────────────────────────────────────────────────────────────────

/** Comisión general de vitrina, desde tenant_config */
export function productGeneral(cfg) {
  return { amt: cfg?.product_commission_amt, pct: cfg?.product_commission_pct }
}

/** Comisión general de bebidas, desde tenant_config */
export function drinkGeneral(cfg) {
  return { amt: cfg?.drink_commission_amt, pct: cfg?.drink_commission_pct }
}

// undefined = no configurada · null = configurada en 0 · { amt } | { pct }
function cutOf(amt, pct) {
  if (amt != null && amt !== '') return Number(amt) > 0 ? { amt: Number(amt) } : null
  if (pct != null && pct !== '') return Number(pct) > 0 ? { pct: Number(pct) } : null
  return undefined
}

/**
 * Lo que se lleva el barbero por un producto o bebida:
 * { amt } ($ por unidad) | { pct } | null (todo para el local).
 * Sin barbero (venta "Solo local") → null.
 */
export function catalogCut(item, barber, general) {
  if (!barber) return null
  const own = cutOf(item?.barber_commission_amt, item?.barber_commission_pct)
  const cut = own !== undefined ? own : cutOf(general?.amt, general?.pct)
  return cut || null
}
export const productCut = catalogCut
export const drinkCut   = catalogCut

/** ¿El ítem tiene comisión propia (aunque sea 0)? Si no, usa la general */
export function hasOwnCommission(item) {
  return cutOf(item?.barber_commission_amt, item?.barber_commission_pct) !== undefined
}

/** Texto corto: "$1.500 c/u" · "10%" · "" */
export function cutLabel(cut) {
  if (!cut) return ''
  return cut.amt != null ? `$${Number(cut.amt).toLocaleString('es-AR')} c/u` : `${Number(cut.pct)}%`
}

/** Lo que se lleva el barbero por un ítem ya guardado */
function savedItemCut(it, amount) {
  if (it.commission_amt != null) return Number(it.commission_amt) * Number(it.quantity || 1)
  const pct = it.commission_pct != null ? Number(it.commission_pct) : 0
  return amount * pct / 100
}

// Reparto de una selección { [id]: cantidad } entre barbero y local
function splitCatalog(sel, list, barber, general, key) {
  const lines = []
  let total = 0
  let barberAmt = 0
  for (const [id, qty] of Object.entries(sel || {})) {
    const item = list.find(x => x.id === id)
    if (!item) continue
    const amount    = Number(item.price) * qty
    const cut       = catalogCut(item, barber, general)
    const forBarber = cut?.amt != null ? cut.amt * qty : cut?.pct != null ? amount * cut.pct / 100 : 0
    total     += amount
    barberAmt += forBarber
    lines.push({ [key]: item, qty, amount, pct: cut?.pct ?? null, amt: cut?.amt ?? null, forBarber, custom: forBarber > 0 })
  }
  return { total, barberAmt, shopAmt: total - barberAmt, lines }
}

// Ítems listos para insertar, guardando lo aplicado a cada uno
function buildCatalogItems(sel, list, barber, general, extra, itemType) {
  return Object.entries(sel || {}).filter(([id]) => list.some(x => x.id === id)).map(([id, qty]) => {
    const item = list.find(x => x.id === id)
    const cut  = catalogCut(item, barber, general)
    return {
      ...extra,
      item_type:      itemType,
      item_id:        id,
      name:           item.name,
      price:          item.price,
      quantity:       qty,
      commission_pct: barber ? (cut?.pct ?? 0) : null,
      // $ por unidad: solo se manda si hay (si no, el ítem queda igual que siempre)
      ...(cut?.amt != null ? { commission_amt: cut.amt } : {}),
    }
  })
}

// Agrupa ítems ya guardados por el % con que se pagaron (los de $ fijo caen en 0%)
function groupCatalogByPct(saleItems, itemType) {
  const map = new Map()
  for (const it of saleItems) {
    if (it.item_type !== itemType) continue
    const pct    = it.commission_pct != null ? Number(it.commission_pct) : 0
    const amount = Number(it.subtotal != null ? it.subtotal : Number(it.price) * it.quantity)
    const prev   = map.get(pct) || { pct, amount: 0, barberAmt: 0, count: 0 }
    prev.amount    += amount
    prev.barberAmt += savedItemCut(it, amount)
    prev.count     += it.quantity
    map.set(pct, prev)
  }
  return [...map.values()].sort((a, b) => b.pct - a.pct)
}

/** @returns { total, barberAmt, shopAmt, lines } */
export function splitProducts(sel, products, barber, general) {
  return splitCatalog(sel, products, barber, general, 'product')
}
export function splitDrinks(sel, drinks, barber, general) {
  return splitCatalog(sel, drinks, barber, general, 'drink')
}
export function buildProductItems(sel, products, barber, general, key) {
  return buildCatalogItems(sel, products, barber, general, key, 'product')
}
export function buildDrinkItems(sel, drinks, barber, general, key) {
  return buildCatalogItems(sel, drinks, barber, general, key, 'drink')
}
/** @returns [{ pct, amount, barberAmt, count }] — se usa barberAmt */
export function groupProductsByPct(saleItems) {
  return groupCatalogByPct(saleItems, 'product')
}
export function groupDrinksByPct(saleItems) {
  return groupCatalogByPct(saleItems, 'drink')
}

// Comisión por barbero en productos/bebidas (barber_products / barber_drinks):
// modelo anterior, ya no se usa para calcular. Se dejan los mapeos para no
// romper las cargas existentes.
export function productOverridesMap(rows) {
  return Object.fromEntries((rows || []).map(r => [r.product_id, r]))
}
export function productOverridesByBarber(rows) {
  const out = {}
  for (const r of rows || []) (out[r.barber_id] ||= {})[r.product_id] = r
  return out
}
export function drinkOverridesMap(rows) {
  return Object.fromEntries((rows || []).map(r => [r.drink_id, r]))
}
export function drinkOverridesByBarber(rows) {
  const out = {}
  for (const r of rows || []) (out[r.barber_id] ||= {})[r.drink_id] = r
  return out
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
