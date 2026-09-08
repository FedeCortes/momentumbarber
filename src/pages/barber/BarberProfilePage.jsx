import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Clock, Save, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { uploadAvatar } from '../../lib/photo'
import Spinner from '../../components/ui/Spinner'
import toast from 'react-hot-toast'

export default function BarberProfilePage() {
  const { tenant, barberSession, setBarber } = useAuth()
  const b0 = barberSession?.barber
  const [form, setForm] = useState({ name: '', bio: '', photo_url: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!b0?.id) return
    ;(async () => {
      let { data, error } = await supabase.from('barbers').select('id, name, bio, photo_url').eq('id', b0.id).single()
      if (error) ({ data } = await supabase.from('barbers').select('id, name, photo_url').eq('id', b0.id).single())
      if (data) setForm({ name: data.name || '', bio: data.bio || '', photo_url: data.photo_url || '' })
      setLoading(false)
    })()
  }, [b0?.id])

  async function pickPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAvatar(supabase, { tenantId: tenant.id, barberId: b0.id, file })
      const { error } = await supabase.from('barbers').update({ photo_url: url }).eq('id', b0.id)
      if (error) throw error
      setForm(f => ({ ...f, photo_url: url }))
      setBarber({ ...b0, photo_url: url })
      toast.success('Foto actualizada')
    } catch (err) {
      toast.error(err.message || 'No se pudo subir la foto. ¿Corriste la migración de Storage?')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    if (!form.name.trim()) return toast.error('Poné tu nombre')
    setSaving(true)
    const patch = { name: form.name.trim(), bio: form.bio.trim() || null }
    let { error } = await supabase.from('barbers').update(patch).eq('id', b0.id)
    if (error) ({ error } = await supabase.from('barbers').update({ name: patch.name }).eq('id', b0.id))
    setSaving(false)
    if (error) return toast.error(error.message)
    setBarber({ ...b0, name: patch.name, bio: patch.bio })
    toast.success('Perfil guardado')
  }

  if (!b0) return null

  return (
    <div className="pb-6">
      <h1 className="section-title mb-1">Mi perfil</h1>
      <p className="section-sub mb-5">Así te ven tus clientes al reservar</p>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={22} /></div>
      ) : (
        <div className="card flex flex-col gap-5">
          {/* Foto */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-dark-300 border border-dark-400 overflow-hidden flex items-center justify-center shrink-0">
              {form.photo_url
                ? <img src={form.photo_url} alt="" className="w-full h-full object-cover" />
                : <User size={28} className="text-cream/30" />}
            </div>
            <div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-outline-gold flex items-center gap-2 text-sm"
              >
                {uploading ? <><Spinner size={14} /> Subiendo...</> : <><Camera size={15} /> {form.photo_url ? 'Cambiar foto' : 'Subir foto'}</>}
              </button>
              <p className="text-cream/30 text-xs mt-1.5">JPG o PNG. Se recorta cuadrada.</p>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            </div>
          </div>

          <div>
            <label className="label">Nombre</label>
            <input className="input-dark" value={form.name}
                   onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <p className="text-cream/30 text-xs mt-1">Es el nombre que se ve en toda la app (ventas, cierre, reservas).</p>
          </div>

          <div>
            <label className="label">Descripción (opcional)</label>
            <textarea className="input-dark min-h-[4.5rem]" placeholder="Ej: Especialista en fades y barba. 8 años de experiencia."
                      value={form.bio}
                      onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
          </div>

          <button onClick={save} disabled={saving} className="btn-gold flex items-center justify-center gap-2">
            <Save size={15} /> {saving ? 'Guardando...' : 'Guardar perfil'}
          </button>

          <Link to="/barber/horarios"
                className="flex items-center justify-between rounded-xl border border-dark-400/60 bg-dark-300/25 px-4 py-3 hover:border-gold/40 transition-colors">
            <span className="flex items-center gap-2.5 text-cream/80 text-sm">
              <Clock size={16} className="text-cream/40" /> Mis horarios de atención
            </span>
            <span className="text-gold/70 text-xs">Configurar →</span>
          </Link>
        </div>
      )}
    </div>
  )
}
