// Cinta fija en la esquina que avisa que NO es producción.
// Solo aparece si el sitio de Netlify tiene la variable VITE_ENV = dev.
export default function EnvRibbon() {
  const env = import.meta.env.VITE_ENV
  if (env !== 'dev' && env !== 'staging') return null
  const label = env === 'staging' ? 'STAGING' : 'DESARROLLO'
  return (
    <div
      className="fixed bottom-0 left-0 z-[100] pointer-events-none select-none"
      aria-hidden="true"
      style={{ transform: 'translate(-34%, 34%) rotate(45deg)' }}
    >
      <div className="bg-red-500 text-white text-[10px] font-bold tracking-widest uppercase px-12 py-1 shadow-lg">
        {label}
      </div>
    </div>
  )
}
