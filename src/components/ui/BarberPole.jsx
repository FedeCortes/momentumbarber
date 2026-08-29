import { useId } from 'react'

// Barber-pole glyph. Monocromo: hereda el color del contenedor con currentColor
// (cuerpo translúcido + franjas y herrajes llenos), así se lee como poste de barbería
// tanto en el chip dorado como sobre fondo oscuro.
// eslint-disable-next-line no-unused-vars -- strokeWidth se acepta y se ignora (ícono lleno, no de trazo)
export default function BarberPole({ size = 18, strokeWidth, className = '', ...props }) {
  const raw = useId().replace(/:/g, '')
  const clip = `bp-${raw}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="8" y="5.5" width="8" height="13" rx="4" />
        </clipPath>
      </defs>

      {/* herrajes: perilla, tapa superior e inferior */}
      <circle cx="12" cy="2.6" r="1.5" />
      <rect x="6.5" y="3.6" width="11" height="2.6" rx="1.3" />
      <rect x="6.5" y="17.8" width="11" height="2.6" rx="1.3" />

      {/* cuerpo translúcido */}
      <rect x="8" y="5.5" width="8" height="13" rx="4" opacity="0.28" />

      {/* franjas en diagonal */}
      <g clipPath={`url(#${clip})`}>
        <path d="M2 12 L9 4 L12.4 4 L5.4 12 Z" />
        <path d="M4 18 L15 5.5 L18.4 5.5 L7.4 18 Z" />
        <path d="M9.6 20 L18 10.5 L21 10.5 L12.6 20 Z" />
      </g>
    </svg>
  )
}
