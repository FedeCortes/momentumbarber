import { useEffect, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Check, X, MessageCircle, Receipt, Copy, ExternalLink,
  Plus, Trash2, Clock, Ban, Link2, AlertTriangle, CalendarDays,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import DayAgenda from '../../components/booking/DayAgenda'
import MoveBooking from '../../components/booking/MoveBooking'
import NoShowChoice from '../../components/booking/NoShowChoice'
import { loadBookingSaleContext, createSaleFromBooking, createNoShowSale, undoBookingSale, undoBookingDraft, bookingLinkState } from '../../lib/bookingSales'
import {
  STATUS, WEEKDAYS, money, durationLabel, timeAR, longDateAR, dateKeyAR, addDaysKey, dayParts,
  fromLocalAR, receiptUrl, waTo,
} from '../../lib/booking'

const TABS = [
  { key: 'list',     label: 'Turnos' },
  { key: 'agenda',   label: 'Agenda' },
  { key: 'settings', label: 'Ajustes' },
]

function bookingLink(slug) {
  return `${location.origin}/reservar/${slug}`
}

function MissingMigration() {
  return (
    <div className="card border-amber-500/30">
      <div className="flex gap-3">
        <AlertTriangle className="text-amber-500 shrink-0" size={20} />
        <div>
          <p className="text-cream font-semibold mb-1">Falta activar las reservas en la base</p>
          <p className="text-cream/55 text-sm">Hay que correr <code className="text-gold">supabase_migration_reservas.sql</code> en el SQL Editor de Supabase. Después recargá esta página.</p>
        </div>
      </div>
    </div>
  )
}

export default function BookingsPage() {
  const { tenant } = useAuth()
  const [tab, setTab] = useState('list')
  const [ready, setReady] = useState(null)     // null cargando · true · false (falta migración)

  useEffect(() => {
    if (!tenant?.id) return
    supabase.from('bookings').select('id', { head: true, count: 'exact' }).eq('tenant_id', tenant.id)
      .then(({ error }) => setReady(!error))
  }, [tenant?.id])

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-cream">Reservas</h1>
        <p className="text-cream/45 text-sm">Turnos online, horarios de cada barbero y cobro por adelantado.</p>
      </div>

      <div className="flex p-1 rounded-xl bg-dark-300/50 border border-dark-400/40 mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key ? 'bg-dark-200 text-gold shadow-[var(--sh-card)]' : 'text-cream/45 hover:text-cream'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {ready === null && <div className="py-16 flex justify-center"><Spinner /></div>}
      {ready === false && <MissingMigration />}
      {ready && tab === 'list' && <ListTab tenant={tenant} goSettings={() => setTab('settings')} goAgenda={() => setTab('agenda')} />}
      {ready && tab === 'agenda' && <AgendaTab tenant={tenant} />}
      {ready && tab === 'settings' && <SettingsTab tenant={tenant} />}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// TURNOS
// ═════════════════════════════════════════════════════════════
function ListTab({ tenant, goSettings, goAgenda }) {
  const [day, setDay]           = useState(dateKeyAR())
  const [pending, setPending]   = useState([])
  const [items, setItems]       = useState(null)
  const [barbers, setBarbers]   = useState({})
  const [barberList, setBarberList] = useState([])
  const [barberAll, setBarberAll]   = useState([])   // incluye inactivos (por si tienen turnos)
  const [agendaKey, setAgendaKey] = useState(0)
  const [enabled, setEnabled]   = useState(true)
  const [bookable, setBookable] = useState(true)   // hay al menos un barbero con horario
  const [reload, setReload]     = useState(0)
  const [receipt, setReceipt]   = useState(null)    // { url, isPdf, booking }
  const [after, setAfter]       = useState(null)    // { booking, action } para avisar por WhatsApp
  const [busy, setBusy]         = useState(null)
  const [moving, setMoving]     = useState(null)    // turno que se está moviendo
  const [noShowFor, setNoShowFor] = useState(null)  // elegir: reprogramar o quedarse la plata

  useEffect(() => {
    let alive = true
    setItems(null)
    const start = fromLocalAR(day, '00:00').toISOString()
    const end   = fromLocalAR(addDaysKey(day, 1), '00:00').toISOString()
    Promise.all([
      supabase.from('bookings').select('*').eq('tenant_id', tenant.id).eq('status', 'pending')
        .gte('ends_at', new Date(Date.now() - 6 * 3600e3).toISOString()).order('starts_at'),
      supabase.from('bookings').select('*').eq('tenant_id', tenant.id)
        .gte('starts_at', start).lt('starts_at', end).order('starts_at'),
      supabase.from('barbers').select('id,name,photo_url,is_active').eq('tenant_id', tenant.id).order('name'),
      supabase.from('tenant_config').select('rsv_enabled').eq('tenant_id', tenant.id).maybeSingle(),
      supabase.rpc('rsv_shop', { p_slug: tenant.slug }),
    ]).then(([p, d, b, c, shop]) => {
      if (!alive) return
      if (p.error || d.error) { toast.error('No se pudieron cargar los turnos'); setItems([]); return }
      setPending(p.data || [])
      setItems(d.data || [])
      setBarbers(Object.fromEntries((b.data || []).map(x => [x.id, x.name])))
      setBarberList((b.data || []).filter(x => x.is_active !== false))
      setBarberAll(b.data || [])
      setEnabled(!!c.data?.rsv_enabled)
      if (!shop.error && shop.data) setBookable((shop.data.barbers || []).length > 0 && (shop.data.services || []).length > 0)
    })
    return () => { alive = false }
  }, [tenant.id, day, reload])

  // «Asistió»: el turno pasa a ventas oficiales (suma en Registros y Cierre del día del turno)
  async function attend(bk) {
    try {
      const ctx = await loadBookingSaleContext(tenant.id)
      await createSaleFromBooking(bk, ctx)
      toast.success(`${bk.customer_name}: asistió · sumado a Registros y Cierre`)
      setReceipt(null)
      setAgendaKey(k => k + 1)
    } catch (e) {
      toast.error(e.message || 'No se pudo marcar')
    }
  }

  async function noShow(bk) {
    try {
      const ctx = await loadBookingSaleContext(tenant.id)
      await createNoShowSale(bk, ctx)
      toast.success(`${bk.customer_name}: no vino · ${money(bk.price)} suman al local`)
      setReceipt(null)
      setAgendaKey(k => k + 1)
    } catch (e) {
      toast.error(e.message || 'No se pudo marcar')
    }
  }

  async function undo(bk) {
    try {
      if (bk._went === 'registro') await undoBookingDraft(bk.id)
      else await undoBookingSale(bk.id)
      toast.success('Listo, se deshizo')
      setAgendaKey(k => k + 1)
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function openReceipt(bk) {
    if (!bk.receipt_path) { setReceipt({ url: null, isPdf: false, booking: bk }); return }
    try {
      const url = await receiptUrl(bk.receipt_path)
      setReceipt({ url, isPdf: /\.pdf$/i.test(bk.receipt_path), booking: bk })
    } catch { toast.error('No se pudo abrir el comprobante') }
  }

  async function setStatus(bk, status) {
    if (status === 'cancelled' || status === 'rejected') {
      const linked = await bookingLinkState(bk.id)
      if (linked) return toast.error(`Este turno ya está ${linked === 'venta' ? 'en ventas' : 'en los registros del barbero'}: primero deshacé «Asistió / No vino».`)
    }
    setBusy(bk.id)
    const patch = { status, decided_at: new Date().toISOString(), ...(status === 'cancelled' ? { cancelled_by: 'shop' } : {}) }
    const { error } = await supabase.from('bookings').update(patch).eq('id', bk.id)
    setBusy(null)
    if (error) return toast.error('No se pudo guardar')
    setReceipt(null)
    toast.success(status === 'confirmed' ? 'Turno confirmado' : status === 'rejected' ? 'Turno rechazado' : 'Turno cancelado')
    if (bk.customer_phone) setAfter({ booking: { ...bk, ...patch }, action: status })
    setReload(r => r + 1)
    setAgendaKey(k => k + 1)
  }

  function msgFor(bk, action) {
    const first = (bk.customer_name || '').split(' ')[0]
    const when = `${longDateAR(bk.starts_at)} a las ${timeAR(bk.starts_at)}`
    if (action === 'confirmed') return `hola ${first}! tu turno de ${bk.service_name} el ${when} con ${barbers[bk.barber_id] || 'nosotros'} quedó confirmado. te esperamos en ${tenant.name}`
    if (action === 'rejected') return `hola ${first}, no pudimos validar el pago de tu turno del ${when}. ¿nos mandás el comprobante de nuevo?`
    return `hola ${first}, tuvimos que cancelar tu turno del ${when}. escribinos y te damos otro horario`
  }

  const isToday = day === dateKeyAR()
  const p = dayParts(day)

  return (
    <>
      {!enabled && (
        <button onClick={goSettings} className="w-full mb-5 card !p-4 flex items-center gap-3 text-left border-amber-500/30 hover:border-amber-500/50">
          <AlertTriangle className="text-amber-500 shrink-0" size={18} />
          <span className="text-sm text-cream/75 flex-1">Las reservas online están <b>apagadas</b>. Activalas y cargá los datos de pago en Ajustes.</span>
          <ChevronRight size={16} className="text-cream/30" />
        </button>
      )}

      {enabled && !bookable && (
        <button onClick={goAgenda} className="w-full mb-5 card !p-4 flex items-center gap-3 text-left border-amber-500/30 hover:border-amber-500/50">
          <AlertTriangle className="text-amber-500 shrink-0" size={18} />
          <span className="text-sm text-cream/75 flex-1">Los clientes todavía no ven turnos: <b>cargale el horario a al menos un barbero</b> en Agenda.</span>
          <ChevronRight size={16} className="text-cream/30" />
        </button>
      )}

      {pending.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-cream font-semibold">Para confirmar</h2>
            <span className="badge-pending">{pending.length}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {pending.map(bk => (
              <div key={bk.id} className="card !p-4 border-amber-500/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-cream font-semibold truncate">{bk.customer_name}</p>
                    <p className="text-cream/50 text-xs">{bk.customer_phone}</p>
                  </div>
                  <p className="text-gold font-bold shrink-0">{money(bk.price)}</p>
                </div>
                <p className="text-cream/70 text-sm mt-2">
                  <span>{longDateAR(bk.starts_at)}</span> · <b className="text-cream">{timeAR(bk.starts_at)}</b> · {bk.service_name} · {barbers[bk.barber_id] || '—'}
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openReceipt(bk)} className="btn-outline-gold !px-3 !py-2 flex items-center gap-1.5 flex-1 justify-center">
                    <Receipt size={14} /> Ver pago
                  </button>
                  <button onClick={() => setStatus(bk, 'confirmed')} disabled={busy === bk.id}
                    className="btn-gold !px-3 !py-2 flex items-center gap-1.5 flex-1 justify-center">
                    <Check size={15} /> Confirmar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setDay(addDaysKey(day, -1))} className="btn-ghost !p-2"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="text-cream font-semibold">{isToday ? 'Hoy' : p.long}</p>
          {isToday
            ? <p className="text-cream/40 text-xs">{p.long}</p>
            : <button onClick={() => setDay(dateKeyAR())} className="text-gold text-xs font-semibold">Volver a hoy</button>}
        </div>
        <button onClick={() => setDay(addDaysKey(day, 1))} className="btn-ghost !p-2"><ChevronRight size={18} /></button>
      </div>

      {!items && <div className="py-12 flex justify-center"><Spinner /></div>}
      {items && (
        <DayAgenda tenantId={tenant.id} barbers={barberAll} day={day} refreshKey={agendaKey + reload} promoteDrafts
          onOpenBooking={openReceipt} onAttend={attend} onNoShow={noShow} onUndo={undo} onMove={setMoving}
          attendHint="suma a Registros y Cierre" />
      )}

      {items && items.some(bk => bk.status === 'cancelled' || bk.status === 'rejected') && (
        <div className="mt-6">
          <p className="label">Cancelados y rechazados</p>
          <div className="card-flat !p-0 divide-y divide-dark-400/30">
            {items.filter(bk => bk.status === 'cancelled' || bk.status === 'rejected').map(bk => (
              <div key={bk.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <b className="text-cream/60 w-12 shrink-0">{timeAR(bk.starts_at)}</b>
                <span className="text-cream/60 truncate flex-1">{bk.customer_name} · {bk.service_name} · {barbers[bk.barber_id] || '—'}</span>
                <span className={`${STATUS[bk.status]?.cls} shrink-0`}>{STATUS[bk.status]?.short}{bk.cancelled_by === 'customer' ? ' x cliente' : ''}</span>
                {bk.customer_phone && (
                  <a href={waTo(bk.customer_phone)} target="_blank" rel="noreferrer" className="btn-ghost !p-1.5 shrink-0" title="WhatsApp"><MessageCircle size={14} /></a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Turno reservado">
        {receipt && (
          <>
            <div className="text-sm text-cream/70 mb-4 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <p><b className="text-cream text-base">{receipt.booking.customer_name}</b></p>
                <span className={STATUS[receipt.booking.status]?.cls}>{STATUS[receipt.booking.status]?.short}</span>
              </div>
              <p>{longDateAR(receipt.booking.starts_at)} · <b className="text-cream">{timeAR(receipt.booking.starts_at)} hs</b></p>
              <p>{receipt.booking.service_name} · con {barbers[receipt.booking.barber_id] || '—'} · <b className="text-gold">{money(receipt.booking.price)}</b> pagado por adelantado</p>
              {receipt.booking.customer_phone && (
                <a href={waTo(receipt.booking.customer_phone)} target="_blank" rel="noreferrer"
                   className="text-gold text-xs font-semibold flex items-center gap-1 mt-1"><MessageCircle size={13} /> {receipt.booking.customer_phone}</a>
              )}
            </div>
            {!receipt.url ? (
              <p className="text-cream/45 text-sm mb-4 card-flat !p-3">Sin comprobante adjunto.</p>
            ) : receipt.isPdf ? (
              <a href={receipt.url} target="_blank" rel="noreferrer" className="btn-outline-gold w-full flex items-center justify-center gap-2 mb-4">
                <ExternalLink size={15} /> Abrir PDF
              </a>
            ) : (
              <a href={receipt.url} target="_blank" rel="noreferrer">
                <img src={receipt.url} alt="Comprobante" className="w-full rounded-xl border border-dark-400/50 mb-4 max-h-[50vh] object-contain bg-dark-300" />
              </a>
            )}
            {receipt.booking.status === 'pending' ? (
              <div className="flex gap-2">
                <button onClick={() => setStatus(receipt.booking, 'rejected')} disabled={busy === receipt.booking.id}
                  className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5">
                  <X size={15} /> Rechazar
                </button>
                <button onClick={() => setStatus(receipt.booking, 'confirmed')} disabled={busy === receipt.booking.id}
                  className="btn-gold flex-1 flex items-center justify-center gap-1.5">
                  <Check size={15} /> Pago OK, confirmar
                </button>
              </div>
            ) : receipt.booking.status === 'confirmed' && new Date(receipt.booking.starts_at) > new Date() ? (
              <button onClick={() => setStatus(receipt.booking, 'cancelled')} className="btn-ghost w-full text-red-400/80">Cancelar este turno</button>
            ) : null}
            {receipt.booking.status === 'confirmed' && (
              <button onClick={() => attend(receipt.booking)}
                className="w-full mt-2 py-2.5 rounded-xl border border-emerald-500/45 text-emerald-500 font-semibold text-sm hover:bg-emerald-500/10 flex items-center justify-center gap-1.5">
                <Check size={15} /> Asistió: sumar a Registros y Cierre
              </button>
            )}
            {receipt.booking.status === 'confirmed' && (
              <button onClick={() => { setNoShowFor(receipt.booking); setReceipt(null) }}
                className="w-full mt-2 py-2 rounded-xl text-red-400/90 font-semibold text-sm hover:bg-red-500/10 flex items-center justify-center gap-1.5">
                Pagó pero no vino
              </button>
            )}
            {['pending', 'confirmed'].includes(receipt.booking.status) && (
              <button onClick={() => { setMoving(receipt.booking); setReceipt(null) }}
                className="btn-outline-gold w-full mt-2 flex items-center justify-center gap-1.5">
                <CalendarDays size={15} /> Cambiar horario (día, hora o barbero)
              </button>
            )}
          </>
        )}
      </Modal>

      {noShowFor && (
        <NoShowChoice booking={noShowFor} onClose={() => setNoShowFor(null)}
          onReschedule={() => { setMoving(noShowFor); setNoShowFor(null) }}
          onKeep={() => { const bk = noShowFor; setNoShowFor(null); noShow(bk) }} />
      )}

      {moving && (
        <MoveBooking booking={moving} tenantSlug={tenant.slug} tenantName={tenant.name} barbers={barberList}
          onClose={() => setMoving(null)}
          onMoved={() => { setReload(r => r + 1); setAgendaKey(k => k + 1) }} />
      )}

      <Modal open={!!after} onClose={() => setAfter(null)} title="¿Le avisás?" size="sm">
        {after && (
          <>
            <p className="text-cream/60 text-sm mb-3">Mensaje listo para mandarle a <b className="text-cream">{after.booking.customer_name}</b>:</p>
            <p className="text-cream/80 text-sm bg-dark-300/60 border border-dark-400/50 rounded-xl p-3 mb-4">{msgFor(after.booking, after.action)}</p>
            <div className="flex gap-2">
              <button onClick={() => setAfter(null)} className="btn-ghost flex-1">Ahora no</button>
              <a href={waTo(after.booking.customer_phone, msgFor(after.booking, after.action))} target="_blank" rel="noreferrer"
                 onClick={() => setAfter(null)} className="btn-gold flex-1 flex items-center justify-center gap-1.5">
                <MessageCircle size={15} /> Enviar
              </a>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

// ═════════════════════════════════════════════════════════════
// AGENDA: quién atiende y cuándo
// ═════════════════════════════════════════════════════════════
const ORDER = [1, 2, 3, 4, 5, 6, 0]  // lunes primero
const hhmm = t => String(t || '').slice(0, 5)

function AgendaTab({ tenant }) {
  const [barbers, setBarbers] = useState(null)
  const [hours, setHours]     = useState({})     // barberId → { weekday: [{start,end}] }
  const [blocks, setBlocks]   = useState([])
  const [reload, setReload]   = useState(0)
  const [editing, setEditing] = useState(null)   // barbero que se está editando
  const [blockOpen, setBlockOpen] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('barbers').select('id,name,photo_url,takes_bookings,is_active').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('rsv_hours').select('*').eq('tenant_id', tenant.id),
      supabase.from('rsv_blocks').select('*').eq('tenant_id', tenant.id)
        .gte('ends_at', new Date().toISOString()).order('starts_at'),
    ]).then(([b, h, x]) => {
      if (!alive) return
      if (b.error || h.error) { toast.error('No se pudo cargar la agenda'); setBarbers([]); return }
      const map = {}
      for (const r of h.data || []) {
        const m = (map[r.barber_id] ||= {})
        ;(m[r.weekday] ||= []).push({ start: hhmm(r.start_time), end: hhmm(r.end_time) })
      }
      for (const id in map) for (const d in map[id]) map[id][d].sort((a, z) => a.start.localeCompare(z.start))
      setBarbers(b.data || []); setHours(map); setBlocks(x.data || [])
    })
    return () => { alive = false }
  }, [tenant.id, reload])

  async function toggleTakes(b) {
    const v = !b.takes_bookings
    setBarbers(list => list.map(x => x.id === b.id ? { ...x, takes_bookings: v } : x))
    const { error } = await supabase.from('barbers').update({ takes_bookings: v }).eq('id', b.id)
    if (error) { toast.error('No se pudo guardar'); setReload(r => r + 1) }
    else toast.success(v ? `${b.name} vuelve a tomar turnos` : `${b.name} no toma turnos online`)
  }

  async function removeBlock(id) {
    const { error } = await supabase.from('rsv_blocks').delete().eq('id', id)
    if (error) return toast.error('No se pudo borrar')
    setBlocks(list => list.filter(x => x.id !== id))
  }

  if (!barbers) return <div className="py-12 flex justify-center"><Spinner /></div>
  if (!barbers.length) return <EmptyState icon={CalendarDays} title="No hay barberos activos" description="Cargalos en Barberos y volvé acá." />

  const names = Object.fromEntries(barbers.map(b => [b.id, b.name]))

  return (
    <>
      <p className="label">Barberos</p>
      <div className="flex flex-col gap-2.5 mb-8">
        {barbers.map(b => {
          const h = hours[b.id] || {}
          const days = ORDER.filter(d => h[d]?.length)
          return (
            <div key={b.id} className="card !p-4">
              <div className="flex items-center gap-3">
                {b.photo_url
                  ? <img src={b.photo_url} alt="" className="w-11 h-11 rounded-full object-cover" />
                  : <div className="w-11 h-11 rounded-full bg-gold/12 border border-gold/25 text-gold font-semibold flex items-center justify-center">{b.name[0]}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-cream font-semibold truncate">{b.name}</p>
                  <p className={`text-xs font-semibold ${b.takes_bookings && days.length ? 'text-emerald-500' : 'text-cream/40'}`}>
                    {!b.takes_bookings ? 'No toma turnos online' : days.length ? 'Toma turnos' : 'Sin horario cargado'}
                  </p>
                </div>
                <Switch on={b.takes_bookings} onChange={() => toggleTakes(b)} label={`Turnos de ${b.name}`} />
              </div>
              <div className="mt-3 pt-3 border-t border-dark-400/30 flex flex-col gap-2">
                {days.length ? (
                  <div className="flex flex-col gap-1">
                    {summarizeWeek(h).map(g => (
                      <p key={g.label} className="text-xs text-cream/70">
                        <b className="text-cream/90">{g.label}</b> · {g.hours}
                      </p>
                    ))}
                  </div>
                ) : <p className="text-cream/40 text-xs">Todavía no tiene horario: cargale los días y horas en que atiende.</p>}
                <button onClick={() => setEditing(b)}
                  className="self-start text-gold text-xs font-semibold flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gold/35 hover:bg-gold/10">
                  <Clock size={13} /> {days.length ? 'Editar horario' : 'Cargar horario'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="label !mb-0">Bloqueos (no se puede reservar)</p>
        <button onClick={() => setBlockOpen(true)} className="text-gold text-sm font-semibold flex items-center gap-1"><Plus size={15} /> Bloquear</button>
      </div>
      {!blocks.length ? (
        <p className="text-cream/40 text-sm card-flat !p-4">Nada bloqueado. Usalo para francos, vacaciones, feriados o un barbero que se va antes.</p>
      ) : (
        <div className="card-flat !p-0 divide-y divide-dark-400/30">
          {blocks.map(x => (
            <div key={x.id} className="px-4 py-3 flex items-center gap-3">
              <Ban size={16} className="text-red-400/70 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-cream text-sm font-semibold">{x.barber_id ? names[x.barber_id] || 'Barbero' : 'Toda la barbería'}</p>
                <p className="text-cream/50 text-xs">{blockLabel(x)}{x.reason ? ` · ${x.reason}` : ''}</p>
              </div>
              <button onClick={() => removeBlock(x.id)} className="btn-ghost !p-2" title="Quitar"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <HoursModal tenant={tenant} barber={editing} initial={hours[editing.id] || {}}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload(r => r + 1) }} />
      )}
      {blockOpen && (
        <BlockModal tenant={tenant} barbers={barbers}
          onClose={() => setBlockOpen(false)} onSaved={() => { setBlockOpen(false); setReload(r => r + 1) }} />
      )}
    </>
  )
}

// «Lun a Vie · 10:00–13:00 y 15:00–20:00» / «Sáb · 10:00–14:00»: agrupa días
// seguidos (lunes primero) que tienen exactamente el mismo horario
function summarizeWeek(h) {
  const key = d => (h[d] || []).map(r => `${r.start}–${r.end}`).join(' y ')
  const short = d => WEEKDAYS[d].slice(0, 3)
  const out = []
  let run = []
  const flush = () => {
    if (!run.length) return
    const k = key(run[0])
    if (k) out.push({ label: run.length === 1 ? short(run[0]) : run.length === 2 ? `${short(run[0])} y ${short(run[1])}` : `${short(run[0])} a ${short(run[run.length - 1])}`, hours: k })
    run = []
  }
  for (const d of ORDER) {
    if (run.length && key(d) !== key(run[0])) flush()
    run.push(d)
  }
  flush()
  return out
}

function blockLabel(x) {
  const a = dateKeyAR(x.starts_at), z = dateKeyAR(new Date(new Date(x.ends_at).getTime() - 1))
  const fullDay = timeAR(x.starts_at) === '00:00' && timeAR(x.ends_at) === '00:00'
  if (fullDay) return a === z ? `${dayParts(a).long} · todo el día` : `${dayParts(a).long} al ${dayParts(z).long}`
  return `${dayParts(a).long} · ${timeAR(x.starts_at)} a ${timeAR(x.ends_at)}`
}

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-gold' : 'bg-dark-400/70'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function HoursModal({ tenant, barber, initial, onClose, onSaved }) {
  const [week, setWeek] = useState(() => {
    const w = {}
    for (const d of ORDER) w[d] = (initial[d] || []).map(r => ({ ...r }))
    return w
  })
  const [saving, setSaving] = useState(false)

  const setRange = (d, i, k, v) => setWeek(w => ({ ...w, [d]: w[d].map((r, j) => j === i ? { ...r, [k]: v } : r) }))
  const addRange = d => setWeek(w => {
    const last = w[d][w[d].length - 1]
    return { ...w, [d]: [...w[d], last ? { start: last.end < '16:00' ? '16:00' : last.end, end: '20:00' } : { start: '10:00', end: '20:00' }] }
  })
  const delRange = (d, i) => setWeek(w => ({ ...w, [d]: w[d].filter((_, j) => j !== i) }))
  const copyToAll = d => setWeek(w => {
    const n = { ...w }
    for (const x of ORDER) if (x !== 0 && x !== d) n[x] = w[d].map(r => ({ ...r }))
    return n
  })

  async function save() {
    const rows = []
    for (const d of ORDER) for (const r of week[d]) {
      if (!r.start || !r.end || r.end <= r.start) return toast.error(`${WEEKDAYS[d]}: la hora de cierre tiene que ser después de la de apertura`)
      rows.push({ tenant_id: tenant.id, barber_id: barber.id, weekday: d, start_time: r.start, end_time: r.end })
    }
    setSaving(true)
    const del = await supabase.from('rsv_hours').delete().eq('barber_id', barber.id)
    const ins = rows.length && !del.error ? await supabase.from('rsv_hours').insert(rows) : { error: del.error }
    setSaving(false)
    if (ins.error) return toast.error('No se pudo guardar el horario')
    toast.success(`Horario de ${barber.name} guardado`)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Horario de ${barber.name}`}>
      <div className="flex flex-col gap-3">
        {ORDER.map(d => (
          <div key={d} className="rounded-xl border border-dark-400/40 p-3">
            <div className="flex items-center justify-between">
              <p className={`text-sm font-semibold ${week[d].length ? 'text-cream' : 'text-cream/40'}`}>{WEEKDAYS[d]}</p>
              <div className="flex items-center gap-3">
                {week[d].length > 0 && d === 1 && (
                  <button onClick={() => copyToAll(d)} className="text-[11px] text-cream/45 hover:text-gold font-semibold">Copiar a mar–sáb</button>
                )}
                <Switch on={week[d].length > 0} label={WEEKDAYS[d]}
                  onChange={() => week[d].length ? setWeek(w => ({ ...w, [d]: [] })) : addRange(d)} />
              </div>
            </div>
            {week[d].map((r, i) => (
              <div key={i} className="flex items-center gap-2 mt-2.5">
                <input type="time" step={900} value={r.start} onChange={e => setRange(d, i, 'start', e.target.value)} className="input-dark !py-2 !px-3" />
                <span className="text-cream/40 text-sm">a</span>
                <input type="time" step={900} value={r.end} onChange={e => setRange(d, i, 'end', e.target.value)} className="input-dark !py-2 !px-3" />
                <button onClick={() => delRange(d, i)} className="btn-ghost !p-2 shrink-0" title="Quitar franja"><X size={15} /></button>
              </div>
            ))}
            {week[d].length > 0 && (
              <button onClick={() => addRange(d)} className="text-gold text-xs font-semibold mt-2 flex items-center gap-1"><Plus size={13} /> Agregar franja (ej. después del almuerzo)</button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn-gold flex-1">{saving ? 'Guardando…' : 'Guardar horario'}</button>
      </div>
    </Modal>
  )
}

function BlockModal({ tenant, barbers, onClose, onSaved }) {
  const today = dateKeyAR()
  const [barberId, setBarberId] = useState('')
  const [from, setFrom]   = useState(today)
  const [to, setTo]       = useState(today)
  const [allDay, setAllDay] = useState(true)
  const [t1, setT1]       = useState('10:00')
  const [t2, setT2]       = useState('14:00')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const starts = allDay ? fromLocalAR(from, '00:00') : fromLocalAR(from, t1)
    const ends   = allDay ? fromLocalAR(addDaysKey(to < from ? from : to, 1), '00:00') : fromLocalAR(from, t2)
    if (ends <= starts) return toast.error('El final tiene que ser después del inicio')
    setSaving(true)
    const { error } = await supabase.from('rsv_blocks').insert({
      tenant_id: tenant.id, barber_id: barberId || null,
      starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: reason.trim() || null,
    })
    setSaving(false)
    if (error) return toast.error('No se pudo bloquear')
    toast.success('Bloqueado')
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Bloquear horario" size="sm">
      <div className="flex flex-col gap-4">
        <div>
          <label className="label">Quién</label>
          <select value={barberId} onChange={e => setBarberId(e.target.value)} className="input-dark">
            <option value="">Toda la barbería</option>
            {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-cream/75">Todo el día</span>
          <Switch on={allDay} onChange={() => setAllDay(v => !v)} label="Todo el día" />
        </div>
        {allDay ? (
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Desde</label><input type="date" value={from} min={today} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} className="input-dark" /></div>
            <div><label className="label">Hasta</label><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="input-dark" /></div>
          </div>
        ) : (
          <>
            <div><label className="label">Día</label><input type="date" value={from} min={today} onChange={e => setFrom(e.target.value)} className="input-dark" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">De</label><input type="time" step={900} value={t1} onChange={e => setT1(e.target.value)} className="input-dark" /></div>
              <div><label className="label">A</label><input type="time" step={900} value={t2} onChange={e => setT2(e.target.value)} className="input-dark" /></div>
            </div>
          </>
        )}
        <div>
          <label className="label">Motivo (opcional, solo lo ves vos)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Franco, vacaciones, feriado…" className="input-dark" maxLength={80} />
        </div>
        <p className="text-cream/40 text-xs">Los turnos que ya estén reservados en ese rango no se borran: revisalos en Turnos.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-gold flex-1">{saving ? 'Guardando…' : 'Bloquear'}</button>
        </div>
      </div>
    </Modal>
  )
}

// ═════════════════════════════════════════════════════════════
// AJUSTES
// ═════════════════════════════════════════════════════════════
const EMPTY = {
  rsv_enabled: false, rsv_pay_link: '', rsv_alias: '', rsv_cbu: '', rsv_holder: '', rsv_bank: '',
  rsv_whatsapp: '', rsv_slot_min: 30, rsv_lead_min: 60, rsv_horizon_days: 14, rsv_notice: '',
}
const DURATIONS = [15, 20, 30, 40, 45, 60, 75, 90, 120]

function SettingsTab({ tenant }) {
  const [cfg, setCfg]         = useState(null)
  const [services, setServices] = useState([])
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [onlinePriceReady, setOnlinePriceReady] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('tenant_config').select(Object.keys(EMPTY).join(',')).eq('tenant_id', tenant.id).maybeSingle(),
      // booking_price viene con la migración v2: si todavía no corrió, se pide sin esa columna
      supabase.from('services').select('id,name,price,duration_min,booking_price,is_active').eq('tenant_id', tenant.id).eq('is_active', true).order('price')
        .then(r => r.error
          ? supabase.from('services').select('id,name,price,duration_min,is_active').eq('tenant_id', tenant.id).eq('is_active', true).order('price')
              .then(r2 => ({ ...r2, noOnlinePrice: true }))
          : r),
    ]).then(([c, s]) => {
      if (!alive) return
      const base = { ...EMPTY }
      for (const k in base) if (c.data && c.data[k] != null) base[k] = c.data[k]
      setCfg(base)
      setServices((s.data || []).map(x => ({ ...x, _online: x.booking_price != null ? String(Math.round(x.booking_price)) : '' })))
      setOnlinePriceReady(!s.noOnlinePrice)
    })
    return () => { alive = false }
  }, [tenant.id])

  const link = bookingLink(tenant.slug)
  const set = (k, v) => { setCfg(c => ({ ...c, [k]: v })); setDirty(true) }
  const setDur = (id, v) => { setServices(l => l.map(s => s.id === id ? { ...s, duration_min: v, _dirty: true } : s)); setDirty(true) }
  const setOnline = (id, v) => { setServices(l => l.map(s => s.id === id ? { ...s, _online: v.replace(/\D/g, ''), _dirty: true } : s)); setDirty(true) }

  async function save() {
    if (cfg.rsv_pay_link && !/^https?:\/\//i.test(cfg.rsv_pay_link.trim())) return toast.error('El link de pago tiene que empezar con https://')
    if (cfg.rsv_enabled && !cfg.rsv_pay_link?.trim() && !cfg.rsv_alias?.trim() && !cfg.rsv_cbu?.trim()) {
      return toast.error('Para activar las reservas cargá un link de pago o un alias/CBU')
    }
    setSaving(true)
    const payload = { tenant_id: tenant.id }
    for (const k in EMPTY) payload[k] = typeof cfg[k] === 'string' ? (cfg[k].trim() || null) : cfg[k]
    const { error } = await supabase.from('tenant_config').upsert(payload, { onConflict: 'tenant_id' })
    let svcErr = null
    for (const s of services.filter(x => x._dirty)) {
      const patch = { duration_min: s.duration_min }
      if (onlinePriceReady) patch.booking_price = s._online === '' ? null : Number(s._online)
      const r = await supabase.from('services').update(patch).eq('id', s.id)
      if (r.error) svcErr = r.error
    }
    setSaving(false)
    if (error || svcErr) return toast.error('No se pudo guardar todo. Probá de nuevo.')
    setServices(l => l.map(s => ({ ...s, _dirty: false })))
    setDirty(false)
    toast.success('Ajustes guardados')
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast.success('Link copiado') } catch { toast(link) }
  }

  if (!cfg) return <div className="py-12 flex justify-center"><Spinner /></div>

  return (
    <div className="flex flex-col gap-5 pb-20">
      <div className="card !p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-cream font-semibold">Reservas online</p>
            <p className={`text-xs font-semibold ${cfg.rsv_enabled ? 'text-emerald-500' : 'text-cream/40'}`}>
              {cfg.rsv_enabled ? 'Activas: los clientes pueden reservar' : 'Apagadas'}
            </p>
          </div>
          <Switch on={cfg.rsv_enabled} onChange={() => set('rsv_enabled', !cfg.rsv_enabled)} label="Reservas online" />
        </div>
        <div className="mt-4 pt-4 border-t border-dark-400/30">
          <p className="label flex items-center gap-1.5"><Link2 size={12} /> Link para tus clientes</p>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-dark-300/50 border border-dark-400/50 text-sm text-cream/80 truncate">{link.replace(/^https?:\/\//, '')}</div>
            <button onClick={copyLink} className="btn-outline-gold !px-3" title="Copiar"><Copy size={15} /></button>
            <a href={link} target="_blank" rel="noreferrer" className="btn-outline-gold !px-3" title="Abrir"><ExternalLink size={15} /></a>
          </div>
          <p className="text-cream/35 text-[11px] mt-2">Ponelo en la bio de Instagram y en el estado de WhatsApp.</p>
        </div>
      </div>

      <div className="card !p-4 flex flex-col gap-4">
        <div>
          <p className="text-cream font-semibold">Cobro del turno</p>
          <p className="text-cream/45 text-xs">El cliente paga el total al reservar y sube el comprobante. Vos confirmás en Turnos.</p>
        </div>
        <Field label="Link de pago (Mercado Pago u otro)" hint="Si lo cargás, el cliente ve un botón «Pagar». Usá un link de monto libre o uno por servicio.">
          <input value={cfg.rsv_pay_link || ''} onChange={e => set('rsv_pay_link', e.target.value)} placeholder="https://link.mercadopago.com.ar/tubarberia" className="input-dark" inputMode="url" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Alias"><input value={cfg.rsv_alias || ''} onChange={e => set('rsv_alias', e.target.value)} placeholder="barberia.1935" className="input-dark" /></Field>
          <Field label="CBU / CVU"><input value={cfg.rsv_cbu || ''} onChange={e => set('rsv_cbu', e.target.value.replace(/\s/g, ''))} placeholder="0000003100…" className="input-dark" inputMode="numeric" /></Field>
          <Field label="Titular"><input value={cfg.rsv_holder || ''} onChange={e => set('rsv_holder', e.target.value)} placeholder="Nombre y apellido" className="input-dark" /></Field>
          <Field label="Banco / billetera"><input value={cfg.rsv_bank || ''} onChange={e => set('rsv_bank', e.target.value)} placeholder="Mercado Pago, Galicia…" className="input-dark" /></Field>
        </div>
      </div>

      <div className="card !p-4 flex flex-col gap-4">
        <p className="text-cream font-semibold">Cómo se reserva</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Turnos cada">
            <select value={cfg.rsv_slot_min} onChange={e => set('rsv_slot_min', Number(e.target.value))} className="input-dark !px-3">
              {[15, 20, 30, 45, 60].map(v => <option key={v} value={v}>{v} min</option>)}
            </select>
          </Field>
          <Field label="Anticipación">
            <select value={cfg.rsv_lead_min} onChange={e => set('rsv_lead_min', Number(e.target.value))} className="input-dark !px-3">
              {[[0, 'Ninguna'], [30, '30 min'], [60, '1 h'], [120, '2 h'], [240, '4 h'], [720, '12 h'], [1440, '1 día']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Hasta">
            <select value={cfg.rsv_horizon_days} onChange={e => set('rsv_horizon_days', Number(e.target.value))} className="input-dark !px-3">
              {[7, 14, 21, 30, 60].map(v => <option key={v} value={v}>{v} días</option>)}
            </select>
          </Field>
        </div>
        <Field label="WhatsApp de la barbería" hint="Para que el cliente te avise o consulte.">
          <input value={cfg.rsv_whatsapp || ''} onChange={e => set('rsv_whatsapp', e.target.value)} placeholder={tenant.phone || '11 2345 6789'} className="input-dark" inputMode="tel" />
        </Field>
        <Field label="Aviso para el cliente (opcional)">
          <textarea value={cfg.rsv_notice || ''} onChange={e => set('rsv_notice', e.target.value)} rows={2} maxLength={240}
            placeholder="Ej: Llegá 5 minutos antes. Si cancelás con menos de 2 h, el pago no se devuelve." className="input-dark resize-none" />
        </Field>
      </div>

      <div className="card !p-4">
        <p className="text-cream font-semibold mb-1">Servicios online</p>
        <p className="text-cream/45 text-xs mb-3">
          Cuánto dura cada turno y cuánto se cobra al reservar. Si dejás el precio online vacío, se cobra lo mismo que en el local.
        </p>
        {!onlinePriceReady && (
          <p className="text-amber-500 text-xs mb-3">Para poner un precio online distinto falta correr la migración «reservas v2» en Supabase.</p>
        )}
        {!services.length && <p className="text-cream/40 text-sm">Cargá servicios en Configuración.</p>}
        {services.length > 0 && (
          <div className="hidden sm:flex items-center gap-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-cream/35">
            <span className="flex-1">Servicio</span>
            <span className="w-[104px]">Duración</span>
            <span className="w-[120px]">Precio online</span>
          </div>
        )}
        <div className="flex flex-col divide-y divide-dark-400/30">
          {services.map(s => {
            const differs = s._online !== '' && Number(s._online) !== Number(s.price)
            return (
              <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-cream text-sm font-medium truncate">{s.name}</p>
                  <p className="text-cream/40 text-xs">
                    En el local {money(s.price)}
                    {differs && <> · <span className="text-gold font-semibold">online {money(s._online)}</span></>}
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="sm:hidden text-[10px] font-bold uppercase tracking-widest text-cream/35">Duración</span>
                    <select value={s.duration_min || 30} onChange={e => setDur(s.id, Number(e.target.value))}
                      className="input-dark sm:!w-[104px] !py-2 !px-3" aria-label={`Duración de ${s.name}`}>
                      {[...new Set([...DURATIONS, s.duration_min || 30])].sort((a, b) => a - b).map(v => <option key={v} value={v}>{durationLabel(v)}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="sm:hidden text-[10px] font-bold uppercase tracking-widest text-cream/35">Precio online</span>
                    <div className={`flex items-center sm:w-[120px] rounded-xl border bg-dark-300/60 transition-colors ${differs ? 'border-gold/50' : 'border-dark-400/70'} ${onlinePriceReady ? '' : 'opacity-40'}`}>
                      <span className="pl-3 text-cream/40 text-sm">$</span>
                      <input value={s._online} onChange={e => setOnline(s.id, e.target.value)} disabled={!onlinePriceReady}
                        inputMode="numeric" placeholder={String(Math.round(s.price))} aria-label={`Precio online de ${s.name}`}
                        className="w-full bg-transparent border-0 focus:ring-0 text-cream text-sm py-2 pl-1.5 pr-3 placeholder:text-cream/30" />
                    </div>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Botón de guardar: aparece solo cuando hay algo para guardar */}
      {(dirty || saving) && (
        <div className="fixed md:sticky bottom-[76px] md:bottom-4 left-0 right-0 px-4 md:px-0 z-20 pointer-events-none">
          <button onClick={save} disabled={saving}
            className="btn-gold w-full !py-3.5 pointer-events-auto shadow-gold-md">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-cream/35 text-[11px] mt-1.5">{hint}</p>}
    </div>
  )
}

