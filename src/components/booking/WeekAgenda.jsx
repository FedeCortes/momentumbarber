import { useMemo } from 'react'
import { fmtTime, toDateKey, addDays } from '../../lib/booking'

// Vista semanal tipo calendario: columnas = días, filas = horas, cada turno una cajita.
// `appointments` ya viene filtrado. `onSelect(appt)` al tocar una cajita.

const HOUR_PX = 58
const DEFAULT_START = 9
const DEFAULT_END = 21

const BOX = {
  confirmed: 'bg-gold/20 border-gold/70 text-cream',
  pending:   'bg-amber-400/25 border-amber-400/70 text-cream',
  completed: 'bg-emerald-400/25 border-emerald-400/70 text-cream',
  cancelled: 'bg-dark-300 border-dark-400 text-cream/40 line-through',
  no_show:   'bg-dark-300 border-dark-400 text-cream/40 line-through',
}

const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Asigna carriles a los turnos que se pisan dentro de un día
function withLanes(list) {
  const sorted = [...list].sort((a, b) => a._s - b._s || a._e - b._e)
  const laneEnds = []
  for (const a of sorted) {
    let lane = laneEnds.findIndex(end => end <= a._s)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(a._e) }
    else laneEnds[lane] = a._e
    a._lane = lane
  }
  return { items: sorted, lanes: Math.max(1, laneEnds.length) }
}

export default function WeekAgenda({ appointments, weekStart, onSelect, barberName, showBarber = false }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const { startHour, endHour, byDay } = useMemo(() => {
    let lo = DEFAULT_START, hi = DEFAULT_END
    const map = {}
    for (const a of appointments) {
      const s = new Date(a.starts_at), e = new Date(a.ends_at)
      lo = Math.min(lo, s.getHours())
      hi = Math.max(hi, e.getHours() + (e.getMinutes() > 0 ? 1 : 0))
      const k = toDateKey(s)
      ;(map[k] ||= []).push({ ...a, _s: s.getTime(), _e: e.getTime() })
    }
    return { startHour: Math.max(0, lo), endHour: Math.min(24, Math.max(hi, lo + 1)), byDay: map }
  }, [appointments])

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const totalPx = hours.length * HOUR_PX
  const todayKey = toDateKey(new Date())

  return (
    <div className="rounded-2xl border border-dark-400/50 overflow-hidden bg-dark-200" style={{ boxShadow: 'var(--sh-card)' }}>
      <div className="overflow-auto max-h-[72vh]">
        <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: '2.75rem repeat(7, minmax(6rem, 1fr))' }}>
          {/* Encabezado */}
          <div className="sticky top-0 left-0 z-30 bg-dark-200 border-b border-r border-dark-400/50" />
          {days.map(d => {
            const k = toDateKey(d)
            const today = k === todayKey
            return (
              <div key={k}
                className={`sticky top-0 z-20 bg-dark-200 border-b border-dark-400/50 text-center py-1.5 ${today ? 'text-gold' : 'text-cream/55'}`}>
                <p className="text-[10px] uppercase tracking-wide">{WD[d.getDay()]}</p>
                <p className={`text-sm font-display font-bold leading-none mt-0.5 ${today ? '' : 'text-cream/80'}`}>{d.getDate()}</p>
              </div>
            )
          })}

          {/* Gutter de horas */}
          <div className="sticky left-0 z-20 bg-dark-200 border-r border-dark-400/50" style={{ height: totalPx }}>
            {hours.map((h, i) => (
              <div key={h} className={`text-[10px] text-cream/35 text-right pr-1.5 ${i === 0 ? 'pt-0.5' : '-translate-y-1.5'}`} style={{ height: HOUR_PX }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Columnas de días */}
          {days.map(d => {
            const k = toDateKey(d)
            const { items, lanes } = withLanes(byDay[k] || [])
            return (
              <div key={k} className={`relative border-r border-dark-400/25 ${k === todayKey ? 'bg-gold/[0.03]' : ''}`} style={{ height: totalPx }}>
                {hours.map((h, i) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-dark-400/20" style={{ top: i * HOUR_PX }} />
                ))}
                {items.map(a => {
                  const s = new Date(a.starts_at)
                  const startMin = (s.getHours() - startHour) * 60 + s.getMinutes()
                  const durMin = Math.max(22, (a._e - a._s) / 60000)
                  const top = Math.max(0, startMin * HOUR_PX / 60)
                  const height = Math.min(totalPx - top, durMin * HOUR_PX / 60) - 2
                  const w = 100 / lanes
                  return (
                    <button key={a.id} onClick={() => onSelect?.(a)}
                      className={`absolute rounded-md border px-1 py-0.5 text-left overflow-hidden transition-transform active:scale-[0.98] ${BOX[a.status] || BOX.confirmed}`}
                      style={{ top, height, left: `calc(${a._lane * w}% + 2px)`, width: `calc(${w}% - 4px)` }}>
                      <p className="text-[10px] font-semibold leading-tight truncate">{fmtTime(a.starts_at)} {a.customer_name?.split(' ')[0]}</p>
                      <p className="text-[9px] leading-tight truncate opacity-80">
                        {a.service_name}{showBarber && barberName?.[a.barber_id] ? ` · ${barberName[a.barber_id]}` : ''}
                      </p>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
