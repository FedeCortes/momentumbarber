import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Check, Plus, Minus, Store, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import CommissionBadge from '../../components/ui/CommissionBadge'
import { splitServices, buildServiceItems, servicePct, hasCustomPct, enabledServices, overridesByBarber } from '../../lib/earnings'
import toast from 'react-hot-toast'

function ItemPicker({ items, selected, onToggle, commissionOf }) {
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
            <button onClick={() => onToggle(item, 1)} className="flex-1 text-left min-w-0">
              <span className={`text-sm font-medium ${isSelected ? 'text-cream' : 'text-cream/70'}`}>{item.name}</span>
              {qty > 1 && <span className="text-gold text-xs ml-2">×{qty}</span>}
              {commissionOf?.(item) && (
                <span className="ml-2 align-middle inline-block"><CommissionBadge {...commissionOf(item)} /></span>
              )}
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
  const [tab, setTab] = useState('venta') // 'venta' | 'consumo'
  const [barbers, setBarbers] = useState([])
  const [services, setServices] = useState([])
  const [products, setProducts] = useState([])
  const [drinks, setDrinks] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [barberSvcs, setBarberSvcs] = useState({})

  const [selectedBarber, setSelectedBarber] = useState('')
  const [shopOnly, setShopOnly] = useState(false)
  const [selServices, setSelServices] = useState({})
  const [selProducts, setSelProducts] = useState({})
  const [selDrinks, setSelDrinks] = useState({})
  const [paymentMethod, setPaymentMethod] = useState('')
  const [tip, setTip] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showVitrina, setShowVitrina] = useState(false)
  const [showBebidas, setShowBebidas] = useState(false)

  // ── Consumo de barbero (compra personal, a precio especial) ──
  const [consBarber, setConsBarber] = useState('')
  const [consProducts, setConsProducts] = useState({})
  const [consDrinks, setConsDrinks] = useState({})
  const [consLoading, setConsLoading] = useState(false)
  const [consSaved, setConsSaved] = useState(false)

  useEffect(() => {
    if (!tenant?.id) return
    Promise.all([
      supabase.from('barbers').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('services').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('drinks').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('payment_methods').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order'),
      supabase.from('barber_services').select('*').eq('tenant_id', tenant.id),
    ]).then(([b, s, p, d, pm, bs]) => {
      setBarbers(b.data || [])
      setServices(s.data || [])
      setProducts(p.data || [])
      setDrinks(d.data || [])
      setPaymentMethods(pm.data || [])
      setBarberSvcs(overridesByBarber(bs.data || []))
    })
  }, [tenant?.id])

  // Elegir barbero (o "solo local"): descarta los servicios que ese barbero no hace
  function chooseBarber(barberId) {
    const next = barbers.find(b => b.id === barberId) || null
    setSelectedBarber(next?.id || '')
    setShopOnly(!next)
    const allowed = next ? enabledServices(services, barberSvcs[next.id]) : services
    setSelServices(prev => Object.fromEntries(
      Object.entries(prev).filter(([id]) => allowed.some(s => s.id === id))
    ))
  }

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
  const barber       = barbers.find(b => b.id === selectedBarber) || null
  const overrides    = barber ? barberSvcs[barber.id] : null
  const chosen       = !!barber || shopOnly
  // Al barbero solo le aparecen los servicios que tiene habilitados
  const visibleServices = barber ? enabledServices(services, overrides) : services
  const split        = splitServices(selServices, services, barber, overrides)
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

  // ── Consumo de barbero: mismo catálogo, pero con el precio especial ──
  const barberProducts = products.map(p => ({ ...p, price: p.barber_price ?? p.price }))
  const barberDrinks   = drinks.map(d => ({ ...d, price: d.barber_price ?? d.price }))
  const consBarberObj  = barbers.find(b => b.id === consBarber) || null
  const hasConsItems   = Object.keys(consProducts).length > 0 || Object.keys(consDrinks).length > 0
  const consTotal      = calcTotal(consProducts, barberProducts) + calcTotal(consDrinks, barberDrinks)

  async function handleConsSubmit() {
    if (!consBarber) return toast.error('Elegí qué barbero consumió')
    if (!hasConsItems) return toast.error('Agregá al menos un ítem')
    setConsLoading(true)

    try {
      const items = [
        ...buildItems(consProducts, barberProducts, 'product'),
        ...buildItems(consDrinks, barberDrinks, 'drink'),
      ].map(i => ({
        ...i,
        tenant_id: tenant.id,
        barber_id: consBarber,
        purchase_date: format(new Date(), 'yyyy-MM-dd'),
      }))

      const { error } = await supabase.from('barber_purchases').insert(items)
      if (error) throw error
      toast.success('¡Consumo registrado!')

      setConsSaved(true)
      setTimeout(() => {
        setConsProducts({}); setConsDrinks({}); setConsBarber('')
        setConsSaved(false)
      }, 1200)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setConsLoading(false)
    }
  }

  async function handleSubmit() {
    if (!chosen) return toast.error('Elegí quién atendió (o "Solo local")')
    if (!hasServices && !hasShopItems) return toast.error('Agregá al menos un ítem')
    if (!paymentMethod) return toast.error('Seleccioná el método de pago')
    setLoading(true)

    try {
      // El reparto se calcula servicio por servicio: cada uno puede tener su propio %
      const barberEarnings = barber ? split.barberAmt + tipAmt : 0
      // Sin barbero, la propina queda para el local
      const shopEarnings   = split.shopAmt + totalProducts + totalDrinks + surchargeAmt + (barber ? 0 : tipAmt)

      const items = [
        ...buildServiceItems(selServices, services, barber, overrides),
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
        setPaymentMethod(''); setTip(''); setSelectedBarber(''); setShopOnly(false)
        setSaved(false)
      }, 1200)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (saved || consSaved) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
          <Check size={32} className="text-emerald-400" />
        </div>
        <p className="font-display text-2xl text-cream">{saved ? '¡Venta registrada!' : '¡Consumo registrado!'}</p>
        <p className="text-cream/40 text-sm mt-1">Preparando nuevo registro...</p>
      </div>
    )
  }

  return (
    <div className="pb-56 md:pb-6">
      <h1 className="section-title mb-1">Nueva venta</h1>
      <p className="section-sub mb-5">Registro oficial de venta</p>

      {/* ── Tabs: venta a cliente vs. consumo interno de barbero ── */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('venta')}
          className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
            tab === 'venta' ? 'border-gold bg-gold/15 text-gold' : 'border-dark-400 text-cream/50 hover:border-dark-500'
          }`}
        >
          Venta
        </button>
        <button
          onClick={() => setTab('consumo')}
          className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
            tab === 'consumo' ? 'border-violet-300/60 bg-violet-300/10 text-violet-300' : 'border-dark-400 text-cream/50 hover:border-dark-500'
          }`}
        >
          Consumo de barbero
        </button>
      </div>

      {tab === 'consumo' ? (
        <div className="pb-24 md:pb-0">
          <div className="card mb-3">
            <label className="label">¿Qué barbero consumió? *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {barbers.map(b => (
                <button
                  key={b.id}
                  onClick={() => setConsBarber(b.id)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    consBarber === b.id
                      ? 'border-violet-300/60 bg-violet-300/15 text-violet-300'
                      : 'border-dark-400 text-cream/60 hover:border-dark-500'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
            <p className="text-cream/35 text-xs mt-2">Se le descuenta de lo que se le paga en el cierre, a precio de barbero.</p>
          </div>

          <div className="card mb-3">
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">Vitrina</label>
              {consTotal > 0 && Object.keys(consProducts).length > 0 && (
                <span className="text-violet-300 text-sm">${calcTotal(consProducts, barberProducts).toLocaleString('es-AR')}</span>
              )}
            </div>
            <ItemPicker items={barberProducts} selected={consProducts} onToggle={(item, d) => toggle(setConsProducts, item, d)} />
          </div>

          <div className="card mb-3">
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">Bebidas</label>
              {Object.keys(consDrinks).length > 0 && (
                <span className="text-violet-300 text-sm">${calcTotal(consDrinks, barberDrinks).toLocaleString('es-AR')}</span>
              )}
            </div>
            <ItemPicker items={barberDrinks} selected={consDrinks} onToggle={(item, d) => toggle(setConsDrinks, item, d)} />
          </div>

          <div className="fixed bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 md:relative md:bottom-auto md:z-auto bg-dark-200 border-t border-dark-300 md:border md:rounded-xl p-3 sm:p-4 md:card">
            <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
              <span className="text-cream/60 text-sm shrink-0">Total{consBarberObj ? ` — ${consBarberObj.name}` : ''}</span>
              <span className="font-display text-2xl sm:text-3xl text-violet-300 truncate">${consTotal.toLocaleString('es-AR')}</span>
            </div>
            <button onClick={handleConsSubmit} disabled={consLoading} className="w-full py-2.5 rounded-lg bg-violet-300/15 border border-violet-300/40 text-violet-300 text-sm font-medium hover:bg-violet-300/25 transition-colors">
              {consLoading ? 'Guardando...' : 'Confirmar consumo'}
            </button>
          </div>
        </div>
      ) : (
      <>

      {/* ── 1. Quién atiende — define qué servicios se ven y con qué % ── */}
      <div className="card mb-3">
        <label className="label">¿Quién lo atendió? *</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {barbers.map(b => (
            <button
              key={b.id}
              onClick={() => chooseBarber(b.id)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                selectedBarber === b.id
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-dark-400 text-cream/60 hover:border-dark-500'
              }`}
            >
              {b.name}
              {selectedBarber === b.id && (
                <span className="ml-2 text-gold/60 text-xs">{b.commission_pct}% gral.</span>
              )}
            </button>
          ))}
          <button
            onClick={() => chooseBarber(null)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              shopOnly
                ? 'border-emerald-400/60 bg-emerald-400/12 text-emerald-400'
                : 'border-dark-400 text-cream/60 hover:border-dark-500'
            }`}
          >
            Solo local
          </button>
        </div>
        {shopOnly && (
          <p className="text-cream/35 text-xs mt-2">Venta sin barbero: todo lo que cargues va 100% al local.</p>
        )}
      </div>

      {/* ── 2. Servicios ── */}
      <div className="card mb-3">
        {/* Header de sección */}
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Servicios</label>
          {totalServices > 0 && <span className="text-gold text-sm">${totalServices.toLocaleString('es-AR')}</span>}
        </div>

        {!chosen ? (
          <p className="text-cream/30 text-sm text-center py-4">Elegí primero quién atendió</p>
        ) : (
          <ItemPicker
            items={visibleServices}
            selected={selServices}
            onToggle={(item, d) => toggle(setSelServices, item, d)}
            // El % que le corresponde al barbero por cada servicio
            commissionOf={s => barber
              ? { pct: servicePct(s, barber, overrides), isDefault: !hasCustomPct(s, overrides), barberName: barber.name.split(' ')[0] }
              : null}
          />
        )}

        {barber && hasServices && (
          <div className="mt-4 pt-4 border-t border-dark-300">
            {/* Desglose de ganancias — servicio por servicio */}
            <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1 bg-dark-300/50 rounded-lg px-3 py-2">
                  {split.lines.map(l => (
                    <div key={l.service.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-cream/50 truncate">{l.service.name}{l.qty > 1 ? ` ×${l.qty}` : ''}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className={l.custom ? 'text-violet-300 font-semibold' : 'text-cream/35'}>{l.pct}%</span>
                        <span className="text-gold/80">${l.forBarber.toLocaleString('es-AR')}</span>
                      </span>
                    </div>
                  ))}
                  {tipAmt > 0 && (
                    <div className="flex items-center justify-between gap-2 text-xs border-t border-dark-400/40 pt-1 mt-0.5">
                      <span className="text-cream/50">Propina</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-cream/35">100%</span>
                        <span className="text-gold/80">${tipAmt.toLocaleString('es-AR')}</span>
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 text-xs">
                  <div className="flex-1 bg-dark-300 rounded-lg px-3 py-2">
                    <p className="text-cream/40 mb-0.5">Para {barber.name}</p>
                    <p className="text-gold font-medium">${(split.barberAmt + tipAmt).toLocaleString('es-AR')}</p>
                  </div>
                <div className="flex-1 bg-dark-300 rounded-lg px-3 py-2">
                  <p className="text-cream/40 mb-0.5">Para el local</p>
                  <p className="text-cream font-medium">${split.shopAmt.toLocaleString('es-AR')}</p>
                </div>
              </div>
            </div>
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

      {/* ── Propina — antes del método de pago ── */}
      {chosen && (
        <div className="card mb-3">
          <label className="label">
            Propina <span className="text-cream/30 font-normal normal-case tracking-normal">
              (opcional · 100% para {barber ? 'el barbero' : 'el local'})
            </span>
          </label>
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

      {/* Método de pago */}
      <div className="card mb-4">
        <label className="label">Método de pago *</label>
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
      </>
      )}
    </div>
  )
}
