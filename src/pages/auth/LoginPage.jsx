import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scissors, Eye, EyeOff, Sun, Moon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { signIn } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.identifier || !form.password) return toast.error('Completá todos los campos')
    setLoading(true)

    try {
      let email = form.identifier.trim()

      // Si no tiene @ es un slug → buscar el email via RPC (bypasa RLS)
      if (!email.includes('@')) {
        const { data: tenantEmail, error } = await supabase
          .rpc('get_tenant_email_by_slug', { p_slug: email.toLowerCase() })

        if (error || !tenantEmail) {
          toast.error('Usuario no encontrado')
          return
        }
        email = tenantEmail
      }

      await signIn(email, form.password)
      navigate('/select')
    } catch (err) {
      toast.error('Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-100 px-4 relative">
      <button
        onClick={toggle}
        className="absolute top-4 right-4 p-2 rounded-xl text-cream/35 hover:text-cream hover:bg-dark-300/60 transition-all"
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      >
        {theme === 'dark' ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
      </button>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gold/12 border border-gold/25 flex items-center justify-center mb-5 shadow-gold-md">
            <Scissors size={26} className="text-gold" />
          </div>
          <h1 className="font-display text-4xl text-cream tracking-tight">Momentum</h1>
          <p className="text-[11px] text-gold/60 uppercase tracking-widest font-semibold mt-1.5">Barber Management</p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="font-display text-xl text-cream mb-6">Iniciar sesión</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="label">Usuario o email</label>
              <input
                type="text"
                className="input-dark"
                placeholder="mi-barberia  o  email@ejemplo.com"
                value={form.identifier}
                onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                autoComplete="username"
                autoCapitalize="none"
              />
              <p className="text-cream/30 text-xs mt-1">
                Podés ingresar con tu usuario (slug) o con tu email
              </p>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input-dark pr-11"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/40 hover:text-cream/70 transition-colors"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-gold w-full mt-2">
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="text-center text-cream/20 text-xs mt-6">Momentum Barber © 2025</p>
      </div>
    </div>
  )
}
