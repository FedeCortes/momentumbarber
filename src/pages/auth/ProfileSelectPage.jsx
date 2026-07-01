import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Scissors, Eye, EyeOff, ChevronLeft, Lock, Sun, Moon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function ProfileSelectPage() {
  const { tenant, profile, setBarber, signOut, clearBarberSession } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [mode, setMode] = useState(null)
  const [adminPass, setAdminPass] = useState('')
  const [showAdminPass, setShowAdminPass] = useState(false)
  const [barbers, setBarbers] = useState([])
  const [selectedBarber, setSelectedBarber] = useState(null)
  const [barberPass, setBarberPass] = useState('')
  const [showBarberPass, setShowBarberPass] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tenant?.id) return
    supabase.from('barbers').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('name')
      .then(({ data }) => setBarbers(data || []))
  }, [tenant?.id])

  async function handleAdminLogin() {
    if (!adminPass) return toast.error('Ingresá la contraseña de admin')
    setLoading(true)
    try {
      const { data: cfg } = await supabase.from('tenant_config').select('admin_password').eq('tenant_id', tenant.id).single()
      if (!cfg || cfg.admin_password !== adminPass) { toast.error('Contraseña incorrecta'); return }
      clearBarberSession()
      navigate('/admin')
    } finally {
      setLoading(false)
    }
  }

  async function handleBarberLogin() {
    if (!selectedBarber) return toast.error('Seleccioná tu nombre')
    setLoading(true)
    try {
      if (selectedBarber.password_hash) {
        if (!barberPass) { toast.error('Este barbero tiene contraseña'); return }
        if (selectedBarber.password_hash !== barberPass) { toast.error('Contraseña incorrecta'); return }
      }
      setBarber(selectedBarber)
      navigate('/barber')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  if (profile?.role !== 'admin') {
    navigate('/root')
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-100 px-4 py-8 relative">
      <button
        onClick={toggle}
        className="absolute top-4 right-4 p-2 rounded-xl text-cream/35 hover:text-cream hover:bg-dark-300/60 transition-all"
      >
        {theme === 'dark' ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
      </button>
      <div className="w-full max-w-sm">

        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gold/15 border border-gold/25 flex items-center justify-center mb-4">
            <Scissors size={24} className="text-gold" />
          </div>
          <h1 className="font-display text-2xl text-cream">{tenant?.name}</h1>
          <p className="text-cream/35 text-sm mt-0.5">¿Con qué perfil ingresás?</p>
        </div>

        {/* Selección de perfil */}
        {!mode && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode('admin')}
              className="group card-hover flex items-center gap-4 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-gold/12 border border-gold/20 flex items-center justify-center shrink-0 group-hover:bg-gold/20 transition-colors">
                <Shield size={20} className="text-gold" />
              </div>
              <div className="flex-1">
                <p className="text-cream font-medium">Administrador</p>
                <p className="text-cream/35 text-xs mt-0.5">Gestión completa de la barbería</p>
              </div>
              <ChevronLeft size={16} className="text-cream/20 rotate-180 group-hover:text-gold/50 transition-colors" />
            </button>

            <button
              onClick={() => setMode('barber')}
              className="group card-hover flex items-center gap-4 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-dark-300 border border-dark-400 flex items-center justify-center shrink-0 group-hover:border-cream/20 transition-colors">
                <Scissors size={20} className="text-cream/50 group-hover:text-cream/80 transition-colors" />
              </div>
              <div className="flex-1">
                <p className="text-cream font-medium">Barbero</p>
                <p className="text-cream/35 text-xs mt-0.5">Registrar trabajo del día</p>
              </div>
              <ChevronLeft size={16} className="text-cream/20 rotate-180 group-hover:text-cream/40 transition-colors" />
            </button>

            <button onClick={handleLogout} className="text-cream/25 text-xs text-center mt-3 hover:text-cream/50 transition-colors py-2">
              Cerrar sesión
            </button>
          </div>
        )}

        {/* Panel Admin */}
        {mode === 'admin' && (
          <div className="card">
            <button onClick={() => setMode(null)} className="flex items-center gap-1.5 text-cream/35 hover:text-cream/70 text-xs mb-5 transition-colors">
              <ChevronLeft size={14} /> Volver
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gold/12 border border-gold/20 flex items-center justify-center">
                <Shield size={16} className="text-gold" />
              </div>
              <div>
                <p className="text-cream font-medium text-sm">Administrador</p>
                <p className="text-cream/35 text-xs">Verificá tu identidad</p>
              </div>
            </div>

            <label className="label">Contraseña de administrador</label>
            <div className="relative mb-4">
              <input
                type={showAdminPass ? 'text' : 'password'}
                className="input-dark pr-11"
                placeholder="••••••••"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowAdminPass(!showAdminPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/30 hover:text-cream/60 transition-colors"
              >
                {showAdminPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button onClick={handleAdminLogin} disabled={loading} className="btn-gold w-full">
              {loading ? 'Verificando...' : 'Ingresar como admin'}
            </button>
          </div>
        )}

        {/* Panel Barbero */}
        {mode === 'barber' && (
          <div className="card">
            <button onClick={() => { setMode(null); setSelectedBarber(null) }} className="flex items-center gap-1.5 text-cream/35 hover:text-cream/70 text-xs mb-5 transition-colors">
              <ChevronLeft size={14} /> Volver
            </button>

            <p className="label mb-3">Seleccioná tu nombre</p>

            {barbers.length === 0 ? (
              <p className="text-cream/35 text-sm text-center py-6">
                No hay barberos activos. Pedile al admin que te agregue.
              </p>
            ) : (
              <div className="flex flex-col gap-2 mb-4 max-h-56 overflow-y-auto -mx-1 px-1">
                {barbers.map(b => (
                  <button
                    key={b.id}
                    onClick={() => { setSelectedBarber(b); setBarberPass('') }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                      selectedBarber?.id === b.id
                        ? 'border-gold/50 bg-gold/8 shadow-gold'
                        : 'border-dark-400 hover:border-dark-500 bg-dark-300/30'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-display text-base shrink-0 ${
                      selectedBarber?.id === b.id ? 'bg-gold text-dark' : 'bg-dark-400 text-cream/60'
                    }`}>
                      {b.name[0].toUpperCase()}
                    </div>
                    <span className={`font-medium text-sm flex-1 ${selectedBarber?.id === b.id ? 'text-cream' : 'text-cream/70'}`}>
                      {b.name}
                    </span>
                    {b.password_hash && <Lock size={13} className="text-cream/25 shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {selectedBarber?.password_hash && (
              <div className="relative mb-4">
                <label className="label">Contraseña</label>
                <input
                  type={showBarberPass ? 'text' : 'password'}
                  className="input-dark pr-11"
                  placeholder="••••••••"
                  value={barberPass}
                  onChange={e => setBarberPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBarberLogin()}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowBarberPass(!showBarberPass)}
                  className="absolute right-3 bottom-2.5 text-cream/30 hover:text-cream/60 transition-colors"
                >
                  {showBarberPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            <button
              onClick={handleBarberLogin}
              disabled={loading || !selectedBarber}
              className="btn-gold w-full"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </div>
        )}

        <p className="text-center text-cream/15 text-xs mt-6">
          ¿No sos vos?{' '}
          <button onClick={handleLogout} className="underline hover:text-cream/35 transition-colors">
            Cambiar cuenta
          </button>
        </p>
      </div>
    </div>
  )
}
