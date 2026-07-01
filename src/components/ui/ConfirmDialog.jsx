import Modal from './Modal'

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, danger = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-cream/60 text-sm leading-relaxed mb-6">{message}</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={danger
            ? 'flex-1 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 font-semibold px-5 py-2.5 rounded-xl transition-all active:scale-[0.97] text-sm'
            : 'btn-gold flex-1'
          }
        >
          {danger ? 'Eliminar' : 'Confirmar'}
        </button>
      </div>
    </Modal>
  )
}
