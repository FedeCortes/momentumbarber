import { useEffect, useState } from 'react'
import { ChevronDown, ClipboardList, CheckCircle2, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../../components/ui/EmptyState'
import DateRangePicker, { dateRangeLabel } from '../../components/ui/DateRangePicker'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

function DraftRow({ draft, paymentMethods, showDate, onDelete }) {
  const navigate = useNavigate()
  const [open, setOpen]               = useState(false)
  const [items, setItems]             = useState(null)
  const [confirmDelete, setConfirm]   = useState(false)
  const [deleting, setDeleting]       = useState(false)

  const isPending = draft.status === 'pending'
  const pm        = paymentMethods.find(p => p.id === draft.payment_method_id)

  async function handleToggle() {
    if (open) { setOpen(false); return }
    if (!items) {
      const { data } = await supabase.from('draft_items').select('*').eq('draft_id', draft.id)
      setItems(data || [])
    }
    setOpen(true)
  }

  async function handleDelete(e) {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirm(true)
      setTimeout(() => setConfirm(false), 3000)
      return
    }
    setDeleting(true)
    const { error } = await supabase.from('drafts').delete().eq('id', draft.id)
    if (error) { toast.error('No se pudo eliminar'); setDeleting(false) }
    else onDelete?.()
  }

  function handleEdit(e) {
    e.stopPropagation()
    navigate(`/barber?edit=${draft.id}`)
  }

  const statusStyle = {
    pending:   { label: 'Pendiente',   cls: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
    approved:  { label: 'Aprobado ✓',  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
    discarded: { label: 'Descartado',  cls: 'text-cream/25 bg-dark-300/30 border-dark-400/20' },
  }[draft.status]

  return (
    <div className={`rounded-2xl border overflow-hidden transition-opacity ${
      draft.status === 'discarded' ? 'opacity-40' : ''
    } ${isPending ? 'border-amber-500/20' : 'border-dark-400/40'}`}>

      {/* Fila principal */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-dark-300/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-cream">${Number(draft.total).toLocaleString('es-AR')}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle.cls}`}>
              {statusStyle.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0">
            {showDate && (
              <span className="text-gold/50 text-xs capitalize">
                {format(new Date(draft.draft_date + 'T12:00:00'), "d MMM", { locale: es })}
              </span>
            )}
            <span className="text-cream/30 text-xs">{pm?.name || '—'}</span>
            <span className="text-cream/30 text-xs">{format(new Date(draft.created_at), 'HH:mm')}</span>
            {Number(draft.tip) > 0 && (
              <span className="text-gold/45 text-xs">+${Number(draft.tip).toLocaleString('es-AR')} propina</span>
            )}
          </div>
        </div>

        {/* Acciones para pendientes */}
        {isPending && (
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={handleEdit}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-cream/30 hover:text-gold hover:bg-gold/10 transition-all active:scale-90"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                confirmDelete
                  ? 'px-3 bg-red-500/12 text-red-400 border border-red-500/25 text-xs font-bold'
                  : 'w-9 text-cream/30 hover:text-red-400 hover:bg-red-500/8'
              }`}
            >
              {confirmDelete ? 'Eliminar' : <Trash2 size={15} />}
            </button>
          </div>
        )}

        <ChevronDown
          size={14}
          className={`text-cream/20 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Detalle expandido */}
      {open && items && (
        <div className="px-4 py-3 border-t border-dark-400/20 bg-dark-300/20">
          {items.length > 0 ? (
            <div className="flex flex-col gap-2">
              {items.map(it => (
                <div key={it.id} className="flex justify-between items-center">
                  <span className="text-cream/60 text-sm">{it.name}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</span>
                  <span className="text-cream/40 text-sm">${Number(it.subtotal).toLocaleString('es-AR')}</span>
                </div>
              ))}
              {Number(draft.tip) > 0 && (
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-dark-400/20">
                  <span className="text-cream/55 text-sm">Propina</span>
                  <span className="text-gold text-sm font-semibold">+${Number(draft.tip).toLocaleString('es-AR')}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-cream/25 text-xs">Sin detalle de ítems</p>
          )}
        </div>
      )}
    </div>
  )
}

function SaleRow({ sale, paymentMethods, showDate }) {
  const [open, setOpen]   = useState(false)
  const [items, setItems] = useState(null)
  const pm                = paymentMethods.find(p => p.id === sale.payment_method_id)
  const earnings          = Number(sale.barber_earnings)

  async function handleToggle() {
    if (open) { setOpen(false); return }
    if (!items) {
      const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id)
      setItems(data || [])
    }
    setOpen(true)
  }

  return (
    <div className="rounded-2xl border border-emerald-500/20 overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-dark-300/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-cream">${Number(sale.total).toLocaleString('es-AR')}</span>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              Oficial ✓
            </span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0">
            {showDate && (
              <span className="text-gold/50 text-xs capitalize">
                {format(new Date(sale.sale_date + 'T12:00:00'), "d MMM", { locale: es })}
              </span>
            )}
            <span className="text-cream/30 text-xs">{pm?.name || '—'}</span>
            <span className="text-cream/30 text-xs">{format(new Date(sale.created_at), 'HH:mm')}</span>
            {earnings > 0 && (
              <span className="text-gold/65 text-xs font-semibold">
                Para vos: ${earnings.toLocaleString('es-AR')}
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          size={14}
          className={`text-cream/20 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && items && (
        <div className="px-4 py-3 border-t border-emerald-500/15 bg-emerald-500/3">
          {items.length > 0 ? (
            <div className="flex flex-col gap-2">
              {items.map(it => (
                <div key={it.id} className="flex justify-between items-center">
                  <span className="text-cream/60 text-sm">{it.name}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</span>
                  <span className="text-cream/40 text-sm">${Number(it.subtotal).toLocaleString('es-AR')}</span>
                </div>
              ))}
              {Number(sale.tip) > 0 && (
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-emerald-500/15">
                  <span className="text-cream/55 text-sm">Propina</span>
                  <span className="text-gold text-sm font-semibold">+${Number(sale.tip).toLocaleString('es-AR')}</span>
                </div>
              )}
              {earnings > 0 && (
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-emerald-500/15">
                  <span className="text-emerald-400/80 text-sm font-bold">Te corresponde</span>
                  <span className="text-emerald-400 text-base font-bold">${earnings.toLocaleString('es-AR')}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-cream/25 text-xs">Sin detalle de ítems</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function BarberHistoryPage() {
  const { tenant, barberSession } = useAuth()
  const barber = barberSession?.barber
  const today  = new Date().toISOString().split('T')[0]

  const [from, setFrom]               = useState(today)
  const [to, setTo]                   = useState(today)
  const [drafts, setDrafts]           = useState([])
  const [sales, setSales]             = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('drafts')

  useEffect(() => {
    if (!tenant?.id) return
    supabase.from('payment_methods').select('*').eq('tenant_id', tenant.id)
      .then(({ data }) => setPaymentMethods(data || []))
  }, [tenant?.id])

  useEffect(() => {
    if (!tenant?.id || !barber?.id) return
    load()
  }, [tenant?.id, barber?.id, from, to])

  async function load() {
    setLoading(true)
    const [{ data: draftData }, { data: salesData }] = await Promise.all([
      supabase.from('drafts').select('*')
        .eq('tenant_id', tenant.id).eq('barber_id', barber.id)
        .gte('draft_date', from).lte('draft_date', to)
        .order('created_at', { ascending: false }),
      supabase.from('sales').select('*')
        .eq('tenant_id', tenant.id).eq('barber_id', barber.id)
        .gte('sale_date', from).lte('sale_date', to)
        .order('created_at', { ascending: false }),
    ])
    setDrafts(draftData || [])
    setSales(salesData || [])
    setLoading(false)
  }

  const activeDrafts = drafts.filter(d => d.status !== 'discarded')
  const pendingCount = drafts.filter(d => d.status === 'pending').length
  const draftTotal   = activeDrafts.reduce((s, d) => s + Number(d.total), 0)
  const salesTotal   = sales.reduce((s, r) => s + Number(r.total), 0)
  const myEarnings   = sales.reduce((s, r) => s + Number(r.barber_earnings), 0)
  const myTips       = sales.reduce((s, r) => s + Number(r.tip), 0)
  const match        = draftTotal > 0 && salesTotal > 0 && draftTotal === salesTotal
  const hasActivity  = drafts.length > 0 || sales.length > 0
  const isSingle     = from === to
  const isToday      = from === today && to === today

  return (
    <div className="pb-6">

      {/* Header */}
      <div className="mb-5">
        <h1 className="section-title">Mis registros</h1>
        <p className="section-sub capitalize">{dateRangeLabel(from, to)}</p>
        <div className="mt-3">
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} max={today} />
        </div>
      </div>

      {/* Resumen */}
      {hasActivity && !loading && (
        <div className="card mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-cream/40 text-[11px] uppercase tracking-wider font-bold mb-1">Reporté</p>
              <p className="font-display text-2xl text-gold">${draftTotal.toLocaleString('es-AR')}</p>
              <p className="text-cream/30 text-xs mt-0.5">
                {activeDrafts.length} registro{activeDrafts.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="text-cream/40 text-[11px] uppercase tracking-wider font-bold mb-1">Oficial</p>
              <p className="font-display text-2xl text-cream">${salesTotal.toLocaleString('es-AR')}</p>
              <p className="text-cream/30 text-xs mt-0.5">
                {sales.length} venta{sales.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {myEarnings > 0 && (
            <div className="mt-4 pt-4 border-t border-dark-400/30 flex items-end justify-between">
              <div>
                <p className="text-cream/40 text-[11px] uppercase tracking-wider font-bold mb-0.5">Lo que te corresponde</p>
                {myTips > 0 && (
                  <p className="text-gold/40 text-xs">incl. ${myTips.toLocaleString('es-AR')} en propinas</p>
                )}
              </div>
              <p className="font-display text-3xl text-gold">${myEarnings.toLocaleString('es-AR')}</p>
            </div>
          )}

          {draftTotal > 0 && salesTotal > 0 && (
            <div className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${match ? 'text-emerald-400' : 'text-amber-400'}`}>
              {match
                ? <><CheckCircle2 size={13} /> Los totales coinciden</>
                : <><AlertTriangle size={13} /> Los totales no coinciden — consultá con el admin</>
              }
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      {hasActivity && !loading && (
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgb(var(--surface-input) / 0.55)' }}>
          <button
            onClick={() => setTab('drafts')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === 'drafts'
                ? 'bg-dark-200 text-gold'
                : 'text-cream/40 hover:text-cream/65'
            }`}
            style={tab === 'drafts' ? { boxShadow: 'var(--sh-card)' } : {}}
          >
            Mis registros {drafts.length > 0 && <span className="opacity-60 text-xs">({drafts.length})</span>}
          </button>
          <button
            onClick={() => setTab('sales')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === 'sales'
                ? 'bg-dark-200 text-emerald-400'
                : 'text-cream/40 hover:text-cream/65'
            }`}
            style={tab === 'sales' ? { boxShadow: 'var(--sh-card)' } : {}}
          >
            Oficial {sales.length > 0 && <span className="opacity-60 text-xs">({sales.length})</span>}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasActivity ? (
        <EmptyState
          icon={ClipboardList}
          title={isToday ? 'Sin registros hoy' : 'Sin registros este período'}
          description={isToday ? 'Tus registros del día aparecerán acá' : 'No hay actividad para estas fechas'}
        />
      ) : tab === 'drafts' ? (
        drafts.length === 0 ? (
          <p className="text-cream/25 text-sm text-center py-8">Sin registros en este período</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {pendingCount > 0 && (
              <p className="text-cream/28 text-xs flex items-center gap-1.5 mb-1">
                <Pencil size={11} />
                Los pendientes se pueden editar o eliminar
              </p>
            )}
            {drafts.map(d => (
              <DraftRow
                key={d.id}
                draft={d}
                paymentMethods={paymentMethods}
                showDate={!isSingle}
                onDelete={load}
              />
            ))}
          </div>
        )
      ) : (
        sales.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-cream/30 text-sm font-medium">Sin ventas oficiales</p>
            <p className="text-cream/20 text-xs mt-1">
              El admin aún no cargó ventas para este período
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sales.map(s => (
              <SaleRow
                key={s.id}
                sale={s}
                paymentMethods={paymentMethods}
                showDate={!isSingle}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}
