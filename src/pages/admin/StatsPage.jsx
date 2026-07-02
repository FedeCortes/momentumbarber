import { useEffect, useState } from 'react'
import { TrendingUp, Award, Scissors, CreditCard, DollarSign } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const GOLD = '#C9A84C'
const DARK = '#2A2A2A'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-dark-300 border border-dark-400 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-cream/50 mb-1">{label}</p>
      <p className="text-gold font-medium">${Number(payload[0].value).toLocaleString('es-AR')}</p>
    </div>
  )
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-7 h-7 rounded-lg bg-gold/12 border border-gold/20 flex items-center justify-center">
        <Icon size={14} className="text-gold" />
      </div>
      <h3 className="font-display text-base text-cream">{title}</h3>
    </div>
  )
}

export default function StatsPage() {
  const { tenant } = useAuth()
  const [sales, setSales] = useState([])
  const [barbers, setBarbers] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [range, setRange] = useState('today')
  const [barberFilter, setBarberFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenant?.id) return
    Promise.all([
      supabase.from('barbers').select('*').eq('tenant_id', tenant.id),
      supabase.from('payment_methods').select('*').eq('tenant_id', tenant.id),
    ]).then(([b, pm]) => {
      setBarbers(b.data || [])
      setPaymentMethods(pm.data || [])
    })
    load()
  }, [tenant?.id, range, barberFilter])

  async function load() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    let query = supabase.from('sales').select('*, sale_items(*)').eq('tenant_id', tenant.id)
    if (range === 'today') {
      query = query.eq('sale_date', today)
    } else {
      query = query.gte('sale_date', format(subDays(new Date(), parseInt(range)), 'yyyy-MM-dd'))
    }
    if (barberFilter !== 'all') query = query.eq('barber_id', barberFilter)
    const { data } = await query
    setSales(data || [])
    setLoading(false)
  }

  // Ventas por día
  const days = range === 'today' ? 1 : parseInt(range)
  const interval = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() })
  const salesByDay = interval.map(d => {
    const dateStr = format(d, 'yyyy-MM-dd')
    const daySales = sales.filter(s => s.sale_date === dateStr)
    return {
      day: format(d, days <= 7 ? 'EEE' : 'dd/MM', { locale: es }),
      total: daySales.reduce((sum, s) => sum + Number(s.total), 0),
    }
  })

  // KPIs
  const totalAll  = sales.reduce((s, r) => s + Number(r.total), 0)
  const totalShop = sales.reduce((s, r) => s + Number(r.shop_earnings), 0)
  const avgTip    = sales.length > 0 ? sales.reduce((s, r) => s + Number(r.tip), 0) / sales.length : 0
  const avgTicket = sales.length > 0 ? totalAll / sales.length : 0

  // Ranking barberos
  const barberRanking = barbers
    .map(b => {
      const bSales = sales.filter(s => s.barber_id === b.id)
      return {
        name: b.name,
        total: bSales.reduce((s, r) => s + Number(r.total), 0),
        earnings: bSales.reduce((s, r) => s + Number(r.barber_earnings), 0),
        count: bSales.length,
        tips: bSales.reduce((s, r) => s + Number(r.tip), 0),
      }
    })
    .filter(b => b.count > 0)
    .sort((a, b) => b.total - a.total)

  // Servicios más pedidos — con cantidad Y recaudación
  const serviceMap = {}
  sales.forEach(s => {
    s.sale_items?.filter(i => i.item_type === 'service').forEach(item => {
      if (!serviceMap[item.name]) serviceMap[item.name] = { count: 0, revenue: 0 }
      serviceMap[item.name].count   += item.quantity
      serviceMap[item.name].revenue += Number(item.subtotal)
    })
  })
  const topServices = Object.entries(serviceMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const maxCount = topServices[0]?.count || 1

  // Métodos de pago
  const pmBreakdown = paymentMethods.map(pm => {
    const pmSales = sales.filter(s => s.payment_method_id === pm.id)
    return {
      name: pm.name,
      total: pmSales.reduce((s, r) => s + Number(r.total), 0),
      count: pmSales.length,
    }
  }).filter(pm => pm.count > 0).sort((a, b) => b.total - a.total)

  const RANGE_LABELS = { today: 'Hoy', '7': '7 días', '14': '14 días', '30': '30 días' }

  return (
    <div>
      <div className="mb-6">
        <h1 className="section-title">Estadísticas</h1>
        <p className="section-sub">Análisis de ventas · {RANGE_LABELS[range]}</p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {['today', '7', '14', '30'].map(d => (
          <button
            key={d}
            onClick={() => setRange(d)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              range === d ? 'bg-gold text-dark scale-105' : 'bg-dark-300 text-cream/50 hover:bg-dark-400'
            }`}
          >
            {RANGE_LABELS[d]}
          </button>
        ))}
        <select
          className="bg-dark-300 text-cream/60 text-xs rounded-full px-3 py-1.5 border border-dark-400 outline-none ml-auto"
          value={barberFilter}
          onChange={e => setBarberFilter(e.target.value)}
        >
          <option value="all">Todos los barberos</option>
          {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-7 h-7 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-dark-300 flex items-center justify-center mb-4">
            <TrendingUp size={24} className="text-cream/20" />
          </div>
          <p className="font-display text-lg text-cream/30">Sin datos para este período</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="stat-card col-span-2">
              <span className="stat-label">Total del período</span>
              <span className="stat-value">${totalAll.toLocaleString('es-AR')}</span>
              <div className="flex gap-4 mt-1">
                <span className="text-cream/30 text-xs">{sales.length} ventas</span>
                <span className="text-cream/30 text-xs">Local: <span className="text-cream/50">${totalShop.toLocaleString('es-AR')}</span></span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-label">Ticket promedio</span>
              <span className="font-display text-2xl text-cream">${Math.round(avgTicket).toLocaleString('es-AR')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Propina promedio</span>
              <span className="font-display text-2xl text-gold">${Math.round(avgTip).toLocaleString('es-AR')}</span>
            </div>
          </div>

          {/* Gráfico — solo si hay más de 1 día */}
          {range !== 'today' && (
            <div className="card mb-4">
              <SectionHeader icon={TrendingUp} title="Ventas por día" />
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={salesByDay} barSize={range === '7' ? 24 : range === '14' ? 14 : 8} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={DARK} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#F5F5F545', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="total" fill={GOLD} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Servicios más pedidos */}
          {topServices.length > 0 && (
            <div className="card mb-4">
              <SectionHeader icon={Scissors} title="Servicios más pedidos" />
              <div className="flex flex-col gap-3">
                {topServices.map(({ name, count, revenue }, i) => (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-display text-sm shrink-0 w-5 text-center ${i === 0 ? 'text-gold' : 'text-cream/25'}`}>
                          {i + 1}
                        </span>
                        <span className="text-cream/80 text-sm truncate">{name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-cream/40 text-xs">{count}×</span>
                        <span className="text-gold text-sm font-medium">${revenue.toLocaleString('es-AR')}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-dark-300 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${i === 0 ? 'bg-gold' : 'bg-gold/40'}`}
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ranking barberos */}
          {barberRanking.length > 0 && (
            <div className="card mb-4">
              <SectionHeader icon={Award} title="Ranking de barberos" />
              <div className="flex flex-col gap-4">
                {barberRanking.map((b, i) => (
                  <div key={b.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`font-display text-sm w-5 text-center ${i === 0 ? 'text-gold' : 'text-cream/25'}`}>{i + 1}</span>
                        <div>
                          <p className="text-cream/85 text-sm font-medium">{b.name}</p>
                          <p className="text-cream/30 text-xs">{b.count} ventas · propinas ${b.tips.toLocaleString('es-AR')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-gold font-medium text-sm">${b.total.toLocaleString('es-AR')}</p>
                        <p className="text-cream/30 text-xs">cobra ${b.earnings.toLocaleString('es-AR')}</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-dark-300 rounded-full overflow-hidden ml-7">
                      <div
                        className={`h-full rounded-full ${i === 0 ? 'bg-gold' : 'bg-gold/35'}`}
                        style={{ width: `${barberRanking[0].total ? (b.total / barberRanking[0].total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Métodos de pago */}
          {pmBreakdown.length > 0 && (
            <div className="card mb-4">
              <SectionHeader icon={CreditCard} title="Métodos de pago" />
              <div className="flex flex-col gap-3">
                {pmBreakdown.map((pm, i) => (
                  <div key={pm.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-cream/70 text-sm">{pm.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-cream/35 text-xs">{pm.count} ventas</span>
                        <span className="text-cream/80 text-sm font-medium">${pm.total.toLocaleString('es-AR')}</span>
                        <span className="text-cream/30 text-xs w-9 text-right">
                          {totalAll ? Math.round((pm.total / totalAll) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-dark-300 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cream/40"
                        style={{ width: `${totalAll ? (pm.total / totalAll) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
