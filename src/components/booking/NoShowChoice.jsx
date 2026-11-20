import { CalendarClock, Wallet } from 'lucide-react'
import Modal from '../ui/Modal'
import { money, timeAR, longDateAR } from '../../lib/booking'

// El cliente pagó y no vino: ¿se le da otro turno o la plata queda para el local?
export default function NoShowChoice({ booking, onReschedule, onKeep, onClose }) {
  return (
    <Modal open onClose={onClose} title="No vino" size="sm">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-cream/65">
          <b className="text-cream">{booking.customer_name}</b> tenía turno el {longDateAR(booking.starts_at).toLowerCase()} a las {timeAR(booking.starts_at)} y
          ya había pagado <b className="text-gold">{money(booking.price)}</b>. ¿Qué hacés?
        </p>

        <button onClick={onReschedule}
          className="w-full text-left rounded-2xl border border-gold/40 hover:border-gold hover:bg-gold/[0.06] p-4 flex gap-3 transition-colors">
          <CalendarClock size={20} className="text-gold shrink-0 mt-0.5" />
          <span>
            <span className="block text-cream font-semibold text-sm">Reprogramar</span>
            <span className="block text-cream/50 text-xs mt-0.5">Le das otro día u horario. El pago sigue valiendo para el turno nuevo.</span>
          </span>
        </button>

        <button onClick={onKeep}
          className="w-full text-left rounded-2xl border border-red-500/30 hover:border-red-500/60 hover:bg-red-500/[0.06] p-4 flex gap-3 transition-colors">
          <Wallet size={20} className="text-red-400 shrink-0 mt-0.5" />
          <span>
            <span className="block text-cream font-semibold text-sm">No vino: la plata queda para el local</span>
            <span className="block text-cream/50 text-xs mt-0.5">Suma al cierre del día como ingreso del local, sin comisión para el barbero.</span>
          </span>
        </button>

        <button onClick={onClose} className="btn-ghost">Cancelar</button>
      </div>
    </Modal>
  )
}
