import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Check, ClipboardList, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import Spinner from '../ui/Spinner'
import NoShowChoice from './NoShowChoice'
import MoveBooking from './MoveBooking'
import { money, timeAR, fromLocalAR, addDaysKey, dayParts, dateKeyAR } from '../../lib/booking'
import { loadBookingSaleContext, createSaleFromBooking, createNoShowSale, isNoShowSale, prepaidMethod, bookingSplit } from '../../lib/bookingSales'

// ─────────────────────────────────────────────────────────────────────────────
// Cierre → «Turnos reservados»
//
// Muestra cada turno confirmado del período (ya pagado por adelantado) y si
// ya entró a las ventas oficiales. «Cargar a ventas» lo pasa como una venta
// más (método Transferencia, comisión normal del barbero), así suma al total,
// a la tarjeta de Transferencia y a lo que se le paga a cada barbero.
// Un turno ya cargado no se puede cargar otra vez (lo frena la base).
// ─────────────────────────────────────────────────────────────────────────────
export default function ClosingBookings({ tenantId, tenantSlug, tenantName, from, to, sales, onChanged }) {
  const [bookings, setBookings] = useState(null)
  const [pending, setPending]   = useState(0)
  const [drafted, setDrafted]   = useState({})   // booking_id → true (está en registros del barbero)
  const [ctx, setCtx]           = useState(null)
  const [ready, setReady]       = useState(true) // migración v2 corrida
  const [busy, setBusy]         = useState(null) // id | 'all'
  const [open, setOpen]         = useState(true)
  const [reload, setReload]     = useState(0)
  const [noShowFor, setNoShowFor] = useState(null)
  const [moving, setMoving]     = useState(null)

  useEffect(() => {
    if (!tenantId) return
    let alive = true
    const start = fromLocalAR(from, '00:00').toISOString()
    const end   = fromLocalAR(addDaysKey(to, 1), '00:00').toISOString()
    Promise.all([
      supabase.from('bookings').select('*').eq('tenant_id', tenantId).in('status', ['confirmed', 'pending'])
        .gte('starts_at', start).lt('starts_at', end).order('starts_at'),
      supabase.from('drafts').select('booking_id').eq('tenant_id', tenantId).not('booking_id', 'is', null)
        .gte('draft_date', from).lte('draft_date', to),
      loadBookingSaleContext(tenantId).catch(() => null),
    ]).then(([k, d, c]) => {
      if (!alive) return
      if (k.error) { setBookings([]); return }   // sin tabla de reservas: no se muestra nada
      setBookings((k.data || []).filter(x => x.status === 'confirmed'))
      setPending((k.data || []).filter(x => x.status === 'pending').length)
      setReady(!d.error)
      setDrafted(Object.fromEntries((d.data || []).map(x => [x.booking_id, true])))
      setCtx(c)
    })
    return () => { alive = false }
  }, [tenantId, from, to, reload])

  const inSales = useMemo(() => Object.fromEntries((sales || []).filter(s => s.booking_id).map(s => [s.booking_id, s])), [sales])

  if (!bookings || (!bookings.length && !pending)) return null

  const method = ctx ? prepaidMethod(ctx.methods) : null
  const barberName = id => ctx?.barbers.find(b => b.id === id)?.name || '—'
  const missing = bookings.filter(b => !inSales[b.id])
  const total = bookings.reduce((a, b) => a + Number(b.price || 0), 0)
  const loadedTotal = bookings.filter(b => inSales[b.id]).reduce((a, b) => a + Number(b.price || 0), 0)
  const multiDay = from !== to

  async function loadOne(bk) {
    if (!ctx) return
    setBusy(bk.id)
    try {
      await createSaleFromBooking(bk, ctx, method?.id)
      toast.success(`${bk.customer_name}: cargado a ventas`)
      onChanged?.()
    } catch (e) {
      toast.error(e.message)
      onChanged?.()
    } finally {
      setBusy(null)
      setReload(r => r + 1)
    }
  }

  async function noShowOne(bk) {
    if (!ctx) return
    setBusy(bk.id)
    try {
      await createNoShowSale(bk, ctx, method?.id)
      toast.success(`${bk.customer_name}: no vino · suma al local`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
      onChanged?.()
      setReload(r => r + 1)
    }
  }

  async function loadAll() {
    if (!ctx || !missing.length) return
    setBusy('all')
    let ok = 0, fail = 0
    for (const bk of missing) {
      try { await createSaleFromBooking(bk, ctx, method?.id); ok++ } catch { fail++ }
    }
    setBusy(null)
    if (ok) toast.success(`${ok} ${ok === 1 ? 'turno cargado' : 'turnos cargados'} a ventas`)
    if (fail) toast.error(`${fail} no se pudieron cargar (puede que ya estuvieran)`)
    onChanged?.()
    setReload(r => r + 1)
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full p-4 flex items-center gap-3 text-left">
        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center shrink-0">
          <CalendarCheck size={18} className="text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-cream font-semibold">Turnos reservados</p>
          <p className="text-cream/45 text-xs">
            {bookings.length} {bookings.length === 1 ? 'turno' : 'turnos'} · <b className="text-gold">{money(total)}</b> ya cobrados
          </p>
          <div className="mt-1.5">
            {missing.length > 0
              ? <span className="badge-pending">{missing.length} sin marcar</span>
              : bookings.length > 0 && <span className="badge-active"><Check size={11} /> Todo marcado</span>}
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-cream/30 shrink-0" /> : <ChevronDown size={16} className="text-cream/30 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Cobrado" value={money(total)} />
            <Stat label="Marcado" value={money(loadedTotal)} ok={loadedTotal === total && total > 0} />
            <Stat label="Falta" value={money(total - loadedTotal)} warn={total - loadedTotal > 0} />
          </div>

          <p className="text-cream/45 text-[11px] leading-relaxed">
            Ya cobrados{method ? <> por <b className="text-cream/70">{method.name}</b></> : ''} (no es plata de la caja). Marcá cada uno:
            {' '}<b className="text-emerald-500">✓ Asistió</b> suma con la comisión del barbero · <b className="text-red-400">No vino</b> suma para el local.
          </p>

          {pending > 0 && (
            <Link to="/admin/turnos" className="flex items-center gap-2 text-xs text-amber-500 font-semibold">
              <AlertTriangle size={13} /> {pending} {pending === 1 ? 'turno espera' : 'turnos esperan'} que confirmes el pago (no entran al cierre hasta confirmarlos)
            </Link>
          )}

          {!ready && (
            <p className="text-amber-500 text-xs">Para cargarlos a ventas con un toque falta correr la migración «reservas v2» en Supabase.</p>
          )}

          {bookings.length > 0 && (
            <div className="rounded-xl border border-dark-400/40 divide-y divide-dark-400/30">
              {bookings.map(bk => {
                const sale = inSales[bk.id]
                const split = ctx ? bookingSplit(bk, ctx) : null
                return (
                  <div key={bk.id} className="px-3 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
                    <div className="w-12 shrink-0 text-center">
                      {multiDay && <p className="text-[10px] text-cream/40 leading-none mb-0.5">{dayParts(dateKeyAR(bk.starts_at)).day} {dayParts(dateKeyAR(bk.starts_at)).month}</p>}
                      <p className="text-gold font-bold text-sm leading-none">{timeAR(bk.starts_at)}</p>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                      <p className="text-cream text-sm font-semibold truncate">{bk.customer_name}</p>
                      <p className="text-cream/45 text-[11px] truncate">
                        {bk.service_name} · {barberName(bk.barber_id)} · {money(bk.price)}
                        {split && split.barber && !(sale && isNoShowSale(sale)) && <> · barbero {money(split.forBarber)}</>}
                      </p>
                    </div>
                    {sale ? (
                      isNoShowSale(sale)
                        ? <span className="badge-inactive shrink-0 ml-auto">No vino · al local</span>
                        : <span className="badge-active shrink-0 ml-auto"><Check size={11} /> Asistió</span>
                    ) : (
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-auto">
                        {drafted[bk.id] && (
                          <span className="text-[10px] text-emerald-500/80 flex items-center gap-1"><ClipboardList size={10} /> el barbero lo marcó atendido</span>
                        )}
                        <div className="flex gap-1">
                          {!drafted[bk.id] && (
                            <button onClick={() => setNoShowFor(bk)} disabled={!ctx || !ready || busy != null}
                              className="px-2 py-1.5 rounded-lg text-[11px] font-semibold text-red-400/90 border border-red-500/30 hover:bg-red-500/10">
                              No vino
                            </button>
                          )}
                          <button onClick={() => loadOne(bk)} disabled={!ctx || !ready || busy != null}
                            className="btn-outline-gold !px-2.5 !py-1.5 !text-xs">
                            {busy === bk.id ? <Spinner size={12} /> : drafted[bk.id] ? 'Pasar a ventas' : '✓ Asistió'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {noShowFor && (
            <NoShowChoice booking={noShowFor} onClose={() => setNoShowFor(null)}
              onReschedule={() => { setMoving(noShowFor); setNoShowFor(null) }}
              onKeep={() => { const bk = noShowFor; setNoShowFor(null); noShowOne(bk) }} />
          )}
          {moving && tenantSlug && (
            <MoveBooking booking={moving} tenantSlug={tenantSlug} tenantName={tenantName} barbers={ctx?.barbers || []}
              onClose={() => setMoving(null)}
              onMoved={() => { setReload(r => r + 1); onChanged?.() }} />
          )}

          {missing.length > 1 && (
            <button onClick={loadAll} disabled={!ctx || !ready || busy != null} className="btn-gold w-full flex items-center justify-center gap-2">
              {busy === 'all' ? <Spinner size={15} /> : <Check size={15} />} Marcar los {missing.length} como asistidos
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, ok, warn }) {
  return (
    <div className="rounded-xl bg-dark-300/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider font-bold text-cream/40">{label}</p>
      <p className={`font-semibold text-sm ${ok ? 'text-emerald-500' : warn ? 'text-amber-500' : 'text-cream'}`}>{value}</p>
    </div>
  )
}
