import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Copy, Check, KeyRound, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

function PassField({ label, value, hint }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copiado')
  }

  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-2 bg-dark-300/60 border border-dark-400/60 rounded-xl px-4 py-2.5">
        <span className="flex-1 font-mono text-sm text-cream/80 tracking-wider min-w-0 truncate">
          {visible ? value : '•'.repeat(Math.min(value.length, 12))}
        </span>
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="text-cream/35 hover:text-cream/70 transition-colors shrink-0"
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button
          type="button"
          onClick={copy}
          className="text-cream/35 hover:text-gold transition-colors shrink-0"
        >
          {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
        </button>
      </div>
      {hint && <p className="text-cream/30 text-xs mt-1">{hint}</p>}
    </div>
  )
}

export default function TenantForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [loading, setLoading]           = useState(false)
  const [showPass, setShowPass]         = useState(false)
  const [showAdminNew, setShowAdminNew] = useState(false)
  const [currentLoginPass, setCurrentLoginPass]   = useState('')
  const [currentAdminPass, setCurrentAdminPass]   = useState('')
  const [form, setForm] = useState({
    name: '', slug: '', password: '', adminPassword: '', phone: '', is_active: true,
  })

  useEffect(() => { if (isEdit) loadTenant() }, [id])

  async function loadTenant() {
    const [{ data: tenant }, { data: config, error: configErr }] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', id).single(),
      supabase.from('tenant_config').select('admin_password, login_password').eq('tenant_id', id).single(),
    ])
    if (tenant) setForm({ ...tenant, password: '', adminPassword: '', slug: tenant.slug || '' })

    if (config) {
      setCurrentAdminPass(config.admin_password || '')
      setCurrentLoginPass(config.login_password || '')
    } else if (configErr) {
      // login_password column might not exist yet → fallback
      const { data: cfg2 } = await supabase
        .from('tenant_config').select('admin_password').eq('tenant_id', id).single()
      if (cfg2) setCurrentAdminPass(cfg2.admin_password || '')
    }
  }

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || !form.slug) return toast.error('Completá los campos obligatorios')
    if (!isEdit && !form.password)       return toast.error('La contraseña de acceso es obligatoria')
    if (!isEdit && !form.adminPassword)  return toast.error('La contraseña de admin es obligatoria')
    setLoading(true)

    try {
      if (isEdit) {
        const updates = [
          supabase.from('tenants')
            .update({ name: form.name, slug: form.slug, phone: form.phone, is_active: form.is_active })
            .eq('id', id),
        ]
        if (form.adminPassword) {
          updates.push(
            supabase.from('tenant_config')
              .update({ admin_password: form.adminPassword })
              .eq('tenant_id', id)
          )
        }
        await Promise.all(updates)
        toast.success('Barbería actualizada')
        navigate('/root')
        return
      }

      // ── Crear ──
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({ name: form.name, slug: form.slug, email: form.email, phone: form.phone, is_active: form.is_active })
        .select().single()
      if (tenantError) throw tenantError

      const { error: rpcError } = await supabase.rpc('create_tenant_auth_user', {
        p_email: form.email,
        p_password: form.password,
        p_tenant_id: tenant.id,
      })
      if (rpcError) {
        await supabase.from('tenants').delete().eq('id', tenant.id)
        throw rpcError
      }

      // tenant_config — crítico, debe funcionar siempre
      const { error: configError } = await supabase.from('tenant_config').insert({
        tenant_id:      tenant.id,
        admin_password: form.adminPassword,
      })
      if (configError) throw configError

      // Guardar login_password si existe la columna (requiere migración SQL)
      await supabase.from('tenant_config')
        .update({ login_password: form.password })
        .eq('tenant_id', tenant.id)
      // no chequeamos error — la columna puede no existir aún

      await supabase.from('payment_methods').insert([
        { name: 'Efectivo',       sort_order: 0, tenant_id: tenant.id },
        { name: 'Transferencia',  sort_order: 1, tenant_id: tenant.id },
      ])

      toast.success('Barbería creada')
      navigate('/root')
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('users_email_partial_key') || msg.includes('duplicate key') || msg.includes('already registered')) {
        toast.error('Ese email ya está en uso. Usá un email diferente para esta barbería.')
      } else {
        toast.error(msg || 'Error al guardar')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => navigate('/root')}
        className="flex items-center gap-2 text-cream/50 hover:text-cream text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <h1 className="section-title mb-1">{isEdit ? 'Editar barbería' : 'Nueva barbería'}</h1>
      <p className="section-sub mb-6">
        {isEdit ? 'Modificá los datos de la barbería' : 'Completá los datos para crear una nueva barbería'}
      </p>

      <div className="card max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Datos generales */}
          <div>
            <label className="label">Nombre de la barbería *</label>
            <input className="input-dark" placeholder="Ej. Barber Club" value={form.name} onChange={e => setField('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Slug / Usuario *</label>
              <input
                className="input-dark"
                placeholder="barber-club"
                value={form.slug}
                onChange={e => setField('slug', e.target.value.toLowerCase().replace(/\s/g, '-'))}
              />
              <p className="text-cream/35 text-xs mt-1">Con esto inician sesión</p>
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input-dark" placeholder="+54 9..." value={form.phone || ''} onChange={e => setField('phone', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Email de acceso *</label>
            <input
              type="email"
              className="input-dark"
              placeholder="barberia@ejemplo.com"
              value={form.email}
              onChange={e => setField('email', e.target.value)}
              disabled={isEdit}
            />
            <p className="text-cream/35 text-xs mt-1">
              {isEdit ? 'El email no se puede cambiar' : 'También pueden ingresar con el slug'}
            </p>
          </div>

          {/* ── Contraseñas en EDICIÓN: mostrar las actuales ── */}
          {isEdit && (
            <div className="bg-dark-300/30 border border-dark-400/50 rounded-2xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={14} className="text-gold/70" />
                <p className="text-cream/70 text-sm font-semibold">Contraseñas actuales</p>
              </div>

              {/* Login */}
              {currentLoginPass
                ? <PassField
                    label="Acceso al sistema (login)"
                    value={currentLoginPass}
                    hint="Con esta contraseña entran en la pantalla de inicio"
                  />
                : (
                  <div>
                    <p className="label">Acceso al sistema (login)</p>
                    <p className="text-cream/30 text-xs bg-dark-300/40 border border-dark-400/40 rounded-xl px-4 py-2.5">
                      No disponible — fue creada antes de que se guardaran las contraseñas
                    </p>
                  </div>
                )
              }

              {/* Admin */}
              {currentAdminPass
                ? <PassField
                    label="Panel administrador"
                    value={currentAdminPass}
                    hint="Con esta el dueño entra como Administrador dentro de la app"
                  />
                : (
                  <div>
                    <p className="label">Panel administrador</p>
                    <p className="text-cream/30 text-xs bg-dark-300/40 border border-dark-400/40 rounded-xl px-4 py-2.5">
                      Sin contraseña registrada
                    </p>
                  </div>
                )
              }
            </div>
          )}

          {/* ── Contraseña de acceso al sistema — solo al CREAR ── */}
          {!isEdit && (
            <div>
              <label className="label">Contraseña de acceso al sistema *</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input-dark pr-11"
                  placeholder="Con esta entran a la app"
                  value={form.password}
                  onChange={e => setField('password', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/35 hover:text-cream/70 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-cream/35 text-xs mt-1">Para hacer login con slug o email en la pantalla principal</p>
            </div>
          )}

          {/* ── Contraseña del panel admin ── */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Lock size={11} className="text-cream/40" />
              {isEdit ? 'Cambiar contraseña de admin' : 'Contraseña del panel administrador *'}
            </label>
            <div className="relative">
              <input
                type={showAdminNew ? 'text' : 'password'}
                className="input-dark pr-11"
                placeholder={isEdit ? 'Nueva contraseña (vacío = no cambiar)' : 'Ej: admin2025'}
                value={form.adminPassword}
                onChange={e => setField('adminPassword', e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowAdminNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/35 hover:text-cream/70 transition-colors"
              >
                {showAdminNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-cream/35 text-xs mt-1">
              {isEdit ? 'Con esta el dueño entra al panel administrador' : 'El dueño la usará para entrar como Administrador dentro de la app'}
            </p>
          </div>

          {/* Toggle activa */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setField('is_active', !form.is_active)}
              className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${form.is_active ? 'bg-emerald-500' : 'bg-dark-400'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-cream/65 text-sm">{form.is_active ? 'Barbería activa' : 'Barbería inactiva'}</span>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => navigate('/root')} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-gold flex-1">
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear barbería'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
