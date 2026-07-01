import { useEffect, useState } from 'react'
import { Check, Plus, Minus, Clock, ChevronDown, ChevronUp, Store, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

function ItemPicker({ items, selected, onToggle }) {
  if (items.length === 0) return (
    <p className="text-cream/30 text-xs text-center py-3">Sin ítems disponibles</p>
  )
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => {
        const qty = selected[item.id] || 0
        const on  = qty > 0
        return (
          <div
            key={item.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
              on ? 'border-gold/55 bg-gold/8' : 'border-dark-400/60 bg-dark-300/25'
            }`}
          >
            <button
              onClick={() => onToggle(item, -1)}
              disabled={qty === 0}
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                qty > 0 ? 'bg-dark-400/60 text-cream/80' : 'bg-dark-400/20 text-cream/20 cursor-default'
              }`}
            >
              <Minus size={12} />
            </button>

            <button onClick={() => onToggle(item, 1)} className="flex-1 text-left min-w-0">
              <p className={`text-sm font-medium leading-tight ${on ? 'text-cream' : 'text-cream/60'}`}>
                {item.name}
                {qty > 1 && <span className="ml-1.5 text-gold text-xs font-semibold">×{qty}</span>}
              </p>
            </button>

            <span className={`text-sm font-semibold shrink-0 ${on ? 'text-gold' : 'text-cream/30'}`}>
              ${Number(item.price).toLocaleString('es-AR')}
            </span>

            <button
              onClick={() => onToggle(item, 1)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                on ? 'bg-gold text-ink' : 'bg-dark-400/40 text-cream/55'
              }`}
            >
              {on ? <Check size={13} strokeWidth={2.5} /> : <Plus size={13} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function TodayDrafts({ barberId, tenantId, paymentMethods, refreshKey }) {
  const [drafts, setDrafts] = useState([])
  const [expanded, setExpanded] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    supabase
      .from('drafts').select('*')
      .eq('barber_id', barberId).eq('tenant_id', tenantId)
      .eq('draft_date', today).neq('status', 'discarded')
      .order('created_at', { ascending: false })
      .then(({ data }) => setDrafts(data || []))
  }, [barberId, tenantId, refreshKey])

  if (drafts.length === 0) return null

  const dayTotal = drafts.reduce((s, d) => s + Number(d.total) + Number(d.surcharge_amt || 0), 0)

  return (
    <div className="card">
      <button onClick={() => setExpanded(v => !v)} className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2.5">
          <Clock size={15} className="text-cream/40" />
          <span className="text-cream/65 text-sm font-medium">
            Hoy: {drafts.length} registro{drafts.length !== 1 ? 's' : ''}
          </span>
          <span className="text-gold text-sm font-semibold">${dayTotal.toLocaleString('es-AR')}</span>
        </div>
        {expanded
          ? <ChevronUp size={14} className="text-cream/30" />
          : <ChevronDown size={14} className="text-cream/30" />
        }
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-dark-400/30 flex flex-col gap-2">
          {drafts.map(d => {
            const pm = paymentMethods.find(p => p.id === d.payment_method_id)
            return (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-dark-400/20 last:border-0">
                <div>
                  <p className="text-cream text-sm font-semibold">${Number(d.total).toLocaleString('es-AR')}</p>
                  <p className="text-cream/30 text-xs">{pm?.name || '—'} · {format(new Date(d.created_at), 'HH:mm')}</p>
                </div>
                <span className={`text-xs font-medium ${d.status === 'approved' ? 'text-emerald-400' : 'text-amber-400/70'}`}>
                  {d.status === 'approved' ? 'Aprobado ✓' : 'Pendiente'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function BarberDraftPage() {
  const { tenant, barberSession } = useAuth()
  const barber = barberSession?.barber
  const [searchParams] = useSearchParams()
  const navigate        = useNavigate()
  const editId          = searchParams.get('edit')

  const [services, setServices]         = useState([])
  const [products, setProducts]         = useState([])
  const [drinks, setDrinks]             = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [catalogReady, setCatalogReady] = useState(false)

  const [selServices, setSelServices]   = useState({})
  const [selProducts, setSelProducts]   = useState({})
  const [selDrinks, setSelDrinks]       = useState({})
  const [paymentMethod, setPaymentMethod] = useState('')
  const [tip, setTip]                   = useState('')
  const [loading, setLoading]           = useState(false)
  const [saved, setSaved]               = useState(false)
  const [refreshKey, setRefreshKey]     = useState(0)
  const [pendingEditItems, setPendingEditItems] = useState(null)
  const [showVitrina, setShowVitrina]   = useState(false)
  const [showBebidas, setShowBebidas]   = useState(false)

  // Catálogo
  useEffect(() => {
    if (!tenant?.id) return
    Promise.all([
      supabase.from('services').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('drinks').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('payment_methods').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order'),
    ]).then(([s, p, d, pm]) => {
      setServices(s.data || [])
      setProducts(p.data || [])
      setDrinks(d.data || [])
      setPaymentMethods(pm.data || [])
      setCatalogReady(true)
    })
  }, [tenant?.id])

  // Cargar borrador para editar
  useEffect(() => {
    if (!editId || !tenant?.id) return
    Promise.all([
      supabase.from('drafts').select('*').eq('id', editId).single(),
      supabase.from('draft_items').select('*').eq('draft_id', editId),
    ]).then(([{ data: draft }, { data: items }]) => {
      if (!draft || draft.status !== 'pending') {
        toast.error('Este registro ya no se puede editar')
        navigate('/barber/history')
        return
      }
      setPaymentMethod(draft.payment_method_id || '')
      setTip(Number(draft.tip) > 0 ? String(draft.tip) : '')
      setPendingEditItems(items || [])
    })
  }, [editId, tenant?.id])

  // Aplicar ítems del borrador al formulario
  useEffect(() => {
    if (!catalogReady || !pendingEditItems) return
    const selSvc = {}, selPrd = {}, selDrk = {}
    pendingEditItems.forEach(it => {
      if (it.item_type === 'service') selSvc[it.item_id] = it.quantity
      if (it.item_type === 'product') selPrd[it.item_id] = it.quantity
      if (it.item_type === 'drink')   selDrk[it.item_id] = it.quantity
    })
    setSelServices(selSvc)
    setSelProducts(selPrd)
    setSelDrinks(selDrk)
    setPendingEditItems(null)
    if (Object.keys(selPrd).length > 0) setShowVitrina(true)
    if (Object.keys(selDrk).length > 0) setShowBebidas(true)
  }, [catalogReady, pendingEditItems])

  function toggle(setter, item, delta) {
    setter(prev => {
      const next = Math.max(0, (prev[item.id] || 0) + delta)
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

  const totalServices = calcTotal(selServices, services)
  const totalProducts = calcTotal(selProducts, products)
  const totalDrinks   = calcTotal(selDrinks, drinks)
  const tipAmt        = Number(tip) || 0
  const baseTotal     = totalServices + totalProducts + totalDrinks
  const selectedPm    = paymentMethods.find(p => p.id === paymentMethod)
  const surchargePct  = Number(selectedPm?.surcharge_pct) || 0
  const surchargeAmt  = surchargePct > 0 ? Math.round(baseTotal * surchargePct / 100) : 0
  const grandTotal    = baseTotal + tipAmt + surchargeAmt

  function buildItems() {
    return [
      ...Object.entries(selServices).map(([id, qty]) => {
        const item = services.find(s => s.id === id)
        return { item_type: 'service', item_id: id, name: item.name, price: item.price, quantity: qty }
      }),
      ...Object.entries(selProducts).map(([id, qty]) => {
        const item = products.find(p => p.id === id)
        return { item_type: 'product', item_id: id, name: item.name, price: item.price, quantity: qty }
      }),
      ...Object.entries(selDrinks).map(([id, qty]) => {
        const item = drinks.find(d => d.id === id)
        return { item_type: 'drink', item_id: id, name: item.name, price: item.price, quantity: qty }
      }),
    ]
  }

  async function handleSubmit() {
    const hasItems = Object.keys(selServices).length > 0
      || Object.keys(selProducts).length > 0
      || Object.keys(selDrinks).length > 0
    if (!hasItems) return toast.error('Agregá al menos un ítem')

    setLoading(true)
    try {
      const items = buildItems()
      const payload = {
        payment_method_id: paymentMethod || null,
        tip: tipAmt,
        total_services: totalServices,
        total_products: totalProducts,
        total_drinks: totalDrinks,
        surcharge_amt: surchargeAmt,
      }

      if (editId) {
        const { error } = await supabase.from('drafts')
          .update(payload).eq('id', editId).eq('status', 'pending')
        if (error) throw error
        await supabase.from('draft_items').delete().eq('draft_id', editId)
        if (items.length) {
          await supabase.from('draft_items').insert(items.map(i => ({ ...i, draft_id: editId })))
        }
        setSaved(true)
        setTimeout(() => navigate('/barber/history'), 1500)
      } else {
        const { data: draft, error } = await supabase.from('drafts').insert({
          tenant_id: tenant.id,
          barber_id: barber.id,
          draft_date: new Date().toISOString().split('T')[0],
          ...payload,
        }).select().single()
        if (error) throw error
        if (items.length) {
          await supabase.from('draft_items').insert(items.map(i => ({ ...i, draft_id: draft.id })))
        }
        setSaved(true)
        setTimeout(() => {
          setSelServices({}); setSelProducts({}); setSelDrinks({})
          setPaymentMethod(''); setTip('')
          setSaved(false)
          setRefreshKey(k => k + 1)
        }, 1500)
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const todayLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-20 h-20 rounded-full bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center mb-5">
          <Check size={34} className="text-emerald-400" strokeWidth={2.5} />
        </div>
        <p className="font-display text-2xl text-cream font-semibold">
          {editId ? 'Cambios guardados' : 'Registro guardado'}
        </p>
        <p className="text-cream/40 text-sm mt-2">
          {editId ? 'El registro fue actualizado' : 'El administrador lo revisará'}
        </p>
      </div>
    )
  }

  return (
    <div className="pb-40">

      {/* Header */}
      <div className="mb-3">
        {editId ? (
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/barber/history')}
              className="mt-1 w-8 h-8 rounded-xl flex items-center justify-center text-cream/40 hover:text-cream hover:bg-dark-300/60 transition-all shrink-0"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <h1 className="section-title leading-tight">Editar registro</h1>
              <p className="section-sub">Solo podés editar los pendientes</p>
            </div>
          </div>
        ) : (
          <>
            <p className="page-eyebrow capitalize">{todayLabel}</p>
            <h1 className="section-title">Hola, {barber?.name?.split(' ')[0]} 👋</h1>
          </>
        )}
      </div>

      {/* Servicios */}
      {services.length > 0 && (
        <div className="card !p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Servicios</label>
            {totalServices > 0 && (
              <span className="text-gold text-sm font-bold">${totalServices.toLocaleString('es-AR')}</span>
            )}
          </div>
          <ItemPicker items={services} selected={selServices} onToggle={(item, d) => toggle(setSelServices, item, d)} />
        </div>
      )}

      {/* Vitrina */}
      {products.length > 0 && (
        <div className="card !p-3 mb-2">
          <button className="flex items-center justify-between w-full" onClick={() => setShowVitrina(v => !v)}>
            <div className="flex items-center gap-2">
              <label className="label mb-0 pointer-events-none">Vitrina</label>
              <span className="flex items-center gap-1 text-[11px] text-emerald-400/80 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-0.5 font-semibold">
                <Store size={10} /> 100% local
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {totalProducts > 0 && <span className="text-gold text-sm font-bold">${totalProducts.toLocaleString('es-AR')}</span>}
              {showVitrina ? <ChevronUp size={14} className="text-cream/35" /> : <ChevronDown size={14} className="text-cream/35" />}
            </div>
          </button>
          {showVitrina && (
            <div className="mt-2">
              <ItemPicker items={products} selected={selProducts} onToggle={(item, d) => toggle(setSelProducts, item, d)} />
            </div>
          )}
        </div>
      )}

      {/* Bebidas */}
      {drinks.length > 0 && (
        <div className="card !p-3 mb-2">
          <button className="flex items-center justify-between w-full" onClick={() => setShowBebidas(v => !v)}>
            <div className="flex items-center gap-2">
              <label className="label mb-0 pointer-events-none">Bebidas</label>
              <span className="flex items-center gap-1 text-[11px] text-emerald-400/80 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-0.5 font-semibold">
                <Store size={10} /> 100% local
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {totalDrinks > 0 && <span className="text-gold text-sm font-bold">${totalDrinks.toLocaleString('es-AR')}</span>}
              {showBebidas ? <ChevronUp size={14} className="text-cream/35" /> : <ChevronDown size={14} className="text-cream/35" />}
            </div>
          </button>
          {showBebidas && (
            <div className="mt-2">
              <ItemPicker items={drinks} selected={selDrinks} onToggle={(item, d) => toggle(setSelDrinks, item, d)} />
            </div>
          )}
        </div>
      )}

      {/* Método de pago + Propina en fila */}
      <div className="card !p-3 mb-2">
        <label className="label mb-2">Método de pago</label>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {paymentMethods.map(pm => (
            <button
              key={pm.id}
              onClick={() => setPaymentMethod(pm.id === paymentMethod ? '' : pm.id)}
              className={`flex-1 min-w-[80px] px-3 py-2 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${
                paymentMethod === pm.id
                  ? 'border-gold bg-gold/12 text-gold'
                  : 'border-dark-400/60 text-cream/55 bg-dark-300/25'
              }`}
            >
              {pm.name}
              {Number(pm.surcharge_pct) > 0 && (
                <span className={`ml-1 text-[10px] font-bold ${paymentMethod === pm.id ? 'text-amber-400' : 'text-amber-400/50'}`}>
                  +{Number(pm.surcharge_pct)}%
                </span>
              )}
            </button>
          ))}
        </div>
        <label className="label mb-1.5">
          Propina <span className="text-gold/50 font-medium normal-case tracking-normal">— 100% para vos</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-cream/40 text-base font-semibold">$</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            className="input-dark !py-2"
            placeholder="0"
            value={tip}
            onChange={e => setTip(e.target.value)}
          />
        </div>
      </div>

      {/* Mis registros del día (solo en modo creación) */}
      {!editId && barber?.id && (
        <TodayDrafts
          key={refreshKey}
          barberId={barber.id}
          tenantId={tenant?.id}
          paymentMethods={paymentMethods}
          refreshKey={refreshKey}
        />
      )}

      {/* Footer sticky */}
      <div
        className="fixed bottom-14 left-0 right-0 z-20"
        style={{
          background: 'rgb(var(--surface-card))',
          borderTop: '1px solid rgb(var(--surface-border) / 0.35)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
        }}
      >
        <div className="max-w-lg mx-auto px-4 pt-2.5 pb-3">
          {surchargeAmt > 0 && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-amber-400/60 text-xs">Recargo {surchargePct}% ({selectedPm?.name})</span>
              <span className="text-amber-400 text-xs font-semibold">+${surchargeAmt.toLocaleString('es-AR')}</span>
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <span className="text-cream/40 text-xs font-medium uppercase tracking-wide">
              {surchargeAmt > 0 ? 'Total a cobrar' : 'Total'}
            </span>
            <span className="font-display text-3xl text-gold">${grandTotal.toLocaleString('es-AR')}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-gold w-full py-2.5"
          >
            {loading
              ? 'Guardando...'
              : (editId ? 'Guardar cambios' : 'Guardar registro')
            }
          </button>
        </div>
      </div>
    </div>
  )
}
