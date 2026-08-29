import { useId } from 'react'

// Isotipo de la marca: chapa oscura con poste de barbería a rayas crema / bordó.
// Autocontenido (trae su propio fondo), va en los headers y pantallas de acceso.
// `radius` va en unidades del viewBox (0–16); 8 ≈ cuadrado con esquinas redondeadas.
export default function BarberPoleMark({ size = 32, radius = 8, className = '', ...props }) {
  const uid = useId().replace(/:/g, '')
  const clip = `pm-clip-${uid}`
  const grad = `pm-grad-${uid}`
  const shine = `pm-shine-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#26221B" />
          <stop offset="1" stopColor="#141109" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="12.5" y="7.5" width="7" height="17" rx="3.5" />
        </clipPath>
      </defs>

      {/* chapa */}
      <rect width="32" height="32" rx={radius} fill={`url(#${grad})`} />
      <rect width="32" height="32" rx={radius} fill={`url(#${shine})`} />
      <rect x="0.6" y="0.6" width="30.8" height="30.8" rx={radius - 0.6}
            fill="none" stroke="#EFE7D4" strokeOpacity="0.14" />

      {/* herrajes */}
      <circle cx="16" cy="4.4" r="1.7" fill="#EFE7D4" />
      <rect x="9.5" y="5.6" width="13" height="3" rx="1.5" fill="#EFE7D4" />
      <rect x="9.5" y="23.4" width="13" height="3" rx="1.5" fill="#EFE7D4" />

      {/* cuerpo translúcido */}
      <rect x="12.5" y="7.5" width="7" height="17" rx="3.5" fill="#EFE7D4" fillOpacity="0.16" />

      {/* rayas */}
      <g clipPath={`url(#${clip})`} strokeWidth="3" strokeLinecap="butt">
        <line x1="6" y1="13" x2="24" y2="-5" stroke="#EFE7D4" />
        <line x1="6" y1="19" x2="24" y2="1" stroke="#9A3B32" />
        <line x1="6" y1="25" x2="24" y2="7" stroke="#EFE7D4" />
        <line x1="6" y1="31" x2="24" y2="13" stroke="#9A3B32" />
      </g>
    </svg>
  )
}
