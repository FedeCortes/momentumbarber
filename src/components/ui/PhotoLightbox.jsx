import { X } from 'lucide-react'

// Foto agrandada a pantalla completa, solo para verla — tocar afuera o la X cierra.
export default function PhotoLightbox({ src, onClose }) {
  if (!src) return null
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white/80 hover:text-white flex items-center justify-center"
      >
        <X size={20} />
      </button>
    </div>
  )
}
