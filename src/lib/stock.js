// ─────────────────────────────────────────────────────────────────────────────
// Control de stock (inventario de productos y bebidas)
//
// El sistema completo se prende/apaga con tenant_config.stock_enabled.
// Cuando está apagado, la app no llama a nada de este archivo.
//
// El stock se descuenta SOLO cuando la venta se hace oficial:
//   · venta registrada por el admin (SalesPage)
//   · consumo de barbero (SalesPage)
//   · borrador pasado a venta oficial (DraftsPage)
// y se repone si esa venta oficial se edita o se elimina.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

const TABLE = { product: 'products', drink: 'drinks' }

/** Solo ítems que mueven stock (productos y bebidas). */
function stockItems(items) {
  return (items || []).filter(i => TABLE[i.item_type] && i.item_id && Number(i.quantity))
}

/**
 * Suma unidades al stock. `sign = -1` descuenta (venta), `sign = +1` repone.
 * Usa el RPC atómico adjust_stock (nunca deja el stock por debajo de 0).
 */
export async function applyStockDelta(items, sign) {
  for (const it of stockItems(items)) {
    const { error } = await supabase.rpc('adjust_stock', {
      p_item_type: it.item_type,
      p_item_id:   it.item_id,
      p_delta:     sign * Math.round(Number(it.quantity)),
    })
    if (error) console.warn('adjust_stock', it.name, error.message)
  }
}

/**
 * Revisa si hay stock suficiente para los ítems dados.
 * @returns [{ name, stock, qty }] con los que no alcanzan (vacío = todo ok)
 */
export async function checkStock(items) {
  const violations = []
  for (const it of stockItems(items)) {
    const { data } = await supabase
      .from(TABLE[it.item_type])
      .select('name, stock')
      .eq('id', it.item_id)
      .maybeSingle()
    if (data && Number(data.stock) < Number(it.quantity)) {
      violations.push({ name: data.name, stock: Number(data.stock) || 0, qty: Number(it.quantity) })
    }
  }
  return violations
}

/** Estado del stock frente a su punto de reposición. */
export function stockLevel(stock, minStock = 0) {
  const s = Number(stock) || 0
  const m = Number(minStock) || 0
  if (s <= 0) return 'out'   // sin stock
  if (s <= m) return 'low'   // por debajo (o en) el mínimo → reponer
  return 'ok'                // por encima del mínimo
}
