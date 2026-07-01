import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, Scissors, Sun, Moon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import toast from 'react-hot-toast'

export default function RootLayout() {
  const { signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login')
    toast.success('Sesión cerrada')
  }

  return (
    <div className="min-h-screen flex flex-col bg-dark-100">
      <header className="bg-dark-200 border-b border-dark-400/40 px-4 sm:px-8 py-3 flex items-center justify-between sticky top-0 z-30"
              style={{ boxShadow: 'var(--sh-card)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: 'rgb(var(--gold))' }}>
            <Scissors size={15} style={{ color: 'rgb(var(--ink))' }} />
          </div>
          <span className="font-display text-base font-semibold text-cream">Momentum</span>
          <span className="text-cream/25 text-xs hidden sm:block">ROOT</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggle}
            className="p-2 rounded-xl text-cream/40 hover:text-cream hover:bg-dark-300/60 transition-all"
          >
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
          </button>
          <NavLink
            to="/root"
            end
            className={({ isActive }) =>
              `flex items-center gap-2 text-sm px-3 py-2 rounded-xl transition-all ${isActive ? 'text-gold bg-gold/10' : 'text-cream/55 hover:text-cream hover:bg-dark-300/60'}`
            }
          >
            <LayoutDashboard size={16} strokeWidth={1.8} />
            <span className="hidden sm:block">Barberías</span>
          </NavLink>
          <button onClick={handleLogout} className="btn-ghost flex items-center gap-2 text-sm text-cream/50">
            <LogOut size={15} />
            <span className="hidden sm:block">Salir</span>
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-8 py-6 max-w-5xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
