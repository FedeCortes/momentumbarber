import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Store, Pencil, Trash2, ToggleLeft, ToggleRight, Search, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

function AdminPassCell({ tenantId, password }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!password) return <span className="text-cream/20 text-xs">Sin contraseña</span>
  function copy() {
    navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Contraseña copiada')
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-cream/50">{visible ? password : '••••••'}</span>
      <button onClick={() => setVisible(!visible)} className="text-cream/30 hover:text-cream/60 transition-colors">
        {visible ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      <button onClick={copy} className="text-cream/30 hover:text-gold transition-colors">
        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      </button>
    </span>
  )
}

export default function RootDashboard() {
  const [tenants, setTenants] = useState([])
  const [adminPassMap, setAdminPassMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: tenantsData }, { data: configs }] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('tenant_config').select('tenant_id, admin_password'),
    ])
    setTenants(tenantsData || [])
    const map = {}
    ;(configs || []).forEach(c => { map[c.tenant_id] = c.admin_password })
    setAdminPassMap(map)
    setLoading(false)
  }

  async function toggleActive(tenant) {
    const { error } = await supabase
      .from('tenants')
      .update({ is_active: !tenant.is_active })
      .eq('id', tenant.id)
    if (error) return toast.error('Error al actualizar')
    toast.success(tenant.is_active ? 'Barbería desactivada' : 'Barbería activada')
    load()
  }

  async function handleDelete() {
    const { error } = await supabase.from('tenants').delete().eq('id', deleteId)
    if (error) return toast.error('Error al eliminar')
    toast.success('Barbería eliminada')
    setDeleteId(null)
    load()
  }

  const total    = tenants.length
  const active   = tenants.filter(t => t.is_active).length
  const inactive = total - active

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Barberías</h1>
          <p className="section-sub">Gestión global del SaaS</p>
        </div>
        <Link to="/root/tenant/new" className="btn-gold flex items-center gap-2 text-sm">
          <Plus size={16} /> Nueva
        </Link>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="stat-card">
          <span className="stat-value">{total}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-emerald-400">{active}</span>
          <span className="stat-label">Activas</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-red-400">{inactive}</span>
          <span className="stat-label">Inactivas</span>
        </div>
      </div>

      {/* Buscador */}
      {tenants.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/30" />
          <input
            className="input-dark pl-9"
            placeholder="Buscar barbería..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No hay barberías todavía"
          description="Creá la primera para comenzar"
          action={
            <Link to="/root/tenant/new" className="btn-gold">
              Crear barbería
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(t => (
            <div key={t.id} className="card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0 font-display text-gold text-lg">
                {t.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-cream">{t.name}</span>
                  <span className={t.is_active ? 'badge-active' : 'badge-inactive'}>
                    {t.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="text-cream/40 text-xs truncate mb-1">{t.email} · @{t.slug}</p>
                <div className="flex items-center gap-1">
                  <span className="text-cream/30 text-xs">Panel admin:</span>
                  <AdminPassCell tenantId={t.id} password={adminPassMap[t.id]} />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleActive(t)}
                  className="btn-ghost p-2"
                  title={t.is_active ? 'Desactivar' : 'Activar'}
                >
                  {t.is_active
                    ? <ToggleRight size={20} className="text-emerald-400" />
                    : <ToggleLeft size={20} className="text-cream/40" />
                  }
                </button>
                <Link to={`/root/tenant/${t.id}/edit`} className="btn-ghost p-2">
                  <Pencil size={16} className="text-cream/60" />
                </Link>
                <button
                  onClick={() => setDeleteId(t.id)}
                  className="btn-ghost p-2 text-red-400/70 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar barbería"
        message="Esta acción eliminará la barbería y todos sus datos permanentemente. ¿Estás seguro?"
        danger
      />
    </div>
  )
}
