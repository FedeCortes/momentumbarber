import { Percent } from 'lucide-react'

/**
 * % que se lleva el barbero por un servicio.
 * `isDefault` → no tiene % propio para ese servicio, cobra su comisión general (estilo apagado).
 * `variant`: 'admin' → "30% propio" · 'barber' → "Te llevás 30%"
 */
export default function CommissionBadge({ pct, amt, variant = 'admin', size = 'sm', isDefault = false, barberName }) {
  if (pct == null && amt == null) return null
  // Monto fijo en pesos (por unidad) o porcentaje
  const n = amt != null ? `$${Number(amt).toLocaleString('es-AR')}` : `${Number(pct)}%`
  const quien = barberName ? `para ${barberName}` : 'para el barbero'
  const text = variant === 'barber'
    ? `Te llevás ${n}`
    : isDefault ? `${n} ${quien} (su general)` : `${n} ${quien}`
  const dims = size === 'xs' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5'
  const tone = isDefault
    ? 'text-cream/40 bg-cream/5 border-cream/15 font-semibold'
    : 'text-violet-300 bg-violet-400/12 border-violet-400/30 font-bold'
  return (
    <span className={`inline-flex items-center gap-0.5 shrink-0 rounded-full border ${tone} ${dims}`}>
      {amt == null && <Percent size={size === 'xs' ? 8 : 9} strokeWidth={2.5} />} {text}
    </span>
  )
}
