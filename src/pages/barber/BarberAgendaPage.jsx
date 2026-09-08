import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, MessageCircle, Phone, Check, X, UserX } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import WeekAgenda from '../../components/booking/WeekAgenda'
import {
  fmtTime, fmtDay, fmtDayShort, fmtMoney, fmtDuration, waLink, telLink,
  dayStart, addDays, toDateKey, STATUS_LABEL, STATUS_BADGE,
} from '../../lib/booking'
import toast from 'react-hot-toast'

const mondayOf = d => { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const isToday = d => toDateKey(d) === toDateKey(new Date())

export default function BarberAgendaPage() {
  const { tenant, barberSession } = useAuth()
  const barber = barberSession?.barber
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('mb_bagenda_view') || 'week' } catch { return 'week' }
  })
  const [date, setDate] = useState(dayStart(new Date()))
  const [appts, setAppts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)

  const isWeek = view === 'week'
  const weekStart = useMemo(() => mondayOf(date), [date])
  function switchView(v) { setView(v); try { localStorage.setItem('mb_bagenda_view', v) } catch { /* ignore */ } }

  const load = useCallback(async () => {
    if (!tenant?.id || !barber?.id) return
    setLoading(true)
    const start = isWeek ? mondayOf(date) : dayStart(date)
    const { data } = await supabase.from('appointments').select('*')
      .eq('tenant_id', tenant.id).eq('barber_id', barber.id)
      .gte('starts_at', start.toISOString())
      .lt('starts_at', addDays(start, isWeek ? 7 : 1).toISOString())
      .order('starts_at')
    setAppts(data || [])
    setLoading(false)
  }, [tenant?.id, barber?.id, date, isWeek])

  useEffect(() => { load() }, [load])

  const dayAppts = useMemo(
    () => (isWeek ? [] : appts.filter(a => toDateKey(a.starts_at) === toDateKey(date))),
    [appts, date, isWeek],
  )
  const counts = useMemo(() => ({
    active: appts.filter(a => ['pending', 'confirmed'].includes(a.status)).length,
    total: appts.length,
  }), [appts])

  async function setStatus(a, status) {
    const { error } = await supabase.from('appointments')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', a.id)
    if (error) return toast.error(error.message)
    toast.success(`Turno: ${STATUS_LABEL[status].toLowerCase()}`)
    setSel(null)
    load()
  }

  if (!barber) return null

  return (
    <div className="pb-6">
      <h1 className="section-title mb-1">Mi agenda</h1>
      <p className="section-sub mb-4">
        {counts.active} turno{counts.active === 1 ? '' : 's'} · {counts.total} {isWeek ? 'esta semana' : 'este día'}
      </p>

      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-dark-400 overflow-hidden shrink-0">
          {[['week', 'Semana'], ['day', 'Día']].map(([v, l]) => (
            <button key={v} onClick={() => switchView(v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? 'bg-gold/15 text-gold' : 'text-cream/50 hover:text-cream'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="card !p-1.5 flex items-center gap-1 flex-1">
          <button onClick={() => setDate(d => addDays(d, isWeek ? -7 : -1))} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
          <div className="flex-1 text-center min-w-0">
            {isWeek ? (
              <p className="text-cream text-sm font-medium">
                {fmtDayShort(weekStart).replace(/^\w+,\s*/, '')} – {fmtDayShort(addDays(weekStart, 6)).replace(/^\w+,\s*/, '')}
              </p>
            ) : (
              <p className="text-cream text-sm font-medium capitalize">{fmtDay(date)}</p>
            )}
          </div>
          <button onClick={() => setDate(d => addDays(d, isWeek ? 7 : 1))} className="btn-ghost p-2"><ChevronRight size={16} /></button>
          {!isToday(date) && <button onClick={() => setDate(dayStart(new Date()))} className="btn-ghost text-xs px-2">Hoy</button>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={22} /></div>
      ) : isWeek ? (
        <>
          <WeekAgenda appointments={appts} weekStart={weekStart} onSelect={setSel} />
          <p className="text-cream/30 text-[11px] mt-2 text-center">Tocá un turno para ver el detalle · deslizá para ver la semana</p>
        </>
      ) : dayAppts.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Sin turnos" description="No te reservaron turnos para este día." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {dayAppts.map(a => (
            <button key={a.id} onClick={() => setSel(a)} className="card !p-4 text-left w-full">
              <ApptRow a={a} />
            </button>
          ))}
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title="Turno">
        {sel && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className={STATUS_BADGE[sel.status]}>{STATUS_LABEL[sel.status]}</span>
              <span className="text-cream/40 text-xs">{fmtDay(sel.starts_at)} · {fmtTime(sel.starts_at)}</span>
            </div>
            <div className="rounded-xl border border-dark-400/60 bg-dark-300/25 p-3 flex flex-col gap-1.5">
              <p className="text-cream text-sm font-medium">{sel.customer_name}</p>
              <p className="text-cream/55 text-xs">{sel.service_name} · {fmtMoney(sel.service_price)} · {fmtDuration(sel.duration_min)}</p>
              {sel.notes && <p className="text-cream/40 text-xs italic mt-1">“{sel.notes}”</p>}
            </div>
            {sel.customer_phone && (
              <div className="flex gap-2">
                <a href={waLink(sel.customer_phone, `Hola ${sel.customer_name.split(' ')[0]}! Te escribo por tu turno del ${fmtDay(sel.starts_at)} a las ${fmtTime(sel.starts_at)}.`)}
                   target="_blank" rel="noreferrer"
                   className="flex-1 flex items-center justify-center gap-1.5 text-emerald-400/90 border border-emerald-400/30 rounded-lg py-2 text-sm">
                  <MessageCircle size={14} /> WhatsApp
                </a>
                <a href={telLink(sel.customer_phone)}
                   className="flex-1 flex items-center justify-center gap-1.5 text-cream/60 border border-dark-400 rounded-lg py-2 text-sm">
                  <Phone size={14} /> Llamar
                </a>
              </div>
            )}
            {!['cancelled', 'no_show', 'completed'].includes(sel.status) && (
              <div className="flex gap-2">
                <button onClick={() => setStatus(sel, 'completed')} className="btn-gold flex-1 flex items-center justify-center gap-1.5 text-sm">
                  <Check size={14} /> Atendido
                </button>
                <button onClick={() => setStatus(sel, 'no_show')} className="btn-ghost border border-dark-400 flex items-center gap-1.5 text-sm">
                  <UserX size={14} /> No vino
                </button>
                <button onClick={() => setStatus(sel, 'cancelled')} className="btn-ghost border border-dark-400 text-red-400/80 flex items-center gap-1.5 text-sm">
                  <X size={14} /> Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function ApptRow({ a }) {
  const dim = ['cancelled', 'no_show'].includes(a.status)
  return (
    <div className={`flex items-start gap-3 ${dim ? 'opacity-55' : ''}`}>
      <div className="text-center shrink-0 w-14">
        <p className="font-display text-gold text-base leading-none">{fmtTime(a.starts_at)}</p>
        <p className="text-cream/30 text-[10px] mt-1">{fmtDuration(a.duration_min)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-cream text-sm font-medium">{a.customer_name}</span>
          <span className={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status]}</span>
        </div>
        <p className="text-cream/55 text-xs mt-0.5">{a.service_name} · {fmtMoney(a.service_price)}</p>
        {a.notes && <p className="text-cream/40 text-xs mt-1 italic">“{a.notes}”</p>}
      </div>
    </div>
  )
}
