import { Outlet, useNavigate, NavLink } from 'react-router-dom'
import { Scissors, LogOut, PlusCircle, ClipboardList, Sun, Moon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import toast from 'react-hot-toast'

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-cream/40 hover:text-cream hover:bg-dark-300/60 transition-all"
    >
      {theme === 'dark'
        ? <Sun size={17} strokeWidth={1.8} />
        : <Moon size={17} strokeWidth={1.8} />
      }
    </button>
  )
}

export default function BarberLayout() {
  const { clearBarberSession, signOut, barberSession, tenant } = useAuth()
  const navigate = useNavigate()

  function handleSwitch() {
    clearBarberSession()
    navigate('/select')
  }

  async function handleLogout() {
    clearBarberSession()
    await signOut()
    navigate('/login')
    toast.success('Sesión cerrada')
  }

  const barberName = barberSession?.barber?.name || ''
  const firstName  = barberName.split(' ')[0]

  return (
    <div className="min-h-screen flex flex-col bg-dark-100">

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between"
        style={{
          background: 'rgb(var(--surface-card))',
          borderBottom: '1px solid rgb(var(--surface-border) / 0.35)',
          boxShadow: 'var(--sh-card)',
        }}
      >
        {/* Logo + nombre */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgb(var(--gold))', boxShadow: 'var(--sh-gold)' }}
          >
            <Scissors size={16} style={{ color: 'rgb(var(--ink))' }} strokeWidth={2} />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-cream leading-tight">
              {tenant?.name || 'Momentum'}
            </p>
            <p className="text-[10px] text-gold/60 uppercase tracking-wider font-bold">
              {firstName}
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <button
            onClick={handleSwitch}
            className="h-9 px-3 rounded-xl text-cream/40 hover:text-cream/75 text-xs font-semibold hover:bg-dark-300/60 transition-all"
          >
            Cambiar
          </button>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-red-400/40 hover:text-red-400 hover:bg-red-500/8 transition-all"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Contenido ── */}
      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full pb-32">
        <Outlet />
      </main>

      {/* ── Bottom nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30"
        style={{
          background: 'rgb(var(--surface-card))',
          borderTop: '1px solid rgb(var(--surface-border) / 0.35)',
        }}
      >
        <div className="flex max-w-lg mx-auto">
          {[
            { to: '/barber',         end: true,  icon: PlusCircle,    label: 'Registrar' },
            { to: '/barber/history', end: false, icon: ClipboardList, label: 'Mis registros' },
          ].map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex-1 flex flex-col items-center gap-1 pt-3 pb-3 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  isActive ? 'text-gold' : 'text-cream/30 hover:text-cream/55'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-gold rounded-full" />
                  )}
                  <Icon size={21} strokeWidth={isActive ? 2.2 : 1.6} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
