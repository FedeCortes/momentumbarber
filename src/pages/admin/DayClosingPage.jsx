import { useEffect, useState } from 'react'
import { Moon, Share2, Download, Scissors, Store, Banknote, ArrowRightLeft, ShoppingBag, Droplets } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import EmptyState from '../../components/ui/EmptyState'
import DateRangePicker, { dateRangeLabel } from '../../components/ui/DateRangePicker'
import toast from 'react-hot-toast'

function fmt(n) { return Number(n || 0).toLocaleString('es-AR') }

function SectionLabel({ children }) {
  return (
    <p className="text-cream/35 text-xs uppercase tracking-widest font-semibold mb-3">{children}</p>
  )
}

function MoneyRow({ label, sub, amount, highlight, icon: Icon }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-dark-400/40 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <div className="w-7 h-7 rounded-lg bg-dark-300 flex items-center justify-center shrink-0">
            <Icon size={13} className="text-cream/40" />
          </div>
        )}
        <div className="min-w-0">
          <p className={`text-sm ${highlight ? 'text-cream font-medium' : 'text-cream/65'}`}>{label}</p>
          {sub && <p className="text-cream/30 text-xs">{sub}</p>}
        </div>
      </div>
      <span className={`font-medium text-sm ml-4 shrink-0 ${highlight ? 'text-gold' : 'text-cream/70'}`}>
        ${fmt(amount)}
      </span>
    </div>
  )
}

