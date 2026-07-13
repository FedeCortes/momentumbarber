import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Check, Plus, Minus, Store, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

function ItemPicker({ items, selected, onToggle }) {
  if (items.length === 0) return (
    <p className="text-cream/30 text-xs text-center py-2">Sin ítems configurados</p>
  )
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => {
        const qty = selected[item.id] || 0
        const isSelected = qty > 0
        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
              isSelected ? 'border-gold bg-gold/8' : 'border-dark-400 hover:border-dark-500'
            }`}
          >
            <button
              onClick={() => onToggle(item, -1)}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                qty > 0 ? 'bg-dark-300 text-cream/70 hover:bg-dark-400' : 'bg-dark-400/30 text-cream/20 cursor-default'
              }`}
              disabled={qty === 0}
            >
              <Minus size={12} />
            </button>
            <button onClick={() => onToggle(item, 1)} className="flex-1 text-left">
              <span className={`text-sm font-medium ${isSelected ? 'text-cream' : 'text-cream/70'}`}>{item.name}</span>
              {qty > 1 && <span className="text-gold text-xs ml-2">×{qty}</span>}
            </button>
            <span className={`text-sm shrink-0 ${isSelected ? 'text-gold' : 'text-cream/40'}`}>
              ${Number(item.price).toLocaleString('es-AR')}
            </span>
            <button
              onClick={() => onToggle(item, 1)}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                isSelected ? 'bg-gold text-dark' : 'bg-dark-300 text-cream/60 hover:bg-dark-400'
              }`}
            >
              {isSelected ? <Check size={12} /> : <Plus size={12} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ShopBadge() {
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-400/80 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-0.5">
      <Store size={11} />
      100% local
    </span>
  )
}

export default function SalesPage() {
  const { tenant } = useAuth()
  const [barbers, setBarbers] = useState([])
  const [services, setServices] = useState([])
  const [products, setProducts] = useState([])
  const [drinks, setDrinks] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])

  const [selectedBarber, setSelectedBarber] = useState('')
  const [selServices, setSelServices] = useState({})
  const [selProducts, setSelProducts] = useState({})
  const [selDrinks, setSelDrinks] = useState({})
  const [paymentMethod, setPaymentMethod] = useState('')
  const [tip, setTip] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showVitrina, setShowVitrina] = useState(false)
  const [showBebidas, setShowBebidas] = useState(false)

  useEffect(() => {
    if (!tenant?.id) return
    Promise.all([
      supabase.from('barbers').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('services').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('drinks').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('payment_methods').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order'),
    ]).then(([b, s, p, d, pm]) => {
      setBarbers(b.data || [])
      setServices(s.data || [])
      setProducts(p.data || [])
      setDrinks(d.data || [])
      setPaymentMethods(pm.data || [])
    })
  }, [tenant?.id])

  function toggle(setter, item, delta) {
    setter(prev => {
      const current = prev[item.id] || 0
      const next = Math.max(0, current + delta)
      if (next === 0) { const { [item.id]: _, ...rest } = prev; return rest }
      return { ...prev, [item.id]: next }
    })
  }

  function calcTotal(sel, catalog) {
    return Object.entries(sel).reduce((sum, [id, qty]) => {
      const item = catalog.find(i => i.id === id)
      return sum + (item ? Number(item.price) * qty : 0)
    }, 0)
  }

  const hasServices  = Object.keys(selServices).length > 0
  const hasShopItems = Object.keys(selProducts).length > 0 || Object.keys(selDrinks).length > 0
  const totalServices = calcTotal(selServices, services)
  const totalProducts = calcTotal(selProducts, products)
  const totalDrinks   = calcTotal(selDrinks, drinks)
  const tipAmt        = Number(tip) || 0
  const baseTotal     = totalServices + totalProducts + totalDrinks
  const selectedPm    = paymentMethods.find(p => p.id === paymentMethod)
  const surchargePct  = Number(selectedPm?.surcharge_pct) || 0
  const surchargeAmt  = surchargePct > 0 ? Math.round(baseTotal * surchargePct / 100) : 0
  const grandTotal    = baseTotal + tipAmt + surchargeAmt

  function buildItems(sel, catalog, type) {
    return Object.entries(sel).map(([id, qty]) => {
      const item = catalog.find(i => i.id === id)
      return { item_type: type, item_id: id, name: item.name, price: item.price, quantity: qty }
    })
  }

  async function handleSubmit() {
    if (!hasServices && !hasShopItems) return toast.error('Agregá al menos un ítem')
    if (!paymentMethod) return toast.error('Seleccioná el método de pago')
    setLoading(true)

    try {
      const barber = barbers.find(b => b.id === selectedBarber)
      const barberEarnings = barber ? totalServices * (barber.commission_pct / 100) + tipAmt : 0
      const shopEarnings   = barber
        ? totalServices * (1 - barber.commission_pct / 100) + totalProducts + totalDrinks + surchargeAmt
        : totalServices + totalProducts + totalDrinks + surchargeAmt

      const items = [
        ...buildItems(selServices, services, 'service'),
        ...buildItems(selProducts, products, 'product'),
        ...buildItems(selDrinks, drinks, 'drink'),
      ]

      const { data: sale, error } = await supabase.from('sales').insert({
        tenant_id: tenant.id,
        barber_id: selectedBarber || null,
        payment_method_id: paymentMethod,
        tip: tipAmt,
        total_services: totalServices,
        total_products: totalProducts,
        total_drinks: totalDrinks,
        barber_earnings: barberEarnings,
        shop_earnings: shopEarnings,
        surcharge_amt: surchargeAmt,
        sale_date: format(new Date(), 'yyyy-MM-dd'),
      }).select().single()
      if (error) throw error
      if (items.length) await supabase.from('sale_items').insert(items.map(i => ({ ...i, sale_id: sale.id })))
      toast.success('¡Venta registrada!')

      setSaved(true)
      setTimeout(() => {
        setSelServices({}); setSelProducts({}); setSelDrinks({})
        setPaymentMethod(''); setTip(''); setSelectedBarber('')
        setSaved(false)
      }, 1200)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
          <Check size={32} className="text-emerald-400" />
        </div>
        <p className="font-display text-2xl text-cream">¡Venta registrada!</p>
        <p className="text-cream/40 text-sm mt-1">Preparando nuevo registro...</p>
      </div>
    )
  }

  return (
    <div className="pb-56 md:pb-6">
      <h1 className="section-title mb-1">Nueva venta</h1>
      <p className="section-sub mb-5">Registro oficial de venta</p>

      {/* ── Servicios (van con barbero) ── */}
      <div className="card mb-3">
        {/* Header de sección */}
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Servicios</label>
          {totalServices > 0 && <span className="text-gold text-sm">${totalServices.toLocaleString('es-AR')}</span>}
        </div>

        <ItemPicker items={services} selected={selServices} onToggle={(item, d) => toggle(setSelServices, item, d)} />

        {/* Barbero + propina — solo si hay servicios seleccionados */}
        {hasServices && (
          <div className="mt-4 pt-4 border-t border-dark-300 flex flex-col gap-3">
            <div>
              <label className="label">Barbero que realizó los servicios</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {barbers.map(b => (
                  <button
                    key={b.id}
                    onClick={() => {
                      if (selectedBarber === b.id) {
                        setSelectedBarber('')
                        setTip('')
                      } else {
                        setSelectedBarber(b.id)
                      }
                    }}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selectedBarber === b.id
                        ? 'border-gold bg-gold/15 text-gold'
                        : 'border-dark-400 text-cream/60 hover:border-dark-500'
                    }`}
                  >
                    {b.name}
                    {selectedBarber === b.id && (
                      <span className="ml-2 text-gold/60 text-xs">{b.commission_pct}%</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {selectedBarber && (
              <div>
                <label className="label">Propina <span className="text-cream/30 font-normal">(opcional · 100% para el barbero)</span></label>
                <div className="flex items-center gap-2">
                  <span className="text-cream/40 text-sm">$</span>
                  <input
                    type="number" min="0"
                    className="input-dark"
                    placeholder="0"
                    value={tip}
                    onChange={e => setTip(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Desglose de ganancias */}
            {selectedBarber && (() => {
              const barber = barbers.find(b => b.id === selectedBarber)
              if (!barber) return null
              const barberAmt = totalServices * (barber.commission_pct / 100) + tipAmt
              const shopAmt   = totalServices * (1 - barber.commission_pct / 100)
              return (
                <div className="flex gap-3 text-xs">
                  <div className="flex-1 bg-dark-300 rounded-lg px-3 py-2">
                    <p className="text-cream/40 mb-0.5">Para {barber.name}</p>
                    <p className="text-gold font-medium">${barberAmt.toLocaleString('es-AR')}</p>
                  </div>
                  <div className="flex-1 bg-dark-300 rounded-lg px-3 py-2">
                    <p className="text-cream/40 mb-0.5">Para el local</p>
                    <p className="text-cream font-medium">${shopAmt.toLocaleString('es-AR')}</p>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── Vitrina (100% local) ── */}
      <div className="card mb-3">
        <button className="flex items-center justify-between w-full" onClick={() => setShowVitrina(v => !v)}>
          <div className="flex items-center gap-2">
            <label className="label mb-0 pointer-events-none">Vitrina</label>
            <ShopBadge />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalProducts > 0 && <span className="text-gold text-sm">${totalProducts.toLocaleString('es-AR')}</span>}
            {showVitrina ? <ChevronUp size={14} className="text-cream/35" /> : <ChevronDown size={14} className="text-cream/35" />}
          </div>
        </button>
        {showVitrina && (
          <div className="mt-3">
            <ItemPicker items={products} selected={selProducts} onToggle={(item, d) => toggle(setSelProducts, item, d)} />
          </div>
        )}
      </div>

      {/* ── Bebidas (100% local) ── */}
      <div className="card mb-3">
        <button className="flex items-center justify-between w-full" onClick={() => setShowBebidas(v => !v)}>
          <div className="flex items-center gap-2">
            <label className="label mb-0 pointer-events-none">Bebidas</label>
            <ShopBadge />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalDrinks > 0 && <span className="text-gold text-sm">${totalDrinks.toLocaleString('es-AR')}</span>}
            {showBebidas ? <ChevronUp size={14} className="text-cream/35" /> : <ChevronDown size={14} className="text-cream/35" />}
          </div>
        </button>
        {showBebidas && (
          <div className="mt-3">
            <ItemPicker items={drinks} selected={selDrinks} onToggle={(item, d) => toggle(setSelDrinks, item, d)} />
          </div>
        )}
      </div>

      {/* Método de pago */}
      <div className="card mb-4">
        <label className="label">Método de pago</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {paymentMethods.map(pm => (
            <button
              key={pm.id}
              onClick={() => setPaymentMethod(pm.id)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                paymentMethod === pm.id
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-dark-400 text-cream/60 hover:border-dark-500'
              }`}
            >
              {pm.name}
              {Number(pm.surcharge_pct) > 0 && (
                <span className={`ml-1.5 text-xs font-bold ${paymentMethod === pm.id ? 'text-amber-400' : 'text-amber-400/50'}`}>
                  +{Number(pm.surcharge_pct)}%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Footer sticky */}
      <div className="fixed bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 md:relative md:bottom-auto md:z-auto bg-dark-200 border-t border-dark-300 md:border md:rounded-xl p-3 sm:p-4 md:card">
        <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
          <span className="text-cream/60 text-sm shrink-0">Total</span>
          <span className="font-display text-2xl sm:text-3xl text-gold truncate">${grandTotal.toLocaleString('es-AR')}</span>
        </div>
        {grandTotal > 0 && (
          <div className="text-[11px] sm:text-xs text-cream/30 mb-2 sm:mb-3 flex gap-x-3 gap-y-1 flex-wrap">
            {totalServices > 0 && <span>Servicios: ${totalServices.toLocaleString('es-AR')}</span>}
            {totalProducts > 0 && <span>Vitrina: ${totalProducts.toLocaleString('es-AR')}</span>}
            {totalDrinks > 0 && <span>Bebidas: ${totalDrinks.toLocaleString('es-AR')}</span>}
            {tipAmt > 0 && <span>Propina: ${tipAmt.toLocaleString('es-AR')}</span>}
            {surchargeAmt > 0 && <span className="text-amber-400/60">Recargo {surchargePct}%: +${surchargeAmt.toLocaleString('es-AR')}</span>}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={loading} className="btn-gold flex-1 text-sm">
            {loading ? 'Guardando...' : 'Confirmar venta'}
          </button>
        </div>
      </div>
    </div>
  )
}
