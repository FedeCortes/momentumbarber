import { useEffect, useRef, useState } from 'react'
import { Search, UserPlus, X, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import StarMeter from './StarMeter'
import { customerSearch, customerUpsert, normPhone } from '../../lib/booking'
import toast from 'react-hot-toast'

// Selector de cliente para la venta / el registro. Opcional.
//   value: objeto customer | null
//   onChange(customer | null)
//   loyalty: { enabled, min }  → muestra estrellas y botón canjear
export default function CustomerPicker({ tenantId, value, onChange, loyalty }) {
  const [open, setOpen] = useState(false)

  async function refreshValue() {
    if (!value) return
    const { data } = await supabase.from('customers').select('*').eq('id', value.id).maybeSingle()
    if (data) onChange(data)
  }

  if (value) {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold/8 p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/25 flex items-center justify-center font-display text-gold text-sm shrink-0">
            {(value.name || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-cream text-sm font-medium truncate">{value.name || 'Sin nombre'}</p>
            <p className="text-cream/45 text-xs truncate">{value.phone || value.phone_key}</p>
          </div>
          <button onClick={() => onChange(null)} className="text-cream/35 hover:text-cream shrink-0 p-1" title="Quitar">
            <X size={15} />
          </button>
        </div>
        {loyalty?.enabled && (
          <div className="mt-2.5 pt-2.5 border-t border-gold/15">
            <StarMeter customer={value} min={loyalty.min} onRedeemed={refreshValue} />
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-dark-400 text-cream/50 hover:text-cream hover:border-gold/50 text-sm py-2.5 flex items-center justify-center gap-2 transition-colors"
      >
        <UserPlus size={15} /> Agregar cliente
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cliente">
        <PickerBody
          tenantId={tenantId}
          onPick={c => { onChange(c); setOpen(false) }}
        />
      </Modal>
    </>
  )
}

function PickerBody({ tenantId, onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('search')  // search | new
  const [form, setForm] = useState({ name: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const t = useRef(null)

  useEffect(() => {
    if (mode !== 'search') return
    setLoading(true)
    clearTimeout(t.current)
    t.current = setTimeout(async () => {
      setResults(await customerSearch(supabase, tenantId, q))
      setLoading(false)
    }, 250)
    return () => clearTimeout(t.current)
  }, [q, tenantId, mode])

  async function createNew() {
    if (!form.name.trim() || !normPhone(form.phone)) return toast.error('Nombre y teléfono válido')
    setSaving(true)
    const id = await customerUpsert(supabase, { tenantId, phone: form.phone, name: form.name })
    if (!id) { setSaving(false); return toast.error('No se pudo crear. ¿Corriste la migración de clientes?') }
    await supabase.from('customers').update({ name: form.name.trim(), updated_at: new Date().toISOString() }).eq('id', id)
    const { data } = await supabase.from('customers').select('*').eq('id', id).maybeSingle()
    setSaving(false)
    onPick(data || { id, name: form.name.trim(), phone: form.phone })
  }

  if (mode === 'new') {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <label className="label">Nombre *</label>
          <input className="input-dark" autoFocus value={form.name}
                 onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Teléfono *</label>
          <input className="input-dark" inputMode="tel" value={form.phone}
                 onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="flex gap-3">
          <button onClick={() => setMode('search')} className="btn-ghost flex-1">Volver</button>
          <button onClick={createNew} disabled={saving} className="btn-gold flex-1">{saving ? 'Creando...' : 'Crear y usar'}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream/35" />
        <input className="input-dark pl-10" autoFocus placeholder="Buscar por nombre o teléfono..."
               value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <button onClick={() => setMode('new')}
        className="flex items-center gap-2 text-gold/80 hover:text-gold text-sm py-1">
        <UserPlus size={15} /> Nuevo cliente
      </button>

      {loading ? (
        <div className="flex justify-center py-6"><Spinner size={18} /></div>
      ) : results.length === 0 ? (
        <p className="text-cream/30 text-sm text-center py-6">
          {q ? 'Nadie coincide.' : 'Escribí para buscar, o creá uno nuevo.'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-dark-300 max-h-72 overflow-y-auto">
          {results.map(c => (
            <button key={c.id} onClick={() => onPick(c)}
              className="flex items-center gap-3 py-2.5 text-left hover:bg-dark-300/30 -mx-1 px-1 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-dark-300 border border-dark-400 flex items-center justify-center text-cream/60 shrink-0">
                <User size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-cream text-sm truncate">{c.name || 'Sin nombre'}</p>
                <p className="text-cream/40 text-xs truncate">{c.phone || c.phone_key}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
