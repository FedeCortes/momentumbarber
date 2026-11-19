import { useEffect, useMemo, useState } from 'react'
import { Ban, CalendarX2, Lock, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import Spinner from '../ui/Spinner'
import { fromLocalAR, addDaysKey, timeAR, money } from '../../lib/booking'

// ─────────────────────────────────────────────────────────────────────────────
// Agenda del día de uno o varios barberos.
//
// Cada casillero es un horario (cada «turnos cada X min» de Ajustes):
//   · Libre    → tocarlo lo marca OCUPADO (el cliente lo ve en rojo y no puede reservarlo)
//   · Ocupado  → tocarlo lo vuelve a liberar
//   · Turno    → un cliente reservó; tocarlo abre el detalle
// «Día ocupado» bloquea todo el día de ese barbero de un toque.
//
// Los «ocupado» se guardan como bloqueos (rsv_blocks) del barbero: es lo mismo
// que «Bloquear» en Agenda, así que no hay dos reglas distintas.
// ─────────────────────────────────────────────────────────────────────────────

const hhmm = t => String(t || '').slice(0, 5)
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2

export default function DayAgenda({ tenantId, barbers, day, onOpenBooking, onAttend, attendHint, refreshKey = 0, emptyText }) {
  const [data, setData]   = useState(null)   // { slotMin, hours, blocks, bookings }
  const [err, setErr]     = useState(false)
  const [reload, setReload] = useState(0)
  const [busy, setBusy]   = useState(null)   // id de casillero o barbero en curso

  const barberIds = barbers.map(b => b.id).join(',')

  useEffect(() => {
    if (!barberIds) { setData({ slotMin: 30, hours: [], blocks: [], bookings: [] }); return }
    let alive = true
    setErr(false)
    const start = fromLocalAR(day, '00:00').toISOString()
    const end   = fromLocalAR(addDaysKey(day, 1), '00:00').toISOString()
    const ids = barberIds.split(',')
    Promise.all([
      supabase.from('tenant_config').select('rsv_slot_min').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('rsv_hours').select('barber_id,weekday,start_time,end_time').in('barber_id', ids),
      supabase.from('rsv_blocks').select('*').eq('tenant_id', tenantId).lt('starts_at', end).gt('ends_at', start),
      supabase.from('bookings').select('*').eq('tenant_id', tenantId).in('barber_id', ids)
        .in('status', ['pending', 'confirmed']).lt('starts_at', end).gt('ends_at', start).order('starts_at'),
    ]).then(async ([c, h, x, k]) => {
      if (!alive) return
      if (h.error || x.error || k.error) { setErr(true); return }
      // ¿Qué turnos ya se marcaron como asistidos? (= ya están en ventas o en registros)
      const attended = {}
      const bIds = (k.data || []).map(b => b.id)
      if (bIds.length) {
        const [sv, dr] = await Promise.all([
          supabase.from('sales').select('booking_id').in('booking_id', bIds),
          supabase.from('drafts').select('booking_id').in('booking_id', bIds),
        ])
        for (const r of dr.data || []) attended[r.booking_id] = 'registro'
        for (const r of sv.data || []) attended[r.booking_id] = 'venta'
      }
      if (!alive) return
      setData({
        slotMin: Math.max(5, Number(c.data?.rsv_slot_min) || 30),
        hours: h.data || [], blocks: x.data || [], bookings: k.data || [], attended,
      })
    })
    return () => { alive = false }
  }, [tenantId, barberIds, day, reload, refreshKey])

  const weekday = new Date(day + 'T12:00:00-03:00').getUTCDay()

  // Casilleros de cada barbero
  const rows = useMemo(() => {
    if (!data) return []
    return barbers.map(b => {
      const ranges = data.hours.filter(h => h.barber_id === b.id && h.weekday === weekday)
        .map(h => ({ s: hhmm(h.start_time), e: hhmm(h.end_time) }))
        .sort((a, z) => a.s.localeCompare(z.s))
      const cells = []
      for (const r of ranges) {
        let t = fromLocalAR(day, r.s).getTime()
        const stop = fromLocalAR(day, r.e).getTime()
        const step = data.slotMin * 60000
        while (t + step <= stop) {
          const a = t, z = t + step
          const bk = data.bookings.find(k => k.barber_id === b.id && overlaps(a, z, +new Date(k.starts_at), +new Date(k.ends_at)))
          const blocks = data.blocks.filter(x => (x.barber_id == null || x.barber_id === b.id) && overlaps(a, z, +new Date(x.starts_at), +new Date(x.ends_at)))
          cells.push({
            key: `${b.id}-${a}`, a, z, booking: bk || null,
            bookingStart: bk ? +new Date(bk.starts_at) >= a && +new Date(bk.starts_at) < z : false,
            blocks,
          })
          t = z
        }
      }
      const workStart = ranges.length ? fromLocalAR(day, ranges[0].s).getTime() : null
      const workEnd   = ranges.length ? fromLocalAR(day, ranges[ranges.length - 1].e).getTime() : null
      const freeCells = cells.filter(c => !c.booking && !c.blocks.length)
      const turnos = [...new Set(cells.filter(c => c.booking).map(c => c.booking.id))].length
      return { barber: b, cells, ranges, workStart, workEnd, freeCells, turnos }
    })
  }, [data, barbers, day, weekday])

  async function toggleCell(row, cell) {
    if (cell.booking) { onOpenBooking?.(cell.booking); return }
    if (busy) return
    setBusy(cell.key)
    try {
      if (!cell.blocks.length) {
        const { error } = await supabase.from('rsv_blocks').insert({
          tenant_id: tenantId, barber_id: row.barber.id,
          starts_at: new Date(cell.a).toISOString(), ends_at: new Date(cell.z).toISOString(), reason: 'Ocupado',
        })
        if (error) throw error
      } else {
        const global = cell.blocks.find(x => x.barber_id == null)
        if (global) { toast('Está bloqueado para toda la barbería. Liberalo en Agenda → Bloqueos.', { icon: '🔒' }); return }
        // Libera solo este casillero: si el bloqueo era más largo, se parte y queda el resto
        for (const x of cell.blocks) {
          const xs = +new Date(x.starts_at), xe = +new Date(x.ends_at)
          const del = await supabase.from('rsv_blocks').delete().eq('id', x.id)
          if (del.error) throw del.error
          const rest = []
          if (xs < cell.a) rest.push({ starts_at: new Date(xs).toISOString(), ends_at: new Date(cell.a).toISOString() })
          if (xe > cell.z) rest.push({ starts_at: new Date(cell.z).toISOString(), ends_at: new Date(xe).toISOString() })
          if (rest.length) {
            const ins = await supabase.from('rsv_blocks').insert(rest.map(r => ({ ...r, tenant_id: tenantId, barber_id: x.barber_id, reason: x.reason })))
            if (ins.error) throw ins.error
          }
        }
      }
      setReload(r => r + 1)
    } catch {
      toast.error('No se pudo guardar. Probá de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  async function attend(bk) {
    if (!onAttend || busy) return
    setBusy('att-' + bk.id)
    try {
      await onAttend(bk)
    } finally {
      setBusy(null)
      setReload(r => r + 1)
    }
  }

  async function toggleDay(row) {
    if (busy || row.workStart == null) return
    setBusy(row.barber.id)
    try {
      if (row.freeCells.length) {
        // Ocupa todo lo libre del día de un saque (los turnos reservados quedan como están)
        const { error } = await supabase.from('rsv_blocks').insert({
          tenant_id: tenantId, barber_id: row.barber.id,
          starts_at: new Date(row.workStart).toISOString(), ends_at: new Date(row.workEnd).toISOString(), reason: 'Día ocupado',
        })
        if (error) throw error
        toast.success(`${row.barber.name}: día ocupado`)
      } else {
        const own = data.blocks.filter(x => x.barber_id === row.barber.id)
        if (!own.length) { toast('No hay horarios para liberar: está lleno de turnos.'); return }
        const { error } = await supabase.from('rsv_blocks').delete().in('id', own.map(x => x.id))
        if (error) throw error
        toast.success(`${row.barber.name}: día liberado`)
      }
      setReload(r => r + 1)
    } catch {
      toast.error('No se pudo guardar. Probá de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  if (err) {
    return (
      <div className="card text-center py-6">
        <p className="text-cream/60 text-sm mb-3">No se pudo cargar la agenda.</p>
        <button className="btn-outline-gold" onClick={() => setReload(r => r + 1)}>Reintentar</button>
      </div>
    )
  }
  if (!data) return <div className="py-10 flex justify-center"><Spinner /></div>

  const working = rows.filter(r => r.cells.length)
  const off = rows.filter(r => !r.cells.length)
  const now = Date.now()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-[11px] text-cream/50 px-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] border border-dark-400 bg-dark-200" /> Libre</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] bg-gold" /> Turno</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] bg-red-500/70" /> Ocupado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] bg-emerald-500/60" /> Asistió</span>
        <span className="ml-auto text-cream/35 hidden sm:inline">Tocá un horario para marcarlo ocupado o libre</span>
      </div>

      {!working.length && (
        <div className="card-flat text-center py-8">
          <CalendarX2 className="mx-auto text-cream/25 mb-2" size={24} />
          <p className="text-cream/50 text-sm">{emptyText || 'Nadie atiende este día. Cargá los horarios en Agenda.'}</p>
        </div>
      )}

      {working.map(row => {
        const allBusy = !row.freeCells.length
        return (
          <div key={row.barber.id} className="card !p-4">
            <div className="flex items-center gap-3 mb-3">
              {row.barber.photo_url
                ? <img src={row.barber.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                : <div className="w-9 h-9 rounded-full bg-gold/12 border border-gold/25 text-gold font-semibold flex items-center justify-center text-sm">{row.barber.name[0]}</div>}
              <div className="flex-1 min-w-0">
                <p className="text-cream font-semibold text-sm truncate">{row.barber.name}</p>
                <p className="text-cream/45 text-[11px]">
                  {row.ranges.map(r => `${r.s}–${r.e}`).join(' · ')} · {row.turnos} {row.turnos === 1 ? 'turno' : 'turnos'}
                  {allBusy && <span className="text-red-400 font-semibold"> · Agenda llena</span>}
                </p>
              </div>
              <button onClick={() => toggleDay(row)} disabled={busy === row.barber.id}
                className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors flex items-center gap-1.5 ${
                  allBusy ? 'border-dark-400/60 text-cream/60 hover:text-cream' : 'border-red-500/35 text-red-400 hover:bg-red-500/10'}`}>
                {busy === row.barber.id ? <Spinner size={12} /> : <Ban size={13} />}
                {allBusy ? 'Liberar día' : 'Día ocupado'}
              </button>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {row.cells.map(c => {
                const past = c.z <= now
                const first = c.booking && c.bookingStart
                const name = c.booking ? (c.booking.customer_name || '').split(' ')[0] : ''
                const went = c.booking && data.attended?.[c.booking.id]
                const cls = c.booking
                  ? (c.booking.status === 'pending'
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-500'
                      : went ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-500'
                      : 'bg-gold border-gold text-ink')
                  : c.blocks.length
                    ? 'bg-red-500/15 border-red-500/45 text-red-400'
                    : 'bg-dark-200 border-dark-400/60 text-cream hover:border-gold/60'
                return (
                  <button key={c.key} onClick={() => toggleCell(row, c)} disabled={busy === c.key}
                    title={c.booking ? `${c.booking.customer_name} · ${c.booking.service_name}` : c.blocks.length ? 'Ocupado: tocá para liberar' : 'Libre: tocá para marcar ocupado'}
                    className={`relative h-12 rounded-lg border text-center transition-all active:scale-[0.96] ${cls} ${past ? 'opacity-45' : ''}`}>
                    {busy === c.key ? <span className="flex justify-center"><Spinner size={14} /></span> : (
                      <>
                        <span className="block text-[13px] font-bold leading-tight">{timeAR(c.a)}</span>
                        <span className="block text-[9px] font-bold uppercase tracking-wide truncate px-1 leading-tight mt-0.5 opacity-85">
                          {c.booking ? (first ? (went ? `✓ ${name}` : name) : '···') : c.blocks.length ? (c.blocks.some(x => x.barber_id == null) ? <Lock size={9} className="inline" /> : 'Ocupado') : 'Libre'}
                        </span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>

            {row.turnos > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {onAttend && (
                  <p className="text-[11px] text-cream/40 px-2.5 pb-1">Cuando el cliente vino, tocá <b className="text-emerald-500">✓ Asistió</b>: {attendHint || 'se suma a Registros y al Cierre'}.</p>
                )}
                {[...new Map(row.cells.filter(c => c.booking).map(c => [c.booking.id, c.booking])).values()].map(bk => {
                  const went = data.attended?.[bk.id]
                  return (
                    <div key={bk.id} className="flex items-center gap-2 rounded-lg hover:bg-dark-300/40 transition-colors">
                      <button onClick={() => onOpenBooking?.(bk)} className="flex-1 min-w-0 flex items-center gap-2 text-left text-xs px-2.5 py-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bk.status === 'pending' ? 'bg-amber-500' : went ? 'bg-emerald-500' : 'bg-gold'}`} />
                        <b className="text-cream">{timeAR(bk.starts_at)}</b>
                        <span className="text-cream/70 truncate flex-1">{bk.customer_name} · {bk.service_name}</span>
                        <span className="text-cream/45 shrink-0">{money(bk.price)}</span>
                      </button>
                      <div className="shrink-0 pr-1.5">
                        {bk.status === 'pending' ? (
                          <span className="badge-pending !text-[10px]">Falta confirmar pago</span>
                        ) : went ? (
                          <span className="badge-active !text-[10px]" title={went === 'venta' ? 'Ya suma en Registros y Cierre' : 'En los registros del barbero'}>
                            <Check size={10} /> Asistió · {went === 'venta' ? 'en ventas' : 'en registros'}
                          </span>
                        ) : onAttend ? (
                          <button onClick={() => attend(bk)} disabled={busy != null}
                            title={attendHint || 'Marcar que vino: se suma a Registros y Cierre'}
                            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-500/45 text-emerald-500 hover:bg-emerald-500/10 flex items-center gap-1">
                            {busy === 'att-' + bk.id ? <Spinner size={11} /> : <Check size={12} />} Asistió
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {off.length > 0 && (
        <p className="text-cream/35 text-xs px-1">No atienden este día: {off.map(r => r.barber.name).join(', ')}</p>
      )}
    </div>
  )
}
