import { format, subDays, differenceInDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar } from 'lucide-react'

const TODAY     = format(new Date(), 'yyyy-MM-dd')
const YESTERDAY = format(subDays(new Date(), 1), 'yyyy-MM-dd')
const WEEK_AGO  = format(subDays(new Date(), 6), 'yyyy-MM-dd')

const SHORTCUTS = [
  { label: 'Hoy',     from: TODAY,     to: TODAY },
  { label: 'Ayer',    from: YESTERDAY, to: YESTERDAY },
  { label: '7 días',  from: WEEK_AGO,  to: TODAY },
]

export function dateRangeLabel(from, to) {
  const isSingle = from === to
  if (isSingle) {
    return format(parseISO(from + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })
  }
  const diff = differenceInDays(parseISO(to + 'T12:00:00'), parseISO(from + 'T12:00:00')) + 1
  const fmtFrom = format(parseISO(from + 'T12:00:00'), "d MMM", { locale: es })
  const fmtTo   = format(parseISO(to   + 'T12:00:00'), "d MMM", { locale: es })
  return `${fmtFrom} → ${fmtTo} · ${diff} días`
}

export default function DateRangePicker({ from, to, onChange, max = TODAY }) {
  const isSingle = from === to

  function setFrom(val) {
    // Si from queda después de to, ajustar to también
    onChange(val, val > to ? val : to)
  }

  function setTo(val) {
    // Si to queda antes de from, ajustar from también
    onChange(val < from ? val : from, val)
  }

  function applyShortcut(s) {
    onChange(s.from, s.to)
  }

  const isShortcut = (s) => s.from === from && s.to === to

  return (
    <div className="flex flex-col gap-2">
      {/* Chips rápidos */}
      <div className="flex gap-1.5 flex-wrap">
        {SHORTCUTS.map(s => (
          <button
            key={s.label}
            onClick={() => applyShortcut(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              isShortcut(s) ? 'bg-gold text-dark' : 'bg-dark-300 text-cream/60 hover:bg-dark-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Inputs desde / hasta */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-dark-300 border border-dark-400 rounded-lg px-3 py-2 flex-1">
          <Calendar size={13} className="text-cream/30 shrink-0" />
          <input
            type="date"
            value={from}
            max={max}
            onChange={e => setFrom(e.target.value)}
            className="bg-transparent text-cream/80 text-xs w-full outline-none"
          />
        </div>

        {/* Indicador de rango vs día único */}
        <span className={`text-xs shrink-0 font-medium ${isSingle ? 'text-cream/20' : 'text-gold'}`}>→</span>

        <div className={`flex items-center gap-1.5 bg-dark-300 border rounded-lg px-3 py-2 flex-1 ${isSingle ? 'border-dark-400' : 'border-gold/40'}`}>
          <Calendar size={13} className={`shrink-0 ${isSingle ? 'text-cream/30' : 'text-gold/60'}`} />
          <input
            type="date"
            value={to}
            min={from}
            max={max}
            onChange={e => setTo(e.target.value)}
            className="bg-transparent text-cream/80 text-xs w-full outline-none"
          />
        </div>
      </div>

      {/* Resumen visual */}
      {!isSingle && (
        <p className="text-gold/70 text-xs font-medium">
          {differenceInDays(parseISO(to + 'T12:00:00'), parseISO(from + 'T12:00:00')) + 1} días seleccionados
        </p>
      )}
    </div>
  )
}
