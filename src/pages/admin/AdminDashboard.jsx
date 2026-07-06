import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag, Users, TrendingUp, Moon, FileText, ArrowRight, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function AdminDashboard() {
  const { tenant } = useAuth()
  const [stats, setStats] = useState({ todaySales: 0, todayTotal: 0, monthTotal: 0, barberCount: 0, todayDrafts: 0, todayShop: 0 })
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => {
    if (!tenant?.id) return
    loadStats()
  }, [tenant?.id])

  async function loadStats() {
    const [salesDay, salesMonth, barbers, drafts] = await Promise.all([
      supabase.from('sales').select('total, shop_earnings').eq('tenant_id', tenant.id).eq('sale_date', today),
      supabase.from('sales').select('total').eq('tenant_id', tenant.id).gte('sale_date', month + '-01'),
      supabase.from('barbers').select('id', { count: 'exact' }).eq('tenant_id', tenant.id).eq('is_active', true),
      supabase.from('drafts').select('id', { count: 'exact' }).eq('tenant_id', tenant.id).eq('draft_date', today),
    ])

    const todayTotal = (salesDay.data || []).reduce((s, r) => s + Number(r.total), 0)
    const todayShop  = (salesDay.data || []).reduce((s, r) => s + Number(r.shop_earnings), 0)
    const monthTotal = (salesMonth.data || []).reduce((s, r) => s + Number(r.total), 0)

    setStats({
      todaySales:    salesDay.data?.length || 0,
      todayTotal,
      todayShop,
      monthTotal,
      barberCount:  barbers.count || 0,
      todayDrafts:  drafts.count || 0,
    })
    setLoading(false)
  }

  const todayLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <p className="page-eyebrow capitalize">{todayLabel}</p>
        <h1 className="section-title">{tenant?.name}</h1>
      </div>

      {/* Aviso de registros de barberos hoy */}
      {stats.todayDrafts > 0 && (
        <Link to="/admin/drafts" className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3 mb-5 hover:border-amber-500/40 transition-colors group">
          <AlertCircle size={18} className="text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-amber-400 text-sm font-medium">{stats.todayDrafts} registro{stats.todayDrafts > 1 ? 's' : ''} de barberos hoy</p>
            <p className="text-amber-400/50 text-xs">Tocar para comparar con lo oficial</p>
          </div>
          <ArrowRight size={15} className="text-amber-400/40 group-hover:text-amber-400/80 transition-colors" />
        </Link>
      )}

      {/* KPIs del día */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`stat-card ${i === 0 ? 'col-span-2' : ''} animate-pulse`}>
              <div className="h-3 bg-dark-400/60 rounded w-20 mb-2" />
              <div className="h-8 bg-dark-400/40 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-7">
          {/* Hero stat */}
          <div className="stat-card col-span-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/4 rounded-full -translate-y-12 translate-x-12 pointer-events-none" />
            <span className="stat-label">Recaudado hoy</span>
            <span className="stat-value text-4xl">${stats.todayTotal.toLocaleString('es-AR')}</span>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-cream/30 text-xs">{stats.todaySales} venta{stats.todaySales !== 1 ? 's' : ''}</span>
              {stats.todayShop > 0 && (
                <span className="text-cream/30 text-xs">Local: <span className="text-cream/50">${stats.todayShop.toLocaleString('es-AR')}</span></span>
              )}
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">Este mes</span>
            <span className="font-display text-2xl text-cream">${stats.monthTotal.toLocaleString('es-AR')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Barberos activos</span>
            <span className="font-display text-2xl text-cream">{stats.barberCount}</span>
          </div>
        </div>
      )}

      {/* Acceso rápido */}
      <p className="page-eyebrow mb-3">Acceso rápido</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { to: '/admin/sales',   label: 'Nueva venta',     sub: 'Registrar un servicio', icon: ShoppingBag, accent: 'text-gold bg-gold/12 border-gold/20' },
          { to: '/admin/drafts',  label: 'Registros',       sub: 'Ventas oficiales del día', icon: FileText,   accent: 'text-amber-400 bg-amber-500/12 border-amber-500/20' },
          { to: '/admin/closing', label: 'Cierre',          sub: 'Resumen y distribución', icon: Moon,       accent: 'text-purple-400 bg-purple-500/12 border-purple-500/20' },
          { to: '/admin/stats',   label: 'Estadísticas',    sub: 'Análisis de ventas',     icon: TrendingUp,  accent: 'text-emerald-400 bg-emerald-500/12 border-emerald-500/20' },
        ].map(({ to, label, sub, icon: Icon, accent }) => (
          <Link key={to} to={to} className="card-hover flex flex-col gap-3 group">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${accent}`}>
              <Icon size={18} />
            </div>
            <div className="flex-1">
              <p className="text-cream font-medium text-sm mb-0.5">{label}</p>
              <p className="text-cream/35 text-xs leading-snug">{sub}</p>
            </div>
            <ArrowRight size={13} className="text-cream/15 group-hover:text-cream/35 transition-colors self-end" />
          </Link>
        ))}
      </div>
    </div>
  )
}
