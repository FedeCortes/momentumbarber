import { useEffect, useState } from 'react'
import { Copy, Plus, Save, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { WEEKDAYS } from '../../lib/booking'
import ConfirmDialog from '../ui/ConfirmDialog'
import toast from 'react-hot-toast'

// Grilla semanal de horarios de un barbero.
//  - Admin:  <HoursEditor tenantId={id} onDone={close} />  → selector de barbero + "todo el equipo"
//  - Barbero: <HoursEditor tenantId={id} barberId={miId} variant="page" />  → bloqueado a ese barbero
const emptyGrid = () => Object.fromEntries(WEEKDAYS.map(d => [d.i, []]))

export default function HoursEditor({ tenantId, barberId: lockedBarberId, variant = 'modal', onDone }) {
  const locked = !!lockedBarberId
  const [barbers, setBarbers] = useState([])
  const [barberId, setBarberId] = useState(lockedBarberId || '')
  const [grid, setGrid] = useState(emptyGrid())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmCopy, setConfirmCopy] = useState(false)
  const [preset, setPreset] = useState({ start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] })

  useEffect(() => {
    if (locked || !tenantId) { if (locked) setLoading(true); return }
    supabase.from('barbers').select('id, name').eq('tenant_id', tenantId).eq('is_active', true).order('name')
      .then(({ data }) => {
        setBarbers(data || [])
        if (data?.length) setBarberId(b => b || data[0].id)
        else setLoading(false)
      })
  }, [tenantId, locked])

  useEffect(() => {
    if (!barberId) return
    setLoading(true)
    supabase.from('barber_hours').select('weekday, start_time, end_time').eq('barber_id', barberId)
      .then(({ data }) => {
        const g = emptyGrid()
        for (const r of data || []) {
          g[r.weekday] = [...(g[r.weekday] || []), { start: (r.start_time || '').slice(0, 5), end: (r.end_time || '').slice(0, 5) }]
        }
        for (const k of Object.keys(g)) g[k].sort((a, b) => a.start.localeCompare(b.start))
        setGrid(g)
        setLoading(false)
      })
  }, [barberId])

  function togglePresetDay(i) {
    setPreset(p => ({ ...p, days: p.days.includes(i) ? p.days.filter(x => x !== i) : [...p.days, i] }))
  }
  function applyPreset() {
    if (!preset.start || !preset.end || preset.end <= preset.start) return toast.error('Revisá el horario: la hora de fin tiene que ser mayor')
    if (preset.days.length === 0) return toast.error('Elegí al menos un día')
    setGrid(() => {
      const next = emptyGrid()
      for (const d of WEEKDAYS) next[d.i] = preset.days.includes(d.i) ? [{ start: preset.start, end: preset.end }] : []
      return next
    })
    toast.success('Listo. Ajustá los días distintos y tocá Guardar')
  }

  function addRange(wd) {
    setGrid(g => ({ ...g, [wd]: [...g[wd], g[wd].length ? { start: '', end: '' } : { start: '09:00', end: '18:00' }] }))
  }
  function setRange(wd, idx, patch) {
    setGrid(g => ({ ...g, [wd]: g[wd].map((r, i) => i === idx ? { ...r, ...patch } : r) }))
  }
  function removeRange(wd, idx) {
    setGrid(g => ({ ...g, [wd]: g[wd].filter((_, i) => i !== idx) }))
  }

  function rowsFor(id) {
    const rows = []
    for (const d of WEEKDAYS) {
      for (const r of grid[d.i] || []) {
        if (r.start && r.end && r.end > r.start) {
          rows.push({ tenant_id: tenantId, barber_id: id, weekday: d.i, start_time: r.start, end_time: r.end })
        }
      }
    }
    return rows
  }

  function validGrid() {
    for (const d of WEEKDAYS) {
      for (const r of grid[d.i] || []) {
        if ((r.start || r.end) && (!r.start || !r.end || r.end <= r.start)) {
          toast.error(`Revisá el horario del ${d.long.toLowerCase()}`)
          return false
        }
      }
    }
    return true
  }

  async function persist(id) {
    await supabase.from('barber_hours').delete().eq('barber_id', id)
    const rows = rowsFor(id)
    return rows.length ? supabase.from('barber_hours').insert(rows) : { error: null }
  }

  async function save() {
    if (!validGrid()) return
    setSaving(true)
    const { error } = await persist(barberId)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Horarios guardados')
    onDone?.()
  }

  async function copyToAll() {
    setConfirmCopy(false)
    if (!validGrid()) return
    setSaving(true)
    for (const b of barbers) {
      const { error } = await persist(b.id)
      if (error) { setSaving(false); return toast.error(error.message) }
    }
    setSaving(false)
    toast.success('Horarios aplicados a todo el equipo')
    onDone?.()
  }

  if (loading && !locked && barbers.length === 0) {
    return <p className="text-cream/25 text-sm text-center py-6">Cargando...</p>
  }
  if (!locked && barbers.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-cream/60 text-sm">Primero cargá barberos activos</p>
        <p className="text-cream/35 text-xs mt-1">En “Barberos” del menú. Después volvé acá para definir sus horarios.</p>
        {onDone && <button onClick={onDone} className="btn-ghost mt-4">Cerrar</button>}
      </div>
    )
  }

  const barActions = variant === 'modal'
    ? 'sticky bottom-0 bg-dark-200 -mx-5 px-5 pb-1'
    : ''

  return (
    <div>
      {!locked && (
        <>
          <p className="text-cream/45 text-xs mb-4">
            Los turnos que se ofrecen online salen de acá. Elegí el barbero, poné sus días y horas, y guardá.
            Un día sin franjas = no atiende.
          </p>
          <label className="label">Barbero</label>
          <select className="input-dark mb-4" value={barberId} onChange={e => setBarberId(e.target.value)}>
            {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </>
      )}
      {locked && (
        <p className="text-cream/45 text-xs mb-4">
          Poné tus días y horas de trabajo. Es lo que define los turnos que tus clientes pueden reservar.
          Un día sin franjas = no atendés.
        </p>
      )}

      {/* Carga rápida: mismo horario para varios días */}
      <div className="rounded-xl border border-dark-400/50 bg-dark-300/25 p-3 mb-4">
        <p className="text-cream/60 text-xs font-semibold mb-2.5">Poner el mismo horario para varios días</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="time" className="input-dark !w-auto py-1.5 text-sm"
                 value={preset.start} onChange={e => setPreset(p => ({ ...p, start: e.target.value }))} />
          <span className="text-cream/30 text-xs">a</span>
          <input type="time" className="input-dark !w-auto py-1.5 text-sm"
                 value={preset.end} onChange={e => setPreset(p => ({ ...p, end: e.target.value }))} />
          <div className="flex gap-1 flex-wrap">
            {WEEKDAYS.map(d => (
              <button key={d.i} type="button" onClick={() => togglePresetDay(d.i)}
                className={`px-2 h-8 rounded-lg text-[11px] font-bold transition-colors ${
                  preset.days.includes(d.i) ? 'bg-gold text-ink' : 'bg-dark-300 text-cream/35 hover:text-cream/60'
                }`}>{d.short}</button>
            ))}
          </div>
          <button type="button" onClick={applyPreset} className="btn-gold px-3 py-1.5 text-xs">Aplicar</button>
        </div>
        <p className="text-cream/30 text-[11px] mt-2">
          Llena esos días con ese horario. Después ajustás un día puntual y tocás <span className="text-cream/50">Guardar</span>.
        </p>
      </div>

      {loading ? (
        <p className="text-cream/25 text-sm text-center py-4">Cargando...</p>
      ) : (
        <div className="flex flex-col divide-y divide-dark-300">
          {WEEKDAYS.map(d => (
            <div key={d.i} className="py-3 flex gap-3">
              <span className="text-cream/70 text-sm w-24 shrink-0 pt-2">{d.long}</span>
              <div className="flex-1 flex flex-col gap-2">
                {(grid[d.i] || []).length === 0 && (
                  <span className="text-cream/25 text-xs pt-2">Cerrado</span>
                )}
                {(grid[d.i] || []).map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input type="time" className="input-dark !w-auto py-1.5 text-sm"
                           value={r.start} onChange={e => setRange(d.i, idx, { start: e.target.value })} />
                    <span className="text-cream/30 text-xs">a</span>
                    <input type="time" className="input-dark !w-auto py-1.5 text-sm"
                           value={r.end} onChange={e => setRange(d.i, idx, { end: e.target.value })} />
                    <button onClick={() => removeRange(d.i, idx)} className="btn-ghost p-1.5 text-red-400/50 hover:text-red-400">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addRange(d.i)} className="text-gold/70 hover:text-gold text-xs flex items-center gap-1 self-start">
                  <Plus size={12} /> Agregar franja
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`flex items-center gap-3 mt-5 pt-4 border-t border-dark-300 flex-wrap ${barActions}`}>
        <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-2">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar horarios'}
        </button>
        {!locked && barbers.length > 1 && (
          <button onClick={() => setConfirmCopy(true)} disabled={saving} className="btn-ghost flex items-center gap-2">
            <Copy size={14} /> Guardar para todo el equipo
          </button>
        )}
        {onDone && <button onClick={onDone} disabled={saving} className="btn-ghost ml-auto">Cerrar</button>}
      </div>

      <ConfirmDialog
        open={confirmCopy} onClose={() => setConfirmCopy(false)} onConfirm={copyToAll}
        title="Aplicar a todo el equipo"
        message="Todos los barberos activos quedan con exactamente estos días y horarios (se reemplaza lo que tuvieran). ¿Seguimos?"
      />
    </div>
  )
}
