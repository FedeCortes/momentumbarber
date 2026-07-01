import { useEffect, useState } from 'react'
import { Plus, Pencil, UserX, UserCheck, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

function BarberForm({ barber, onSave, onClose }) {
  const { tenant } = useAuth()
  const [form, setForm] = useState({
    name: barber?.name || '',
    commission_pct: barber?.commission_pct || 50,
    password_hash: '',
    is_active: barber?.is_active ?? true,
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!form.name) return toast.error('El nombre es obligatorio')
    if (form.commission_pct < 0 || form.commission_pct > 100) return toast.error('El porcentaje debe estar entre 0 y 100')
    setLoading(true)
    try {
      const payload = {
        name: form.name,
        commission_pct: Number(form.commission_pct),
        is_active: form.is_active,
        tenant_id: tenant.id,
        ...(form.password_hash ? { password_hash: form.password_hash } : {}),
      }
      if (barber) {
        const { error } = await supabase.from('barbers').update(payload).eq('id', barber.id)
        if (error) throw error
        toast.success('Barbero actualizado')
      } else {
        const { error } = await supabase.from('barbers').insert(payload)
        if (error) throw error
        toast.success('Barbero creado')
      }
      onSave()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="label">Nombre completo *</label>
        <input className="input-dark" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Juan García" />
      </div>
      <div>
        <label className="label">% de comisión en servicios</label>
        <div className="flex items-center gap-3">
          <input
            type="range" min="0" max="100" step="5"
            value={form.commission_pct}
            onChange={e => setForm(f => ({ ...f, commission_pct: e.target.value }))}
            className="flex-1 accent-gold"
          />
          <span className="text-gold font-display text-xl w-14 text-right">{form.commission_pct}%</span>
        </div>
        <p className="text-cream/30 text-xs mt-1">Propinas: 100% barbero · Vitrina y bebidas: 100% local</p>
      </div>
      <div>
        <label className="label">Contraseña (opcional)</label>
        <input
          type="password" className="input-dark"
          placeholder={barber ? 'Dejar vacío para no cambiar' : 'Sin contraseña = sin pin'}
          value={form.password_hash}
          onChange={e => setForm(f => ({ ...f, password_hash: e.target.value }))}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
          className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${form.is_active ? 'bg-emerald-500' : 'bg-dark-400'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : ''}`} />
        </button>
        <span className="text-cream/70 text-sm">{form.is_active ? 'Barbero activo' : 'Barbero inactivo'}</span>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
        <button onClick={handleSave} disabled={loading} className="btn-gold flex-1">
          {loading ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function BarbersPage() {
  const { tenant } = useAuth()
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => { if (tenant?.id) load() }, [tenant?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('barbers').select('*').eq('tenant_id', tenant.id).order('name')
    setBarbers(data || [])
    setLoading(false)
  }

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(b) { setEditing(b); setModalOpen(true) }

  async function handleToggle(b) {
    await supabase.from('barbers').update({ is_active: !b.is_active }).eq('id', b.id)
    toast.success(b.is_active ? 'Barbero desactivado' : 'Barbero activado')
    load()
  }

  async function handleDelete() {
    await supabase.from('barbers').delete().eq('id', deleteId)
    toast.success('Barbero eliminado')
    setDeleteId(null)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Barberos</h1>
          <p className="section-sub">{barbers.filter(b => b.is_active).length} activos</p>
        </div>
        <button onClick={openNew} className="btn-gold flex items-center gap-2 text-sm">
          <Plus size={16} /> Nuevo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : barbers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Todavía no hay barberos"
          description="Creá el primero para comenzar"
          action={<button onClick={openNew} className="btn-gold">Crear barbero</button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {barbers.map(b => (
            <div key={b.id} className={`card flex items-center gap-4 ${!b.is_active ? 'opacity-50' : ''}`}>
              <div className="w-11 h-11 rounded-2xl bg-gold/12 border border-gold/20 flex items-center justify-center font-display text-gold text-lg shrink-0">
                {b.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-cream text-sm">{b.name}</span>
                  {!b.is_active && <span className="badge-inactive">Inactivo</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-cream/35 text-xs">Comisión:</span>
                  <span className="text-gold text-xs font-medium">{b.commission_pct}%</span>
                  {b.password_hash && <span className="text-cream/25 text-xs">· con pin</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleToggle(b)} className="btn-ghost p-2" title={b.is_active ? 'Desactivar' : 'Activar'}>
                  {b.is_active ? <UserX size={15} className="text-cream/40" /> : <UserCheck size={15} className="text-emerald-400" />}
                </button>
                <button onClick={() => openEdit(b)} className="btn-ghost p-2">
                  <Pencil size={15} className="text-cream/50" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar barbero' : 'Nuevo barbero'}>
        <BarberForm
          barber={editing}
          onSave={() => { setModalOpen(false); load() }}
          onClose={() => setModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar barbero"
        message="¿Eliminás este barbero? Se perderán sus datos asociados."
        danger
      />
    </div>
  )
}
