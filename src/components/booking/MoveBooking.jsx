import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageCircle, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import { fetchGrid, timeAR, longDateAR, dateKeyAR, addDaysKey, dayParts, waTo } from '../../lib/booking'

// ─────────────────────────────────────────────────────────────────────────────
// Mover un turno reservado: otro día, otra hora y/o otro barbero.
// Muestra solo horarios libres (misma regla que ve el cliente) y la base
// impide que dos turnos del mismo barbero se pisen.
// Si el turno ya se cargó a ventas o a registros, no se mueve (para no
// descuadrar el cierre): primero hay que borrar esa venta/registro.
// ─────────────────────────────────────────────────────────────────────────────
export default function MoveBooking({ booking, tenantSlug, tenantName, barbers, lockBarber, onClose, onMoved }) {
  const [day, setDay]         = useState(() => dateKeyAR(booking.starts_at) < dateKeyAR() ? dateKeyAR() : dateKeyAR(booking.starts_at))
  const [barberId, setBarberId] = useState(booking.barber_id)
  const [slots, setSlots]     = useState(null)
  const [pick, setPick]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const [linked, setLinked]   = useState(null)   // null cargando · '' libre · 'venta' | 'registro'
  const [done, setDone]       = useState(null)   // turno movido → ofrecer WhatsApp

  const durMs = new Date(booking.ends_at) - new Date(booking.starts_at)
  const today = dateKeyAR()

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('sales').select('id').eq('booking_id', booking.id).limit(1),
      supabase.from('drafts').select('id').eq('booking_id', booking.id).limit(1),
    ]).then(([s, d]) => {
      if (!alive) return
      setLinked(s.data?.length ? 'venta' : d.data?.length ? 'registro' : '')
    })
    return () => { alive = false }
  }, [booking.id])

  useEffect(() => {
    if (!booking.service_id) { setSlots([]); return }
    let alive = true
    setSlots(null); setPick(null)
    fetchGrid(tenantSlug, booking.service_id, barberId, day)
      .then(rows => {
        if (!alive) return
        const own = new Date(booking.starts_at).toISOString()
        const free = (rows || []).filter(r => r.barber_id === barberId && r.free).map(r => new Date(r.starts_at).toISOString())
        setSlots([...new Set(free)].filter(iso => !(iso === own && barberId === booking.barber_id)).sort())
      })
      .catch(() => alive && setSlots([]))
    return () => { alive = false }
  }, [tenantSlug, booking.service_id, booking.starts_at, booking.barber_id, barberId, day])

  async function save() {
    if (!pick) return
    setSaving(true)
    const starts = new Date(pick)
    const patch = { starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + durMs).toISOString(), barber_id: barberId }
    const { error } = await supabase.from('bookings').update(patch).eq('id', booking.id)
    setSaving(false)
    if (error) {
      toast.error(/overlap|exclusion|conflict/i.test(error.message || '') ? 'Ese horario se acaba de ocupar. Elegí otro.' : 'No se pudo mover el turno')
      return
    }
    toast.success('Turno movido')
    setDone({ ...booking, ...patch })
    onMoved?.()
  }

  const barberName = id => barbers.find(b => b.id === id)?.name || '—'
  const p = dayParts(day)

  if (done) {
    const first = (done.customer_name || '').split(' ')[0]
    const msg = `hola ${first}! te movimos el turno de ${done.service_name} al ${longDateAR(done.starts_at).toLowerCase()} a las ${timeAR(done.starts_at)} con ${barberName(done.barber_id)}. cualquier cosa avisanos. ${tenantName || ''}`.trim()
    return (
      <Modal open onClose={onClose} title="Turno movido" size="sm">
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-cream/70">
            <Check size={15} className="text-emerald-500 inline -mt-0.5 mr-1" />
            Ahora es el <b className="text-cream">{longDateAR(done.starts_at)} a las {timeAR(done.starts_at)}</b> con {barberName(done.barber_id)}.
          </p>
          {done.customer_phone && (
            <>
              <p className="text-cream/80 bg-dark-300/60 border border-dark-400/50 rounded-xl p-3">{msg}</p>
              <a href={waTo(done.customer_phone, msg)} target="_blank" rel="noreferrer" onClick={onClose}
                 className="btn-gold flex items-center justify-center gap-1.5"><MessageCircle size={15} /> Avisarle por WhatsApp</a>
            </>
          )}
          <button onClick={onClose} className="btn-ghost">Listo</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Mover turno">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-cream/60">
          <b className="text-cream">{booking.customer_name}</b> · {booking.service_name}<br />
          Hoy está: {longDateAR(booking.starts_at)} {timeAR(booking.starts_at)} con {barberName(booking.barber_id)}
        </p>

        {linked === null && <div className="py-6 flex justify-center"><Spinner /></div>}
        {linked && (
          <p className="text-amber-500 text-sm card-flat !p-3">
            Este turno ya está cargado {linked === 'venta' ? 'en ventas' : 'en los registros del barbero'}. Para moverlo, primero borrá esa {linked} en Registros.
          </p>
        )}
        {linked === '' && !booking.service_id && (
          <p className="text-amber-500 text-sm">El servicio de este turno se borró del catálogo: no se puede calcular el horario.</p>
        )}

        {linked === '' && booking.service_id && (
          <>
            {!lockBarber && barbers.length > 1 && (
              <div>
                <p className="label">Barbero</p>
                <div className="flex flex-wrap gap-1.5">
                  {barbers.map(b => (
                    <button key={b.id} onClick={() => setBarberId(b.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${b.id === barberId ? 'bg-gold border-gold text-ink font-semibold' : 'border-dark-400/60 text-cream/70 hover:border-gold/50'}`}>
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="label">Día</p>
              <div className="flex items-center justify-between rounded-xl border border-dark-400/50 px-2 py-1.5">
                <button onClick={() => setDay(addDaysKey(day, -1))} disabled={day <= today} className="btn-ghost !p-2 disabled:opacity-30"><ChevronLeft size={16} /></button>
                <span className="text-cream text-sm font-semibold">{day === today ? `Hoy · ${p.long}` : p.long}</span>
                <button onClick={() => setDay(addDaysKey(day, 1))} className="btn-ghost !p-2"><ChevronRight size={16} /></button>
              </div>
            </div>

            <div>
              <p className="label">Horario libre</p>
              {!slots && <div className="py-6 flex justify-center"><Spinner /></div>}
              {slots && !slots.length && <p className="text-cream/45 text-sm py-3">No hay horarios libres ese día{lockBarber ? '' : ' para ese barbero'}.</p>}
              {slots && slots.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {slots.map(iso => (
                    <button key={iso} onClick={() => setPick(iso)}
                      className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${pick === iso ? 'bg-gold border-gold text-ink' : 'border-dark-400/60 bg-dark-200 text-cream hover:border-gold/60'}`}>
                      {timeAR(iso)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={save} disabled={!pick || saving} className="btn-gold flex-1">
                {saving ? 'Moviendo…' : pick ? `Mover a las ${timeAR(pick)}` : 'Elegí un horario'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
