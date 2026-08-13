import { useEffect, useState } from 'react'
import { ChevronDown, ClipboardList, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../../components/ui/EmptyState'
import DateRangePicker, { dateRangeLabel } from '../../components/ui/DateRangePicker'
import CommissionBadge from '../../components/ui/CommissionBadge'
import { groupByPct } from '../../lib/earnings'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'

// Línea de ítem — muestra con qué % se paga cada servicio
function ItemLine({ it, barberPct }) {
  const pct  = it.commission_pct != null ? Number(it.commission_pct) : null
  const show = it.item_type === 'service' && pct != null
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-cream/60 text-sm min-w-0">
        {it.name}{it.quantity > 1 ? ` ×${it.quantity}` : ''}
        {show && (
          <span className="ml-1.5 align-middle inline-block">
            <CommissionBadge pct={pct} variant="barber" size="xs" isDefault={pct === Number(barberPct)} />
          </span>
        )}
      </span>
      <span className="text-cream/40 text-sm shrink-0">${Number(it.subtotal).toLocaleString('es-AR')}</span>
    </div>
  )
}

function DraftRow({ draft, paymentMethods, showDate, onDelete, barber, earnings }) {
  const navigate = useNavigate()
  const [open, setOpen]             = useState(false)
  const [items, setItems]           = useState(draft.draft_items || null)
  const [confirmDelete, setConfirm] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  const pm = paymentMethods.find(p => p.id === draft.payment_method_id)

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

  return (
    <div className="rounded-2xl border border-dark-400/40 overflow-hidden">

      {/* Fila principal */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-dark-300/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-cream">${Number(draft.total).toLocaleString('es-AR')}</span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0">
            {showDate && (
              <span className="text-gold/50 text-xs capitalize">
                {format(new Date(draft.draft_date + 'T12:00:00'), "d MMM", { locale: es })}
              </span>
            )}
            <span className="text-cream/30 text-xs">{pm?.name || '—'}</span>
            <span className="text-cream/30 text-xs">{format(new Date(draft.created_at), 'HH:mm')}</span>
            {earnings > 0 && (
              <span className="text-gold/65 text-xs font-semibold">
                Para vos: ${earnings.toLocaleString('es-AR')}
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
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
              {items.map(it => <ItemLine key={it.id} it={it} barberPct={barber?.commission_pct} />)}
              {Number(draft.tip) > 0 && (
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-dark-400/20">
                  <span className="text-cream/55 text-sm">Propina</span>
                  <span className="text-gold text-sm font-semibold">+${Number(draft.tip).toLocaleString('es-AR')}</span>
                </div>
              )}
              {earnings > 0 && (
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-dark-400/20">
                  <span className="text-gold/70 text-sm font-bold">Para vos</span>
                  <span className="text-gold text-base font-bold">${earnings.toLocaleString('es-AR')}</span>
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
  const today  = format(new Date(), 'yyyy-MM-dd')

  const [from, setFrom]                     = useState(today)
  const [to, setTo]                         = useState(today)
  const [drafts, setDrafts]                 = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [loading, setLoading]               = useState(true)

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
    const { data } = await supabase
      .from('drafts').select('*, draft_items(*)')
      .eq('tenant_id', tenant.id).eq('barber_id', barber.id)
      .gte('draft_date', from).lte('draft_date', to)
      .order('created_at', { ascending: false })
    setDrafts(data || [])
    setLoading(false)
  }

  // Lo que le corresponde según lo que él mismo cargó: comisión de sus servicios + propinas
  function earningsOf(draft) {
    const commission = groupByPct(draft.draft_items || [], barber)
      .reduce((sum, g) => sum + g.barberAmt, 0)
    return commission + Number(draft.tip || 0)
  }

  const totalCuts  = drafts.reduce((s, d) => s + (d.draft_items || [])
    .filter(it => it.item_type === 'service')
    .reduce((ss, it) => ss + Number(it.quantity || 1), 0), 0)
  const myEarnings = drafts.reduce((s, d) => s + earningsOf(d), 0)
  const myTips     = drafts.reduce((s, d) => s + Number(d.tip || 0), 0)
  const isSingle   = from === to
  const isToday    = from === today && to === today

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

      {/* Resumen — todo calculado con lo que cargó él */}
      {drafts.length > 0 && !loading && (
        <div className="card mb-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-cream/40 text-[11px] uppercase tracking-wider font-bold mb-1">Cortes realizados</p>
              <p className="font-display text-2xl text-cream">{totalCuts}</p>
              <p className="text-cream/30 text-xs mt-0.5">
                {drafts.length} registro{drafts.length !== 1 ? 's' : ''}
              </p>
              {myTips > 0 && (
                <p className="text-gold/40 text-xs mt-0.5">${myTips.toLocaleString('es-AR')} en propinas</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-cream/40 text-[11px] uppercase tracking-wider font-bold mb-1">Te corresponde</p>
              <p className="font-display text-3xl text-gold">${myEarnings.toLocaleString('es-AR')}</p>
            </div>
          </div>
          <p className="text-cream/25 text-[11px] mt-3 pt-3 border-t border-dark-400/30">
            Tu comisión por servicios más las propinas que cargaste.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={isToday ? 'Sin registros hoy' : 'Sin registros este período'}
          description={isToday ? 'Tus registros del día aparecerán acá' : 'No hay actividad para estas fechas'}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-cream/28 text-xs flex items-center gap-1.5 mb-1">
            <Pencil size={11} />
            Podés editar o eliminar tus registros
          </p>
          {drafts.map(d => (
            <DraftRow
              key={d.id}
              draft={d}
              paymentMethods={paymentMethods}
              showDate={!isSingle}
              onDelete={load}
              barber={barber}
              earnings={earningsOf(d)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
