export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-dark-300/80 border border-dark-400/60 flex items-center justify-center mb-4">
          <Icon size={26} className="text-cream/20" />
        </div>
      )}
      <p className="font-display text-lg text-cream/40 mb-1">{title}</p>
      {description && <p className="text-cream/25 text-sm mb-6 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}
