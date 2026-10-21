import { useEffect, useRef, useState } from 'react'
import { Search, UserPlus, X, User } from 'lucide-react'
import Modal from './Modal'
import Spinner from './Spinner'
import { searchCustomers, createCustomer } from '../../lib/customers'
import toast from 'react-hot-toast'

// Selector de cliente para la venta. Es opcional: sin cliente la venta se
// guarda igual que siempre.
//   value: cliente elegido | null
//   onChange(cliente | null)
export default function CustomerPicker({ tenantId, value, onChange }) {
  const [open, setOpen] = useState(false)

  if (value) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-gold/40 bg-gold/8 p-3">
        <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/25 flex items-center justify-center font-display text-gold text-sm shrink-0">
          {(value.name || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-cream text-sm font-medium truncate">{value.name || 'Sin nombre'}</p>
          <p className="text-cream/45 text-xs truncate">
            {value.phone || 'Sin celular'}
            {value._isNew && !value.existing_before && <span className="ml-2 text-emerald-400">· cliente nuevo</span>}
            {value.existing_before && <span className="ml-2 text-cream/40">· de antes</span>}
          </p>
        </div>
        <button onClick={() => onChange(null)} className="text-cream/35 hover:text-cream shrink-0 p-1" title="Quitar cliente">
          <X size={15} />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-dark-400 text-cream/50 hover:text-cream hover:border-gold/50 text-sm py-2.5 flex items-center justify-center gap-2 transition-colors"
      >
        <UserPlus size={15} /> Agregar cliente
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cliente">
        <PickerBody tenantId={tenantId} onPick={c => { onChange(c); setOpen(false) }} />
      </Modal>
    </>
  )
}

export function CustomerForm({ initial, onSubmit, onCancel, submitLabel = 'Guardar', saving }) {
  // existing_before: null = sin elegir (al crear hay que elegir) · true = ya venía · false = nuevo
  const [form, setForm] = useState({
    name: initial?.name || '',
    phone: initial?.phone || '',
    existing_before: initial?.id ? !!initial.existing_before : null,
  })
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="label">Nombre *</label>
        <input className="input-dark" autoFocus value={form.name} placeholder="Ej: Martín"
               onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <label className="label">Celular <span className="text-cream/30 normal-case font-normal">(opcional)</span></label>
        <input className="input-dark" inputMode="tel" value={form.phone} placeholder="Ej: 11 2345 6789"
               onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>
      <div>
        <label className="label">¿Es cliente nuevo? *</label>
        <div className="grid grid-cols-2 gap-2">
          {[[false, 'Cliente nuevo', 'Primera vez en el local'], [true, 'Ya venía antes', 'Era cliente de antes']].map(([v, t, sub]) => (
            <button key={t} type="button" onClick={() => setForm(f => ({ ...f, existing_before: v }))}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                form.existing_before === v
                  ? (v ? 'border-gold/60 bg-gold/12' : 'border-emerald-400/60 bg-emerald-400/12')
                  : 'border-dark-400 hover:border-dark-500'
              }`}>
              <p className={`text-sm font-medium ${form.existing_before === v ? (v ? 'text-gold' : 'text-emerald-400') : 'text-cream/70'}`}>{t}</p>
              <p className="text-cream/35 text-[11px] mt-0.5">{sub}</p>
            </button>
          ))}
        </div>
        <p className="text-cream/30 text-[11px] mt-1.5">Los que ya venían no cuentan como nuevos en el cierre.</p>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
        <button type="button" onClick={() => onSubmit(form)} disabled={saving || !form.name.trim() || form.existing_before === null} className="btn-gold flex-1">
          {saving ? 'Guardando...' : submitLabel}
        </button>
      </div>
    </div>
  )
}

function PickerBody({ tenantId, onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [mode, setMode] = useState('search') // search | new
  const [saving, setSaving] = useState(false)
  const t = useRef(null)

  useEffect(() => {
    if (mode !== 'search') return
    setLoading(true)
    clearTimeout(t.current)
    t.current = setTimeout(async () => {
      try {
        setResults(await searchCustomers(tenantId, q))
        setError(false)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t.current)
  }, [q, tenantId, mode])

  async function handleCreate(form) {
    setSaving(true)
    try {
      const { customer, existed } = await createCustomer(tenantId, form)
      if (existed) toast(`Ese celular ya era de ${customer.name || 'un cliente'}: se usa ese`, { icon: 'ℹ️' })
      onPick(existed ? customer : { ...customer, _isNew: true })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'new') {
    // Si lo que se buscó parece un nombre, se precarga
    const initial = /\d/.test(q) ? { phone: q } : { name: q }
    return <CustomerForm initial={initial} onSubmit={handleCreate} onCancel={() => setMode('search')} submitLabel="Crear y usar" saving={saving} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream/35" />
        <input className="input-dark pl-10" autoFocus placeholder="Buscar por nombre o celular..."
               value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <button type="button" onClick={() => setMode('new')}
        className="flex items-center gap-2 text-gold/80 hover:text-gold text-sm py-1">
        <UserPlus size={15} /> {q.trim() ? `Cargar «${q.trim()}»` : 'Cargar cliente'}
      </button>

      {loading ? (
        <div className="flex justify-center py-6"><Spinner size={18} /></div>
      ) : error ? (
        <p className="text-amber-400/80 text-sm text-center py-6">No se pudo buscar. Revisá la conexión.</p>
      ) : results.length === 0 ? (
        <p className="text-cream/30 text-sm text-center py-6">
          {q ? 'No hay nadie con ese nombre. Crealo como nuevo.' : 'Todavía no hay clientes. Creá el primero.'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-dark-300 max-h-72 overflow-y-auto">
          {results.map(c => (
            <button key={c.id} type="button" onClick={() => onPick(c)}
              className="flex items-center gap-3 py-2.5 text-left hover:bg-dark-300/30 -mx-1 px-1 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-dark-300 border border-dark-400 flex items-center justify-center text-cream/60 shrink-0">
                <User size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-cream text-sm truncate">{c.name || 'Sin nombre'}</p>
                <p className="text-cream/40 text-xs truncate">{c.phone || 'Sin celular'}{c.existing_before ? ' · de antes' : ''}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
