import { useState } from 'react'
import { Star, Gift } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { customerRedeem } from '../../lib/booking'
import toast from 'react-hot-toast'

// Muestra el progreso de estrellas de un cliente y, si llegó al mínimo,
// el botón para canjear. `onRedeemed` se llama después de un canje exitoso.
export default function StarMeter({ customer, min, onRedeemed, compact = false }) {
  const [busy, setBusy] = useState(false)
  const stars = Number(customer?.stars) || 0
  const redemptions = Number(customer?.redemptions) || 0
  const ready = stars >= min

  async function redeem() {
    if (busy) return
    setBusy(true)
    try {
      await customerRedeem(supabase, customer.id)
      toast.success('¡Canje registrado!')
      onRedeemed?.()
    } catch (e) {
      toast.error(e.message || 'No se pudo canjear')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap ${compact ? 'text-xs' : 'text-sm'}`}>
      {min <= 8 && !compact ? (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: min }, (_, i) => (
            <Star key={i} size={15}
              className={i < stars ? 'text-gold fill-gold' : 'text-cream/20'} />
          ))}
        </div>
      ) : (
        <span className="inline-flex items-center gap-1 text-gold font-semibold">
          <Star size={compact ? 12 : 14} className="fill-gold" /> {stars}/{min}
        </span>
      )}

      {redemptions > 0 && (
        <span className="text-cream/35 text-xs">· {redemptions} canje{redemptions === 1 ? '' : 's'}</span>
      )}

      {ready && onRedeemed && (
        <button
          onClick={redeem}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gold text-ink font-semibold px-2.5 py-1 text-xs hover:bg-gold-light disabled:opacity-50"
        >
          <Gift size={13} /> {busy ? 'Canjeando...' : 'Canjear'}
        </button>
      )}
    </div>
  )
}
