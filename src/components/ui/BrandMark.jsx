import BarberPoleMark from './BarberPoleMark'

// Marca de la barbería: su logo si lo subió en Configuración, si no el poste de Momentum.
export default function BrandMark({ logoUrl, size = 32, className = '', alt = '' }) {
  if (!logoUrl) return <BarberPoleMark size={size} className={className} />
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      className={`object-cover border border-dark-400/50 bg-dark-300 ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
    />
  )
}
