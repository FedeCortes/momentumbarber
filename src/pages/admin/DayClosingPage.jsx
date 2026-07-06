import { useEffect, useState } from 'react'
import { Moon, Share2, Download, Scissors, ShoppingBag, Droplets, ArrowRightLeft, Banknote, Minus, Equal } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import EmptyState from '../../components/ui/EmptyState'
import DateRangePicker, { dateRangeLabel } from '../../components/ui/DateRangePicker'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

function fmt(n) { return Number(n || 0).toLocaleString('es-AR') }

function CountButton({ count, onClick }) {
  return (
    <button
      onClick={onClick}
      className="underline decoration-dotted underline-offset-2 hover:text-cream transition-colors"
    >
      {count} {count === 1 ? 'venta' : 'ventas'}
    </button>
  )
}

function SaleDetailRow({ sale, barbers, paymentMethods, showBarber, showDate }) {
  const pm     = paymentMethods.find(p => p.id === sale.payment_method_id)
  const barber = barbers.find(b => b.id === sale.barber_id)
  const items  = sale.sale_items || []
  const itemsLabel = items.map(it => it.quantity > 1 ? `${it.name} ×${it.quantity}` : it.name).join(', ')
  const total = Number(sale.total_services || 0) + Number(sale.total_products || 0) + Number(sale.total_drinks || 0) + Number(sale.tip || 0) + Number(sale.surcharge_amt || 0)

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-dark-400/30 last:border-0">
      <div className="min-w-0">
        <p className="text-cream text-sm truncate">{itemsLabel || 'Sin ítems'}</p>
        <div className="flex flex-wrap gap-x-2 text-cream/35 text-xs mt-0.5">
          {showDate && <span className="capitalize">{format(new Date(sale.sale_date + 'T12:00:00'), 'd MMM', { locale: es })}</span>}
          <span>{format(new Date(sale.created_at), 'HH:mm')}</span>
          {showBarber && barber && <span>· {barber.name}</span>}
          <span>· {pm?.name || '—'}</span>
          {Number(sale.tip) > 0 && <span className="text-gold/50">· propina ${fmt(sale.tip)}</span>}
        </div>
      </div>
      <span className="text-cream font-medium text-sm shrink-0">${fmt(total)}</span>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-cream/35 text-xs uppercase tracking-widest font-semibold mb-3">{children}</p>
  )
}