export default function DayClosingPage() {
  const { tenant } = useAuth()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [from, setFrom] = useState(today)
  const [to, setTo]     = useState(today)
  const [sales, setSales]               = useState([])
  const [barbers, setBarbers]           = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [loading, setLoading]           = useState(false)
  const [shared, setShared]             = useState(false)

  useEffect(() => {
    if (!tenant?.id) return
    Promise.all([
      supabase.from('barbers').select('*').eq('tenant_id', tenant.id),
      supabase.from('payment_methods').select('*').eq('tenant_id', tenant.id),
    ]).then(([b, pm]) => { setBarbers(b.data || []); setPaymentMethods(pm.data || []) })
  }, [tenant?.id])

  useEffect(() => { if (tenant?.id) load() }, [tenant?.id, from, to])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('tenant_id', tenant.id)
      .gte('sale_date', from)
      .lte('sale_date', to)
      .order('sale_date', { ascending: false })
    setSales(data || [])
    setLoading(false)
  }

  // ── Totales globales ──
  const saleTotal = s => Number(s.total_services || 0) + Number(s.total_products || 0) + Number(s.total_drinks || 0) + Number(s.tip || 0)
  const grandTotal     = sales.reduce((sum, s) => sum + saleTotal(s), 0)
  const totalServices  = sales.reduce((sum, s) => sum + Number(s.total_services || 0), 0)
  const totalProducts  = sales.reduce((sum, s) => sum + Number(s.total_products || 0), 0)
  const totalDrinks    = sales.reduce((sum, s) => sum + Number(s.total_drinks || 0), 0)
  const totalTips      = sales.reduce((sum, s) => sum + Number(s.tip || 0), 0)
  const totalBarbers   = sales.reduce((sum, s) => sum + Number(s.barber_earnings || 0), 0)
  const totalShop      = sales.reduce((sum, s) => sum + Number(s.shop_earnings || 0), 0)
  const shopFromSvcs   = totalShop - totalProducts - totalDrinks

  // ── Métodos de pago ──
  const byPayment = paymentMethods.map(pm => {
    const pmSales = sales.filter(s => s.payment_method_id === pm.id)
    return { name: pm.name, total: pmSales.reduce((sum, s) => sum + saleTotal(s), 0), count: pmSales.length }
  }).filter(p => p.count > 0)

  // ── Por barbero ──
  const byBarber = barbers.map(b => {
    const bSales = sales.filter(s => s.barber_id === b.id)
    if (!bSales.length) return null
    const svcs     = bSales.reduce((sum, s) => sum + Number(s.total_services || 0), 0)
    const tips     = bSales.reduce((sum, s) => sum + Number(s.tip || 0), 0)
    const earnings = bSales.reduce((sum, s) => sum + Number(s.barber_earnings || 0), 0)
    return { barber: b, count: bSales.length, svcs, tips, earnings }
  }).filter(Boolean)

  // ── Ventas sin barbero ──
  const noBarberSales = sales.filter(s => !s.barber_id)
  const noBarberTotal = noBarberSales.reduce((sum, s) => sum + saleTotal(s), 0)

  // ── Resumen de texto para copiar ──
  function buildText() {
    const isSingle = from === to
    const label = isSingle
      ? format(new Date(from + 'T12:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })
      : `${format(new Date(from + 'T12:00:00'), "d MMM", { locale: es })} → ${format(new Date(to + 'T12:00:00'), "d MMM yyyy", { locale: es })}`

    const lines = [
      `✂️ CIERRE — ${label.toUpperCase()}`,
      `📍 ${tenant?.name}`,
      ``,
      `💰 TOTAL: $${fmt(grandTotal)}  (${sales.length} ${sales.length === 1 ? 'venta' : 'ventas'})`,
    ]

    if (byPayment.length) {
      byPayment.forEach(p => lines.push(`   ${p.name}: $${fmt(p.total)}`))
    }

    if (byBarber.length) {
      lines.push(``, `👤 BARBEROS:`)
      byBarber.forEach(({ barber, count, svcs, tips, earnings }) => {
        lines.push(``, `${barber.name} (${barber.commission_pct}% comisión)`)
        lines.push(`   Servicios (${count}): $${fmt(svcs)}`)
        if (tips > 0) lines.push(`   Propinas:         $${fmt(tips)}`)
        lines.push(`   → COBRAR:          $${fmt(earnings)}`)
      })
    }

    if (noBarberSales.length) {
      lines.push(``, `   Sin barbero: $${fmt(noBarberTotal)} (${noBarberSales.length} ventas)`)
    }

    lines.push(
      ``, `🏪 LOCAL: $${fmt(totalShop)}`,
      shopFromSvcs > 0 ? `   Comisión servicios: $${fmt(shopFromSvcs)}` : null,
      totalProducts > 0 ? `   Vitrina:            $${fmt(totalProducts)}` : null,
      totalDrinks   > 0 ? `   Bebidas:            $${fmt(totalDrinks)}` : null,
    )

    return lines.filter(l => l !== null).join('\n')
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleShare() {
    const text     = buildText()
    const isSingle = from === to
    const label    = isSingle
      ? format(new Date(from + 'T12:00:00'), "dd-MM-yyyy", { locale: es })
      : `${format(new Date(from + 'T12:00:00'), "dd-MM", { locale: es })}_${format(new Date(to + 'T12:00:00'), "dd-MM-yyyy", { locale: es })}`
    const filename = `cierre_${label}.txt`

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Cierre de caja', text })
        setShared(true)
        setTimeout(() => setShared(false), 2500)
        return
      } catch {
        // usuario canceló o falla → fallback a descarga
      }
    }

    downloadText(text, filename)
    setShared(true)
    setTimeout(() => setShared(false), 2500)
    toast.success('Resumen descargado')
  }

  // ── Barra de distribución ──
  const barberPct = grandTotal > 0 ? Math.round((totalBarbers / grandTotal) * 100) : 0
  const shopPct   = 100 - barberPct

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="section-title mb-0.5">Cierre</h1>
        <p className="section-sub capitalize">{dateRangeLabel(from, to)}</p>
      </div>
      <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mt-6" />
        </div>
      ) : sales.length === 0 ? (
        <EmptyState
          icon={Moon}
          title="Sin ventas registradas"
          description="No hay ventas oficiales para este período"
        />
      ) : (
        <div className="mt-5 flex flex-col gap-5">

          {/* ── TOTALES PRINCIPALES ── */}
          <div className="card">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-cream/40 text-xs uppercase tracking-wider mb-1">Total recaudado</p>
                <p className="font-display text-4xl text-gold">${fmt(grandTotal)}</p>
                <p className="text-cream/30 text-xs mt-1">{sales.length} {sales.length === 1 ? 'venta' : 'ventas'}</p>
              </div>
            </div>

            {/* Métodos de pago */}
            {byPayment.length > 0 && (
              <div className="flex gap-3 pt-3 border-t border-dark-400/40">
                {byPayment.map(pm => {
                  const isCash = pm.name.toLowerCase().includes('efectivo')
                  return (
                    <div key={pm.name} className="flex-1 bg-dark-300/60 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        {isCash
                          ? <Banknote size={12} className="text-emerald-400/70" />
                          : <ArrowRightLeft size={12} className="text-blue-400/70" />
                        }
                        <span className="text-cream/40 text-xs">{pm.name}</span>
                      </div>
                      <p className="font-medium text-cream text-base">${fmt(pm.total)}</p>
                      <p className="text-cream/25 text-xs">{pm.count} {pm.count === 1 ? 'venta' : 'ventas'}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── DISTRIBUCIÓN VISUAL ── */}
          <div className="card">
            <SectionLabel>Distribución del dinero</SectionLabel>

            {/* Barra visual */}
            {grandTotal > 0 && (
              <div className="mb-4">
                <div className="flex rounded-full overflow-hidden h-3 mb-2">
                  {totalBarbers > 0 && (
                    <div
                      className="bg-gold transition-all"
                      style={{ width: `${barberPct}%` }}
                    />
                  )}
                  {totalShop > 0 && (
                    <div
                      className="bg-dark-500 transition-all"
                      style={{ width: `${shopPct}%` }}
                    />
                  )}
                </div>
                <div className="flex gap-4 text-xs">
                  {totalBarbers > 0 && (
                    <span className="flex items-center gap-1.5 text-cream/50">
                      <span className="w-2 h-2 rounded-full bg-gold inline-block" />
                      Barberos {barberPct}%
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-cream/50">
                    <span className="w-2 h-2 rounded-full bg-dark-500 inline-block" />
                    Local {shopPct}%
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {totalBarbers > 0 && (
                <div className="flex-1 bg-gold/8 border border-gold/20 rounded-xl px-4 py-3">
                  <p className="text-gold/60 text-xs mb-1">Total barberos</p>
                  <p className="font-display text-2xl text-gold">${fmt(totalBarbers)}</p>
                  {totalTips > 0 && <p className="text-gold/40 text-xs mt-0.5">incl. ${fmt(totalTips)} en propinas</p>}
                </div>
              )}
              <div className="flex-1 bg-dark-300/50 border border-dark-400/40 rounded-xl px-4 py-3">
                <p className="text-cream/40 text-xs mb-1">Total local</p>
                <p className="font-display text-2xl text-cream">${fmt(totalShop)}</p>
                {(totalProducts + totalDrinks) > 0 && (
                  <p className="text-cream/30 text-xs mt-0.5">incl. ${fmt(totalProducts + totalDrinks)} vitrina/bebidas</p>
                )}
              </div>
            </div>
          </div>

          {/* ── POR BARBERO ── */}
          {byBarber.length > 0 && (
            <div>
              <SectionLabel>Lo que cobra cada barbero</SectionLabel>
              <div className="flex flex-col gap-3">
                {byBarber.map(({ barber, count, svcs, tips, earnings }) => (
                  <div key={barber.id} className="card">
                    {/* Encabezado */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gold/15 border border-gold/25 flex items-center justify-center font-display text-gold text-lg shrink-0">
                        {barber.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-cream text-sm">{barber.name}</p>
                        <p className="text-cream/35 text-xs">{count} {count === 1 ? 'venta' : 'ventas'} · {barber.commission_pct}% comisión</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-cream/35 text-xs mb-0.5">a cobrar</p>
                        <p className="font-display text-2xl text-gold">${fmt(earnings)}</p>
                      </div>
                    </div>

                    {/* Desglose */}
                    <div className="bg-dark-300/40 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-400/30">
                        <div className="flex items-center gap-2">
                          <Scissors size={12} className="text-cream/30" />
                          <span className="text-cream/55 text-xs">Servicios realizados</span>
                        </div>
                        <span className="text-cream/70 text-sm font-medium">${fmt(svcs)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-400/30">
                        <div className="flex items-center gap-2">
                          <span className="text-cream/30 text-xs font-mono">×</span>
                          <span className="text-cream/55 text-xs">Comisión ({barber.commission_pct}%)</span>
                        </div>
                        <span className="text-cream/70 text-sm font-medium">${fmt(svcs * barber.commission_pct / 100)}</span>
                      </div>
                      {tips > 0 && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-400/30">
                          <div className="flex items-center gap-2">
                            <span className="text-gold/50 text-xs">+</span>
                            <span className="text-cream/55 text-xs">Propinas (100%)</span>
                          </div>
                          <span className="text-gold/80 text-sm font-medium">+${fmt(tips)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gold/5">
                        <span className="text-gold/70 text-xs font-semibold uppercase tracking-wider">Total a pagarle</span>
                        <span className="text-gold font-display text-lg">${fmt(earnings)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── VENTAS SIN BARBERO ── */}
          {noBarberSales.length > 0 && (
            <div>
              <SectionLabel>Ventas sin barbero asignado</SectionLabel>
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-cream/60 text-sm">{noBarberSales.length} {noBarberSales.length === 1 ? 'venta' : 'ventas'} sin barbero</p>
                    <p className="text-cream/30 text-xs">Todo va al local</p>
                  </div>
                  <p className="font-display text-xl text-cream">${fmt(noBarberTotal)}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── LO DEL LOCAL ── */}
          <div>
            <SectionLabel>Detalle del local</SectionLabel>
            <div className="card">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-cream/40 text-xs uppercase tracking-wider mb-1">Total para el local</p>
                  <p className="font-display text-3xl text-cream">${fmt(totalShop)}</p>
                </div>
              </div>
              <div>
                {shopFromSvcs > 0 && (
                  <MoneyRow
                    icon={Scissors}
                    label="Comisión de servicios"
                    sub="Lo que queda tras pagar a los barberos"
                    amount={shopFromSvcs}
                  />
                )}
                {totalProducts > 0 && (
                  <MoneyRow
                    icon={ShoppingBag}
                    label="Vitrina"
                    sub="Productos vendidos · 100% local"
                    amount={totalProducts}
                  />
                )}
                {totalDrinks > 0 && (
                  <MoneyRow
                    icon={Droplets}
                    label="Bebidas"
                    sub="100% local"
                    amount={totalDrinks}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── DESGLOSE DE SERVICIOS ── */}
          {(totalServices > 0 || totalProducts > 0 || totalDrinks > 0 || totalTips > 0) && (
            <div>
              <SectionLabel>Desglose general</SectionLabel>
              <div className="card">
                {totalServices > 0 && (
                  <MoneyRow icon={Scissors} label="Servicios" sub="Total bruto antes de comisiones" amount={totalServices} />
                )}
                {totalProducts > 0 && (
                  <MoneyRow icon={ShoppingBag} label="Vitrina" amount={totalProducts} />
                )}
                {totalDrinks > 0 && (
                  <MoneyRow icon={Droplets} label="Bebidas" amount={totalDrinks} />
                )}
                {totalTips > 0 && (
                  <MoneyRow label="Propinas" sub="Van 100% al barbero" amount={totalTips} highlight />
                )}
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-dark-400/40">
                  <span className="text-cream/60 text-sm font-medium">Total</span>
                  <span className="font-display text-xl text-gold">${fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── COMPARTIR / DESCARGAR ── */}
          <button
            onClick={handleShare}
            className="btn-outline-gold w-full flex items-center justify-center gap-2 text-sm"
          >
            {shared
              ? <Download size={15} className="text-emerald-400" />
              : navigator.share
                ? <Share2 size={15} />
                : <Download size={15} />
            }
            {shared
              ? 'Listo!'
              : navigator.share
                ? 'Compartir resumen'
                : 'Descargar resumen'
            }
          </button>
        </div>
      )}
    </div>
  )
}
