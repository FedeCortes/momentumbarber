import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Settings, ShoppingBag,
  FileText, Moon, BarChart2, LogOut, Scissors,
  ChevronDown, Sun, MoreHorizontal
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/admin',          label: 'Dashboard',     icon: LayoutDashboard, end: true },
  { to: '/admin/sales',    label: 'Nueva venta',   icon: ShoppingBag },
  { to: '/admin/barbers',  label: 'Barberos',      icon: Users },
  { to: '/admin/drafts',   label: 'Registros',     icon: FileText },
  { to: '/admin/closing',  label: 'Cierre',        icon: Moon },
  { to: '/admin/stats',    label: 'Estadísticas',  icon: BarChart2 },
  { to: '/admin/config',   label: 'Configuración', icon: Settings },
]

function SidebarLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-gold/12 text-gold'
            : 'text-cream/55 hover:text-cream hover:bg-dark-300/60'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gold rounded-r-full" />
          )}
          <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="p-2 rounded-xl text-cream/45 hover:text-cream hover:bg-dark-300/70 transition-all"
    >
      {theme === 'dark'
        ? <Sun size={17} strokeWidth={1.8} />
        : <Moon size={17} strokeWidth={1.8} />
      }
    </button>
  )
}

export default function AdminLayout() {
  const { signOut, tenant, isAdmin, isBarber, clearBarberSession, barberSession } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  async function handleLogout() {
    clearBarberSession()
    await signOut()
    navigate('/login')
    toast.success('Sesión cerrada')
  }

  function handleSwitchProfile() {
    clearBarberSession()
    navigate('/select')
  }

  const displayName = isBarber ? barberSession?.barber?.name : (tenant?.name || 'Admin')
  const role = isBarber ? 'Barbero' : 'Administrador'
  const visibleItems = isAdmin ? navItems : navItems.filter(i => i.to === '/admin' || i.to === '/admin/sales')

  return (
    <div className="min-h-screen flex flex-col bg-dark-100">

      {/* ── Topbar ── */}
      <header className="bg-dark-200 border-b border-dark-400/40 px-4 py-3 flex items-center justify-between sticky top-0 z-30"
              style={{ boxShadow: 'var(--sh-card)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: 'rgb(var(--gold))', boxShadow: 'var(--sh-gold)' }}>
            <Scissors size={15} style={{ color: 'rgb(var(--ink))' }} />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-cream leading-tight">{tenant?.name || 'Momentum'}</p>
            <p className="text-[10px] text-cream/40 uppercase tracking-wider font-medium">{role}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1.5 text-cream/50 hover:text-cream px-3 py-2 rounded-xl hover:bg-dark-300/60 transition-all text-sm font-medium"
            >
              <span className="hidden sm:block text-xs">{displayName}</span>
              <ChevronDown size={13} className={`transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 rounded-2xl w-52 py-1.5 z-40 border border-dark-400/60"
                     style={{ background: 'rgb(var(--surface-card))', boxShadow: 'var(--sh-modal)' }}>
                  <div className="px-4 py-2.5 border-b border-dark-400/40 mb-1">
                    <p className="text-cream text-sm font-semibold truncate">{displayName}</p>
                    <p className="text-cream/40 text-xs">{role}</p>
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); handleSwitchProfile() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-cream/60 hover:text-cream hover:bg-dark-300/50 transition-colors"
                  >
                    Cambiar perfil
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); handleLogout() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400/80 hover:text-red-400 hover:bg-dark-300/50 transition-colors flex items-center gap-2"
                  >
                    <LogOut size={13} /> Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1">

        {/* ── Sidebar desktop ── */}
        <aside className="hidden md:flex flex-col w-56 bg-dark-200/40 border-r border-dark-400/30 pt-3 pb-4 gap-0.5 sticky top-[57px] h-[calc(100vh-57px)]">
          <p className="text-[10px] text-cream/30 uppercase tracking-widest px-6 pt-2 pb-2 font-bold">Menú</p>
          {visibleItems.map(item => <SidebarLink key={item.to} {...item} />)}
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 px-4 sm:px-6 py-6 pb-28 md:pb-8 max-w-2xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* ── Bottom nav mobile ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-dark-400/40 z-30 pb-[env(safe-area-inset-bottom,0px)]"
           style={{ background: 'rgb(var(--surface-card))' }}>

        {/* Bandeja "Más" */}
        {moreOpen && visibleItems.length > 5 && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
            <div className="absolute bottom-full left-0 right-0 z-40 border-t border-dark-400/40"
                 style={{ background: 'rgb(var(--surface-card))', boxShadow: 'var(--sh-modal)' }}>
              {visibleItems.slice(5).map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors border-b border-dark-400/25 last:border-0 ${
                      isActive ? 'text-gold' : 'text-cream/60 hover:text-cream'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={18} strokeWidth={isActive ? 2.2 : 1.6} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-around">
          {visibleItems.slice(0, 5).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 px-2 pt-2.5 pb-2 min-w-[3.5rem] text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  isActive ? 'text-gold' : 'text-cream/35'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gold rounded-full" />
                  )}
                  <Icon size={19} strokeWidth={isActive ? 2.2 : 1.6} />
                  <span>{label.split(' ')[0]}</span>
                </>
              )}
            </NavLink>
          ))}

          {visibleItems.length > 5 && (
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className={`relative flex flex-col items-center gap-0.5 px-2 pt-2.5 pb-2 min-w-[3.5rem] text-[10px] font-bold uppercase tracking-wide transition-colors ${
                moreOpen ? 'text-gold' : 'text-cream/35'
              }`}
            >
              {moreOpen && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gold rounded-full" />
              )}
              <MoreHorizontal size={19} strokeWidth={moreOpen ? 2.2 : 1.6} />
              <span>Más</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}
