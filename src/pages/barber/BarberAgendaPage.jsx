import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, MessageCircle, ClipboardCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import DayAgenda from '../../components/booking/DayAgenda'
import Modal from '../../components/ui/Modal'
import MoveBooking from '../../components/booking/MoveBooking'
import Spinner from '../../components/ui/Spinner'
import { STATUS, money, timeAR, longDateAR, dateKeyAR, addDaysKey, dayParts, fromLocalAR, waTo } from '../../lib/booking'
import { loadBookingSaleContext, createDraftFromBooking, bookingSplit } from '../../lib/bookingSales'

// Agenda del barbero: ve sus turnos reservados, marca horarios ocupados y
// carga cada turno atendido a «Mis registros» con un toque.
export default function BarberAgendaPage() {
  const { tenant, barberSession } = useAuth()
  const barber = barberSession?.barber
  const [day, setDay]         = useState(dateKeyAR())
  const [bookings, setBookings] = useState(null)
  const [loaded, setLoaded]   = useState({})      // booking_id → true si ya está en sus registros
  const [ctx, setCtx]         = useState(null)
  const [open, setOpen]       = useState(null)
  const [busy, setBusy]       = useState(false)
  const [reload, setReload]   = useState(0)
  const [hasLink, setHasLink] = useState(true)    // migración v2 (booking_id) corrida
  const [moving, setMoving]   = useState(null)

  useEffect(() => {
    if (!tenant?.id || !barber?.id) return
    let alive = true
    setBookings(null)
    const start = fromLocalAR(day, '00:00').toISOString()
    const end   = fromLocalAR(addDaysKey(day, 1), '00:00').toISOString()
    Promise.all([
      supabase.from('bookings').select('*').eq('tenant_id', tenant.id).eq('barber_id', barber.id)
        .in('status', ['pending', 'confirmed']).gte('starts_at', start).lt('starts_at', end).order('starts_at'),
      supabase.from('drafts').select('booking_id').eq('tenant_id', tenant.id).eq('barber_id', barber.id).not('booking_id', 'is', null),
    ]).then(([k, d]) => {
      if (!alive) return
      setBookings(k.data || [])
      setHasLink(!d.error)
      setLoaded(Object.fromEntries((d.data || []).map(x => [x.booking_id, true])))
    })
    return () => { alive = false }
  }, [tenant?.id, barber?.id, day, reload])

  useEffect(() => {
    if (!tenant?.id) return
    loadBookingSaleContext(tenant.id).then(setCtx).catch(() => {})
  }, [tenant?.id])

  async function toRecords(bk) {
    if (!ctx) return toast.error('Esperá un segundo y probá de nuevo')
    setBusy(true)
    try {
      await createDraftFromBooking(bk, ctx)
      toast.success('Cargado en Mis registros')
      setOpen(null)
      setReload(r => r + 1)
    } catch (e) {
      toast.error(e.message)
      setReload(r => r + 1)
    } finally {
      setBusy(false)
    }
  }

  if (!barber) return null
  const isToday = day === dateKeyAR()
  const p = dayParts(day)
  const forMe = open && ctx ? bookingSplit(open, ctx).forBarber : null

  return (
    <div>
      <div className="mb-4">
        <h1 className="section-title mb-0.5">Mis reservas</h1>
        <p className="section-sub">Tus horarios del día: tocá uno libre para marcarlo ocupado (o al revés). En dorado, los clientes que reservaron.</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setDay(addDaysKey(day, -1))} className="btn-ghost !p-2" aria-label="Día anterior"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="text-cream font-semibold">{isToday ? 'Hoy' : p.long}</p>
          {isToday
            ? <p className="text-cream/40 text-xs">{p.long}</p>
            : <button onClick={() => setDay(dateKeyAR())} className="text-gold text-xs font-semibold">Volver a hoy</button>}
        </div>
        <button onClick={() => setDay(addDaysKey(day, 1))} className="btn-ghost !p-2" aria-label="Día siguiente"><ChevronRight size={18} /></button>
      </div>

      <DayAgenda tenantId={tenant.id} barbers={[barber]} day={day} refreshKey={reload}
        onOpenBooking={setOpen} emptyText="No tenés horario cargado este día. Pedile al admin que te lo cargue en Reservas → Agenda." />

      {bookings && bookings.length > 0 && (
        <div className="mt-6">
          <p className="label">Turnos reservados</p>
          <div className="flex flex-col gap-2">
            {bookings.map(bk => (
              <button key={bk.id} onClick={() => setOpen(bk)} className="card-hover !p-3.5 flex items-center gap-3 text-left">
                <div className="w-12 text-center shrink-0">
                  <p className="text-gold font-bold leading-none">{timeAR(bk.starts_at)}</p>
                </div>
                <div className="flex-1 min-w-0 border-l border-dark-400/40 pl-3">
                  <p className="text-cream font-semibold text-sm truncate">{bk.customer_name}</p>
                  <p className="text-cream/50 text-xs truncate">{bk.service_name} · {money(bk.price)} pagado</p>
                </div>
                {loaded[bk.id]
                  ? <span className="badge-active shrink-0"><Check size={11} /> En registros</span>
                  : <span className={`${STATUS[bk.status]?.cls} shrink-0`}>{STATUS[bk.status]?.short}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title="Turno reservado" size="sm">
        {open && (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-cream/70 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <b className="text-cream text-base">{open.customer_name}</b>
                <span className={STATUS[open.status]?.cls}>{STATUS[open.status]?.short}</span>
              </div>
              <p>{longDateAR(open.starts_at)} · <b className="text-cream">{timeAR(open.starts_at)} hs</b></p>
              <p>{open.service_name} · <b className="text-gold">{money(open.price)}</b> pagado por adelantado</p>
              {forMe != null && <p className="text-emerald-500 font-semibold">Para vos: {money(forMe)}</p>}
              {open.customer_phone && (
                <a href={waTo(open.customer_phone)} target="_blank" rel="noreferrer"
                   className="text-gold text-xs font-semibold flex items-center gap-1 mt-1"><MessageCircle size={13} /> {open.customer_phone}</a>
              )}
            </div>

            <div className="rounded-xl border border-gold/25 bg-gold/[0.06] p-3 text-xs text-cream/70 leading-relaxed">
              El cliente <b className="text-cream">ya pagó</b>: no le cobres el corte de nuevo. Si deja propina o compra algo, cargalo aparte en Registrar.
            </div>

            {open.status === 'pending' ? (
              <p className="text-amber-500 text-xs">La barbería todavía no confirmó el pago de este turno.</p>
            ) : loaded[open.id] ? (
              <p className="text-emerald-500 text-sm font-semibold flex items-center gap-1.5"><Check size={15} /> Ya está en tus registros</p>
            ) : !hasLink ? (
              <p className="text-cream/45 text-xs">Para cargarlo con un toque falta una actualización de la base (avisale al admin).</p>
            ) : (
              <button onClick={() => toRecords(open)} disabled={busy || !ctx} className="btn-gold flex items-center justify-center gap-2">
                {busy ? <Spinner size={15} /> : <ClipboardCheck size={16} />} Atendido: cargar a Mis registros
              </button>
            )}
            {!loaded[open.id] && dateKeyAR(open.starts_at) >= dateKeyAR() && (
              <button onClick={() => { setMoving(open); setOpen(null) }} className="btn-outline-gold">Mover turno</button>
            )}
          </div>
        )}
      </Modal>

      {moving && (
        <MoveBooking booking={moving} tenantSlug={tenant.slug} tenantName={tenant.name} barbers={[barber]} lockBarber
          onClose={() => setMoving(null)} onMoved={() => setReload(r => r + 1)} />
      )}
    </div>
  )
}
