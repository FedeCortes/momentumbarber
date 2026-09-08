import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  Scissors, User, CalendarCheck, Clock, X, RefreshCw, ChevronLeft, Sun, Moon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import BarberPoleMark from '../../components/ui/BarberPoleMark'
import Spinner from '../../components/ui/Spinner'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import {
  fmtTime, fmtDay, weekdayAbbr, dayPart, fmtMoney, STATUS_LABEL, STATUS_BADGE,
} from '../../lib/booking'
import toast from 'react-hot-toast'

const PARTS = ['Mañana', 'Tarde', 'Noche']

function ThemeBtn() {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} className="p-2 rounded-xl text-cream/45 hover:text-cream hover:bg-dark-300/60 transition-all">
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

export default function ManageBookingPage() {
  const { slug, id } = useParams()
  const [sp] = useSearchParams()
  const token = sp.get('token')

  const [appt, setAppt] = useState(undefined)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  const [rescheduling, setRescheduling] = useState(false)
  const [slotData, setSlotData] = useState(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [dateKey, setDateKey] = useState(null)

  async function load() {
    const { data, error } = await supabase.rpc('booking_appointment', { p_id: id, p_token: token })
    if (error || !data) { setAppt(null); return }
    setAppt(data)
  }
  useEffect(() => { document.title = 'Mi turno'; load() }, [id, token])

  async function doCancel() {
    setBusy(true)
    const { error } = await supabase.rpc('booking_cancel', { p_id: id, p_token: token })
    setBusy(false); setConfirmCancel(false)
    if (error) return toast.error(error.message || 'No se pudo cancelar')
    toast.success('Turno cancelado')
    load()
  }

  async function openReschedule() {
    setRescheduling(true)
    setSlotsLoading(true)
    const { data, error } = await supabase.rpc('booking_slots', {
      p_slug: appt.tenant_slug, p_service_id: appt.service_id, p_barber_id: appt.barber_id, p_days: 21,
    })
    setSlotsLoading(false)
    if (error) { toast.error(error.message || 'No se pudo cargar la disponibilidad'); return }
    setSlotData(data || [])
    if (data?.length) setDateKey(data[0].date)
  }

  async function pickNewSlot(start) {
    setBusy(true)
    const { error } = await supabase.rpc('booking_reschedule', {
      p_id: id, p_token: token, p_new_starts_at: start,
    })
    setBusy(false)
    if (error) return toast.error(error.message || 'No se pudo reprogramar')
    toast.success('Turno reprogramado')
    setRescheduling(false)
    load()
  }

  const currentDay = slotData?.find(d => d.date === dateKey)
  const grouped = useMemo(() => {
    const g = { Mañana: [], Tarde: [], Noche: [] }
    for (const s of currentDay?.slots || []) g[dayPart(s.start)].push(s)
    return g
  }, [currentDay])

  if (appt === undefined) return <div className="min-h-screen flex items-center justify-center bg-dark-100"><Spinner /></div>
  if (appt === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-dark-100 px-6 text-center">
        <BarberPoleMark size={44} className="mb-4" />
        <h1 className="font-display text-lg text-cream mb-2">Turno no encontrado</h1>
        <p className="text-cream/50 text-sm max-w-xs">El enlace es incorrecto o el turno ya no existe.</p>
      </div>
    )
  }

  const canChange = appt.status === 'confirmed' || appt.status === 'pending'

  return (
    <div className="min-h-screen bg-dark-100 pb-16">
      <header className="bg-dark-200 border-b border-dark-400/40 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <BarberPoleMark size={30} className="shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-cream truncate">{appt.tenant_name}</p>
            <p className="text-[10px] text-gold/70 uppercase tracking-widest font-semibold">Mi turno</p>
          </div>
        </div>
        <ThemeBtn />
      </header>

      <main className="max-w-lg mx-auto px-4 pt-5">
        {rescheduling ? (
          <section>
            <button onClick={() => setRescheduling(false)} className="flex items-center gap-1.5 text-cream/50 hover:text-cream text-sm mb-4">
              <ChevronLeft size={15} /> Volver
            </button>
            <h2 className="font-display text-lg text-cream mb-3">Nuevo día y hora</h2>
            {slotsLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : !slotData?.length ? (
              <p className="text-cream/50 text-sm text-center py-8">No hay horarios disponibles.</p>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-4">
                  {slotData.map(d => {
                    const active = d.date === dateKey
                    const dt = new Date(d.slots[0].start)
                    return (
                      <button key={d.date} onClick={() => setDateKey(d.date)}
                        className={`shrink-0 px-3 py-2 rounded-xl border text-center min-w-[4.5rem] transition-colors ${
                          active ? 'bg-gold/15 border-gold text-gold' : 'border-dark-400 text-cream/55'
                        }`}>
                        <p className="text-[10px] uppercase tracking-wide">{weekdayAbbr(dt)}</p>
                        <p className="text-sm font-semibold mt-0.5">{dt.getDate()}</p>
                      </button>
                    )
                  })}
                </div>
                {PARTS.map(p => grouped[p].length > 0 && (
                  <div key={p} className="mb-4">
                    <p className="text-cream/40 text-xs uppercase tracking-widest mb-2">{p}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {grouped[p].map(s => (
                        <button key={s.start} disabled={busy} onClick={() => pickNewSlot(s.start)}
                          className="py-2.5 rounded-xl border border-dark-400 text-cream/80 text-sm hover:border-gold hover:bg-gold/8 hover:text-gold transition-colors disabled:opacity-40">
                          {fmtTime(s.start)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-cream">Tu turno</h2>
              <span className={STATUS_BADGE[appt.status]}>{STATUS_LABEL[appt.status]}</span>
            </div>
            <div className="rounded-2xl border border-dark-400/60 bg-dark-200 overflow-hidden" style={{ boxShadow: 'var(--sh-card)' }}>
              <div className="p-5 flex flex-col gap-3">
                <Row icon={Scissors} text={appt.service_name} />
                <Row icon={User} text={appt.barber_name} />
                <Row icon={CalendarCheck} text={fmtDay(appt.starts_at)} />
                <Row icon={Clock} text={`${fmtTime(appt.starts_at)} – ${fmtTime(appt.ends_at)}`} />
              </div>
              <div className="flex items-center justify-between px-5 py-3.5 bg-dark-300/40 border-t border-dark-400/50">
                <span className="text-cream/50 text-xs uppercase tracking-wide">Total</span>
                <span className="text-gold font-display text-lg font-bold">{fmtMoney(appt.service_price)}</span>
              </div>
            </div>

            {canChange ? (
              <div className="flex flex-col gap-2 mt-4">
                {appt.service_id && (
                  <button onClick={openReschedule} className="btn-outline-gold flex items-center justify-center gap-2">
                    <RefreshCw size={15} /> Reprogramar
                  </button>
                )}
                <button onClick={() => setConfirmCancel(true)}
                        className="text-red-400/80 hover:text-red-400 text-sm py-2 flex items-center justify-center gap-2">
                  <X size={15} /> Cancelar turno
                </button>
              </div>
            ) : (
              <p className="text-cream/40 text-sm text-center mt-5">
                Este turno está {STATUS_LABEL[appt.status].toLowerCase()} y no se puede modificar.
              </p>
            )}

            <Link to={`/reservar/${slug}`} className="block text-center text-cream/40 text-xs hover:text-cream mt-6">
              Reservar otro turno
            </Link>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={doCancel}
        title="Cancelar turno" danger
        message="¿Seguro que querés cancelar este turno? El horario quedará libre para otra persona."
      />
    </div>
  )
}

function Row({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={15} className="text-cream/40 shrink-0" />
      <span className="text-cream/80 text-sm">{text}</span>
    </div>
  )
}