function ExcludedRow({ icon: Icon, label, amount }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-dark-400/15">
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={11} className="text-red-400/40 shrink-0" />
        <div className="min-w-0">
          <p className="text-cream/35 text-xs">{label}</p>
          <p className="text-cream/20 text-[11px]">No le corresponde, queda 100% en el local</p>
        </div>
      </div>
      <span className="text-red-400/60 text-sm shrink-0">-${fmt(amount)}</span>
    </div>
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
  const [detail, setDetail]             = useState(null) // { title, sales, showBarber }

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

  // ── Totales globales ── (incluye recargo: es plata que efectivamente cobró el local al cliente)
  const saleTotal = s => Number(s.total_services || 0) + Number(s.total_products || 0) + Number(s.total_drinks || 0) + Number(s.tip || 0) + Number(s.surcharge_amt || 0)
  const grandTotal     = sales.reduce((sum, s) => sum + saleTotal(s), 0)
  const totalProducts  = sales.reduce((sum, s) => sum + Number(s.total_products || 0), 0)
  const totalDrinks    = sales.reduce((sum, s) => sum + Number(s.total_drinks || 0), 0)
  const totalTips      = sales.reduce((sum, s) => sum + Number(s.tip || 0), 0)
  const totalSurcharge = sales.reduce((sum, s) => sum + Number(s.surcharge_amt || 0), 0)
  const totalShop      = sales.reduce((sum, s) => sum + Number(s.shop_earnings || 0), 0)
  const totalServicesAll = sales.reduce((sum, s) => sum + Number(s.total_services || 0), 0)
  // Lo que retiene el local de los servicios: su % de comisión + servicios de ventas sin barbero (100% local)
  const shopFromServices = totalShop - totalProducts - totalDrinks - totalSurcharge
  // Lo que efectivamente se les pagó a los barberos por comisión de servicios (sin contar propinas)
  const totalBarberServiceCommission = totalServicesAll - shopFromServices

  // ── Métodos de pago ──
  const byPayment = paymentMethods.map(pm => {
    const pmSales = sales.filter(s => s.payment_method_id === pm.id)
    return { name: pm.name, total: pmSales.reduce((sum, s) => sum + saleTotal(s), 0), count: pmSales.length, sales: pmSales }
  }).filter(p => p.count > 0)

  const surchargeMethods = paymentMethods.filter(pm =>
    Number(pm.surcharge_pct) > 0 && sales.some(s => s.payment_method_id === pm.id && Number(s.surcharge_amt) > 0)
  )

  // ── Por barbero ──
  const byBarber = barbers.map(b => {
    const bSales = sales.filter(s => s.barber_id === b.id)
    if (!bSales.length) return null
    const svcs      = bSales.reduce((sum, s) => sum + Number(s.total_services || 0), 0)
    const products  = bSales.reduce((sum, s) => sum + Number(s.total_products || 0), 0)
    const drinks    = bSales.reduce((sum, s) => sum + Number(s.total_drinks || 0), 0)
    const tips      = bSales.reduce((sum, s) => sum + Number(s.tip || 0), 0)
    const earnings  = bSales.reduce((sum, s) => sum + Number(s.barber_earnings || 0), 0)
    const surcharge = bSales.reduce((sum, s) => sum + Number(s.surcharge_amt || 0), 0)
    return { barber: b, count: bSales.length, svcs, products, drinks, tips, earnings, surcharge, sales: bSales }
  }).filter(Boolean)

  // ── Ventas sin barbero ──
  const noBarberSales = sales.filter(s => !s.barber_id)
  const noBarberTotal = noBarberSales.reduce((sum, s) => sum + Number(s.total_services || 0), 0)

  const isSingle = from === to

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
      lines.push(``, `👤 A PAGAR:`)
      byBarber.forEach(({ barber, count, svcs, tips, earnings }) => {
        lines.push(``, `${barber.name} (${barber.commission_pct}% comisión)`)
        lines.push(`   Servicios (${count}): $${fmt(svcs)}`)
        if (tips > 0) lines.push(`   Propinas:         $${fmt(tips)}`)
        lines.push(`   → COBRAR:          $${fmt(earnings)}`)
      })
    }

    lines.push(
      ``, `🏪 LOCAL: $${fmt(totalShop)}`,
      shopFromServices > 0 ? `   Servicios (comisión${noBarberSales.length ? ' + sin barbero' : ''}): $${fmt(shopFromServices)}` : null,
      totalProducts > 0 ? `   Vitrina:            $${fmt(totalProducts)}` : null,
      totalDrinks   > 0 ? `   Bebidas:            $${fmt(totalDrinks)}` : null,
      totalSurcharge > 0 ? `   Recargo pagos:      $${fmt(totalSurcharge)}` : null,
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

          {/* ── TOTAL RECAUDADO ── */}
          <div className="card">
            <p className="text-cream/40 text-xs uppercase tracking-wider mb-1">Total recaudado</p>
            <p className="font-display text-4xl text-gold">${fmt(grandTotal)}</p>
            <p className="text-cream/30 text-xs mt-1">
              <CountButton count={sales.length} onClick={() => setDetail({ title: 'Todas las ventas', sales, showBarber: true })} />
            </p>

            {byPayment.length > 0 && (
              <div className="flex gap-3 pt-4 mt-4 border-t border-dark-400/40">
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
                      <p className="text-cream/25 text-xs">
                        <CountButton count={pm.count} onClick={() => setDetail({ title: pm.name, sales: pm.sales, showBarber: true })} />
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── A PAGARLE A CADA BARBERO ── */}
          {byBarber.length > 0 && (
            <div>
              <SectionLabel>A pagarle a cada barbero</SectionLabel>
              <div className="flex flex-col gap-3">
                {byBarber.map(({ barber, count, svcs, products, drinks, tips, earnings, surcharge, sales: bSales }) => (
                  <div key={barber.id} className="card">
                    {/* Encabezado */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gold/15 border border-gold/25 flex items-center justify-center font-display text-gold text-lg shrink-0">
                        {barber.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-cream text-sm">{barber.name}</p>
                        <p className="text-cream/35 text-xs">
                          <CountButton count={count} onClick={() => setDetail({ title: barber.name, sales: bSales, showBarber: false })} />
                          {' '}· {barber.commission_pct}% comisión
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-cream/35 text-xs mb-0.5">a cobrar</p>
                        <p className="font-display text-2xl text-gold">${fmt(earnings)}</p>
                      </div>
                    </div>

                    {/* Por qué le pagás eso */}
                    <div className="bg-dark-300/40 rounded-xl overflow-hidden">
                      {(surcharge > 0 || products > 0 || drinks > 0) ? (
                        <>
                          {/* Pasos intermedios: de acá sale la base de la comisión, no suman aparte */}
                          <div className="flex items-center justify-between px-4 py-2 border-b border-dark-400/15">
                            <div className="flex items-center gap-2 min-w-0">
                              <Scissors size={11} className="text-cream/20 shrink-0" />
                              <span className="text-cream/35 text-xs">Generado en sus ventas</span>
                            </div>
                            <span className="text-cream/40 text-sm shrink-0">${fmt(svcs + products + drinks + surcharge)}</span>
                          </div>
                          {products > 0 && <ExcludedRow icon={ShoppingBag} label="Vitrina vendida" amount={products} />}
                          {drinks   > 0 && <ExcludedRow icon={Droplets} label="Bebidas vendidas" amount={drinks} />}
                          {surcharge > 0 && <ExcludedRow icon={ArrowRightLeft} label="Recargo método de pago" amount={surcharge} />}

                          {/* Resultado: esto es lo que efectivamente suma al total */}
                          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-400/30 bg-dark-400/25">
                            <div className="flex items-center gap-2 min-w-0">
                              <Equal size={12} className="text-cream/45 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-cream font-medium text-xs">Comisión ({barber.commission_pct}%)</p>
                                <p className="text-cream/30 text-[11px]">Sobre ${fmt(svcs)} en servicios</p>
                              </div>
                            </div>
                            <span className="text-cream font-semibold text-sm shrink-0">${fmt(svcs * barber.commission_pct / 100)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-400/30">
                          <div className="flex items-center gap-2">
                            <Scissors size={12} className="text-cream/30" />
                            <span className="text-cream/55 text-xs">Servicios × {barber.commission_pct}% comisión</span>
                          </div>
                          <span className="text-cream/70 text-sm font-medium">${fmt(svcs * barber.commission_pct / 100)}</span>
                        </div>
                      )}
                      {tips > 0 && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-400/30">
                          <div className="flex items-center gap-2">
                            <span className="text-gold/50 text-xs">+</span>
                            <span className="text-cream/55 text-xs">Propinas (100% para él)</span>
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

          {/* ── PARA EL LOCAL ── */}
          <div>
            <SectionLabel>Para el local</SectionLabel>
            <div className="card">
              <p className="text-cream/40 text-xs uppercase tracking-wider mb-1">Total para el local</p>
              <p className="font-display text-3xl text-cream mb-4">${fmt(totalShop)}</p>

              <div>
                {shopFromServices > 0 && (
                  totalBarberServiceCommission > 0 ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2 border-b border-dark-400/15">
                        <div className="flex items-center gap-2 min-w-0">
                          <Scissors size={11} className="text-cream/20 shrink-0" />
                          <span className="text-cream/35 text-xs">Servicios generados</span>
                        </div>
                        <span className="text-cream/40 text-sm shrink-0">${fmt(totalServicesAll)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2 border-b border-dark-400/15">
                        <div className="flex items-center gap-2 min-w-0">
                          <Minus size={11} className="text-red-400/40 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-cream/35 text-xs">Pagado a los barberos</p>
                            <p className="text-cream/20 text-[11px]">Comisión sobre servicios</p>
                          </div>
                        </div>
                        <span className="text-red-400/60 text-sm shrink-0">-${fmt(totalBarberServiceCommission)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-400/30 bg-dark-400/25">
                        <div className="flex items-center gap-2 min-w-0">
                          <Equal size={12} className="text-cream/45 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-cream font-medium text-xs">Neto servicios para el local</p>
                            {noBarberSales.length > 0 && (
                              <p className="text-cream/30 text-[11px]">Incluye ${fmt(noBarberTotal)} sin barbero asignado</p>
                            )}
                          </div>
                        </div>
                        <span className="text-cream font-semibold text-sm shrink-0">${fmt(shopFromServices)}</span>
                      </div>
                    </>
                  ) : (
                    <MoneyRow
                      icon={Scissors}
                      label="Servicios"
                      sub={noBarberSales.length > 0 ? `$${fmt(noBarberTotal)} sin barbero asignado` : 'Ventas de servicios'}
                      amount={shopFromServices}
                    />
                  )
                )}
                {totalProducts > 0 && (
                  <MoneyRow icon={ShoppingBag} label="Vitrina" sub="100% local" amount={totalProducts} />
                )}
                {totalDrinks > 0 && (
                  <MoneyRow icon={Droplets} label="Bebidas" sub="100% local" amount={totalDrinks} />
                )}
                {totalSurcharge > 0 && (
                  <MoneyRow
                    icon={ArrowRightLeft}
                    label="Recargo por método de pago"
                    sub={surchargeMethods.length === 1
                      ? `${surchargeMethods[0].name} +${Number(surchargeMethods[0].surcharge_pct)}% · 100% local`
                      : 'Cargo extra a clientes que pagaron con recargo · 100% local'}
                    amount={totalSurcharge}
                  />
                )}
              </div>
            </div>
          </div>

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

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || ''} size="md">
        {detail && (
          detail.sales.length === 0
            ? <p className="text-cream/30 text-sm text-center py-4">Sin ventas</p>
            : <div className="flex flex-col">
                {[...detail.sales]
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .map(s => (
                    <SaleDetailRow
                      key={s.id}
                      sale={s}
                      barbers={barbers}
                      paymentMethods={paymentMethods}
                      showBarber={detail.showBarber}
                      showDate={!isSingle}
                    />
                  ))}
              </div>
        )}
      </Modal>
    </div>
  )
}
