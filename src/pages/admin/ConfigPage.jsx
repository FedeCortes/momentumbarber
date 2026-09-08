import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Minus, Pencil, Trash2, Eye, EyeOff, Save, Check, X, ChevronDown, ChevronUp, Lock, Boxes, ToggleLeft, ToggleRight, CalendarClock, Copy, Link2, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { stockLevel } from '../../lib/stock'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Modal from '../../components/ui/Modal'
import HoursEditor from '../../components/booking/HoursEditor'
import toast from 'react-hot-toast'

// Colores por estado de stock frente al punto de reposición
const STOCK_UI = {
  out: { text: 'text-red-400',      border: '!border-red-400/60',     label: 'Sin stock' },
  low: { text: 'text-red-400',      border: '!border-red-400/60',     label: 'Reponer' },
  ok:  { text: 'text-emerald-400',  border: '!border-emerald-400/45', label: 'Ok' },
}

// Control rápido de unidades en la lista del catálogo (solo si el stock está activo)
function StockControl({ item, tableName, onChange }) {
  const [val, setVal] = useState(String(item.stock ?? 0))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setVal(String(item.stock ?? 0)) }, [item.stock])

  const min = Number(item.min_stock) || 0
  const cur = Math.max(0, Math.round(Number(val) || 0))
  const ui = STOCK_UI[stockLevel(cur, min)]

  async function commit(next) {
    const n = Math.max(0, Math.round(Number(next) || 0))
    setVal(String(n))
    if (n === (Number(item.stock) || 0)) return
    setSaving(true)
    const { error } = await supabase.from(tableName).update({ stock: n }).eq('id', item.id)
    setSaving(false)
    if (error) return toast.error(error.message)
    onChange?.()
  }

  return (
    <div className="flex items-center gap-2 w-full mt-1">
      <button
        onClick={() => commit(cur - 1)}
        disabled={saving || cur === 0}
        className="w-7 h-7 rounded-md bg-dark-300 text-cream/60 flex items-center justify-center hover:bg-dark-400 disabled:opacity-30 shrink-0"
      >
        <Minus size={13} />
      </button>
      <input
        type="number" min="0" inputMode="numeric"
        className={`input-dark w-16 py-1 text-sm text-center ${ui.border} ${ui.text}`}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      <button
        onClick={() => commit(cur + 1)}
        disabled={saving}
        className="w-7 h-7 rounded-md bg-dark-300 text-cream/60 flex items-center justify-center hover:bg-dark-400 disabled:opacity-30 shrink-0"
      >
        <Plus size={13} />
      </button>
      <span className={`text-xs ml-1 ${ui.text}`}>
        {cur <= 0 ? 'Sin stock' : cur <= min ? `Quedan ${cur} · reponer` : `Quedan ${cur}`}
      </span>
      <span className="text-cream/25 text-xs ml-auto shrink-0">mín. {min}</span>
    </div>
  )
}

function CatalogSection({ title, tableName, tenantId, showPrice = true, showBarberPrice = false, showStock = false, showDuration = false, showBookable = false }) {
  const [items, setItems] = useState([])
  const [quickName, setQuickName] = useState('')
  const [quickPrice, setQuickPrice] = useState('')
  const [quickBarberPrice, setQuickBarberPrice] = useState('')
  const [quickStock, setQuickStock] = useState('')
  const [quickDuration, setQuickDuration] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editBarberPrice, setEditBarberPrice] = useState('')
  const [editMinStock, setEditMinStock] = useState('')
  const [editDuration, setEditDuration] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const nameRef = useRef(null)
  const priceRef = useRef(null)

  useEffect(() => { load() }, [tenantId])

  async function load() {
    const { data } = await supabase.from(tableName).select('*').eq('tenant_id', tenantId).order('name')
    setItems(data || [])
  }

  async function quickAdd() {
    if (!quickName.trim()) return
    setAdding(true)
    const payload = {
      name: quickName.trim(),
      tenant_id: tenantId,
      ...(showPrice ? { price: Number(quickPrice) || 0 } : {}),
      ...(showBarberPrice ? { barber_price: quickBarberPrice === '' ? null : Number(quickBarberPrice) } : {}),
      ...(showStock ? { stock: Number(quickStock) || 0 } : {}),
      ...(showDuration ? { duration_min: Number(quickDuration) || 30 } : {}),
    }
    const { error } = await supabase.from(tableName).insert(payload)
    setAdding(false)
    if (error) return toast.error(error.message)
    setQuickName('')
    setQuickPrice('')
    setQuickBarberPrice('')
    setQuickStock('')
    setQuickDuration('')
    nameRef.current?.focus()
    load()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); quickAdd() }
  }

  function startEdit(item) {
    setEditId(item.id)
    setEditName(item.name)
    setEditPrice(item.price ?? '')
    setEditBarberPrice(item.barber_price ?? '')
    setEditMinStock(item.min_stock ?? '')
    setEditDuration(item.duration_min ?? '')
  }

  async function saveEdit(item) {
    if (!editName.trim()) return
    const payload = {
      name: editName.trim(),
      ...(showPrice ? { price: Number(editPrice) || 0 } : {}),
      ...(showBarberPrice ? { barber_price: editBarberPrice === '' ? null : Number(editBarberPrice) } : {}),
      ...(showStock ? { min_stock: Number(editMinStock) || 0 } : {}),
      ...(showDuration ? { duration_min: Number(editDuration) || 30 } : {}),
    }
    await supabase.from(tableName).update(payload).eq('id', item.id)
    setEditId(null)
    load()
  }

  async function toggleBookable(item) {
    await supabase.from(tableName).update({ bookable: !(item.bookable ?? true) }).eq('id', item.id)
    load()
  }

  async function handleDelete() {
    await supabase.from(tableName).delete().eq('id', deleteId)
    toast.success('Eliminado')
    setDeleteId(null)
    load()
  }

  return (
    <div className="card mb-4">
      <h3 className="font-display text-lg text-cream mb-4">{title}</h3>

      {/* Fila de carga rápida */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          ref={nameRef}
          className="input-dark flex-1 min-w-[8rem]"
          placeholder="Nombre..."
          value={quickName}
          onChange={e => setQuickName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {showPrice && (
          <input
            ref={priceRef}
            type="number"
            min="0"
            className="input-dark w-24"
            placeholder="Precio"
            value={quickPrice}
            onChange={e => setQuickPrice(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        {showBarberPrice && (
          <input
            type="number"
            min="0"
            className="input-dark w-28"
            placeholder="Precio barbero"
            value={quickBarberPrice}
            onChange={e => setQuickBarberPrice(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        {showStock && (
          <input
            type="number"
            min="0"
            className="input-dark w-20"
            placeholder="Stock"
            value={quickStock}
            onChange={e => setQuickStock(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        {showDuration && (
          <div className="relative w-24 shrink-0">
            <input
              type="number" min="5" step="5"
              className="input-dark w-full pr-9"
              placeholder="30"
              value={quickDuration}
              onChange={e => setQuickDuration(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cream/40 text-xs pointer-events-none">min</span>
          </div>
        )}
        <button
          onClick={quickAdd}
          disabled={adding || !quickName.trim()}
          className="btn-gold px-4 shrink-0 flex items-center gap-1"
        >
          <Plus size={16} />
        </button>
      </div>
      {showBarberPrice && (
        <p className="text-cream/30 text-xs -mt-3 mb-4">Precio barbero: lo que paga un barbero por consumo propio. Vacío = usa el precio normal.</p>
      )}
      {showStock && (
        <p className={`text-cream/30 text-xs mb-4 ${showBarberPrice ? '' : '-mt-3'}`}>
          Stock: unidades que hay ahora (ajustables con − / +). Tocá el lápiz para fijar el <span className="text-cream/45">stock mínimo</span> (punto de reposición): al llegar a ese número o menos, queda en rojo.
        </p>
      )}
      {showDuration && (
        <p className="text-cream/30 text-xs -mt-3 mb-4">
          La duración (en minutos) define cuánto ocupa el turno en la agenda. Tocá <span className="text-cream/45">Online</span> para sacar un servicio de la reserva online sin borrarlo.
        </p>
      )}

      {/* Lista */}
      {items.length === 0 ? (
        <p className="text-cream/25 text-sm text-center py-2">Sin ítems todavía</p>
      ) : (
        <div className="flex flex-col divide-y divide-dark-300">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 py-2.5 flex-wrap">
              {editId === item.id ? (
                <>
                  <input
                    className="input-dark flex-1 py-1 text-sm min-w-[8rem]"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                    autoFocus
                  />
                  {showPrice && (
                    <input
                      type="number"
                      className="input-dark w-24 py-1 text-sm"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                    />
                  )}
                  {showBarberPrice && (
                    <input
                      type="number"
                      className="input-dark w-28 py-1 text-sm"
                      placeholder="Precio barbero"
                      value={editBarberPrice}
                      onChange={e => setEditBarberPrice(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                    />
                  )}
                  {showStock && (
                    <input
                      type="number"
                      min="0"
                      className="input-dark w-28 py-1 text-sm"
                      placeholder="Stock mínimo"
                      value={editMinStock}
                      onChange={e => setEditMinStock(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                    />
                  )}
                  {showDuration && (
                    <div className="relative w-20 shrink-0">
                      <input
                        type="number" min="5" step="5"
                        className="input-dark w-full py-1 text-sm pr-8"
                        placeholder="30"
                        value={editDuration}
                        onChange={e => setEditDuration(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-cream/35 text-[10px] pointer-events-none">min</span>
                    </div>
                  )}
                  <button onClick={() => saveEdit(item)} className="text-emerald-400 hover:text-emerald-300 p-1">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditId(null)} className="text-cream/30 hover:text-cream/60 p-1">
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-cream/80 text-sm min-w-[8rem]">{item.name}</span>
                  {showDuration && (
                    <span className="text-cream/35 text-xs shrink-0">{item.duration_min ?? 30} min</span>
                  )}
                  {showBookable && (
                    <button
                      onClick={() => toggleBookable(item)}
                      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${
                        (item.bookable ?? true)
                          ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
                          : 'text-cream/30 border-dark-400'
                      }`}
                      title={(item.bookable ?? true) ? 'Se puede reservar online' : 'No aparece en la reserva online'}
                    >
                      Online
                    </button>
                  )}
                  {showPrice && (
                    <span className="text-gold text-sm font-medium shrink-0">
                      ${Number(item.price).toLocaleString('es-AR')}
                    </span>
                  )}
                  {showBarberPrice && (
                    <span className="text-violet-300/70 text-xs shrink-0">
                      barbero: ${Number(item.barber_price ?? item.price).toLocaleString('es-AR')}
                    </span>
                  )}
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => startEdit(item)} className="btn-ghost p-1.5">
                      <Pencil size={14} className="text-cream/40" />
                    </button>
                    <button onClick={() => setDeleteId(item.id)} className="btn-ghost p-1.5 text-red-400/50 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {showStock && <StockControl item={item} tableName={tableName} onChange={load} />}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar ítem"
        message="¿Eliminás este ítem del catálogo?"
        danger
      />
    </div>
  )
}

function PaymentMethodSection({ tenantId }) {
  const [items, setItems]               = useState([])
  const [quickName, setQuickName]       = useState('')
  const [quickSurcharge, setQuickSurcharge] = useState('')
  const [adding, setAdding]             = useState(false)
  const [editId, setEditId]             = useState(null)
  const [editName, setEditName]         = useState('')
  const [editSurcharge, setEditSurcharge] = useState('')
  const [deleteId, setDeleteId]         = useState(null)
  const nameRef = useRef(null)

  useEffect(() => { load() }, [tenantId])

  async function load() {
    const { data } = await supabase.from('payment_methods').select('*').eq('tenant_id', tenantId).order('sort_order').order('name')
    setItems(data || [])
  }

  async function quickAdd() {
    if (!quickName.trim()) return
    setAdding(true)
    const { error } = await supabase.from('payment_methods').insert({
      name: quickName.trim(),
      tenant_id: tenantId,
      surcharge_pct: Number(quickSurcharge) || 0,
    })
    setAdding(false)
    if (error) return toast.error(error.message)
    setQuickName(''); setQuickSurcharge('')
    nameRef.current?.focus()
    load()
  }

  function startEdit(item) {
    setEditId(item.id)
    setEditName(item.name)
    setEditSurcharge(item.surcharge_pct != null ? String(item.surcharge_pct) : '0')
  }

  async function saveEdit(item) {
    if (!editName.trim()) return
    await supabase.from('payment_methods').update({
      name: editName.trim(),
      surcharge_pct: Number(editSurcharge) || 0,
    }).eq('id', item.id)
    setEditId(null)
    load()
  }

  async function handleDelete() {
    await supabase.from('payment_methods').delete().eq('id', deleteId)
    toast.success('Eliminado')
    setDeleteId(null)
    load()
  }

  return (
    <div className="card mb-4">
      <h3 className="font-display text-lg text-cream mb-1">Métodos de pago</h3>
      <p className="text-cream/35 text-xs mb-4">El recargo se suma automáticamente al total cuando se usa ese método</p>

      <div className="flex gap-2 mb-4">
        <input
          ref={nameRef}
          className="input-dark flex-1"
          placeholder="Ej: Tarjeta de crédito"
          value={quickName}
          onChange={e => setQuickName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && quickAdd()}
        />
        <div className="relative w-28 shrink-0">
          <input
            type="number" min="0" max="100" step="0.5"
            className="input-dark w-full pr-7"
            placeholder="0"
            value={quickSurcharge}
            onChange={e => setQuickSurcharge(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && quickAdd()}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/40 text-sm pointer-events-none">%</span>
        </div>
        <button onClick={quickAdd} disabled={adding || !quickName.trim()} className="btn-gold px-4 shrink-0 flex items-center gap-1">
          <Plus size={16} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-cream/25 text-sm text-center py-2">Sin métodos todavía</p>
      ) : (
        <div className="flex flex-col divide-y divide-dark-300">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 py-2.5">
              {editId === item.id ? (
                <>
                  <input
                    className="input-dark flex-1 py-1 text-sm"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                    autoFocus
                  />
                  <div className="relative w-24 shrink-0">
                    <input
                      type="number" min="0" max="100" step="0.5"
                      className="input-dark py-1 text-sm pr-7 w-full"
                      value={editSurcharge}
                      onChange={e => setEditSurcharge(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/40 text-xs pointer-events-none">%</span>
                  </div>
                  <button onClick={() => saveEdit(item)} className="text-emerald-400 hover:text-emerald-300 p-1"><Check size={16} /></button>
                  <button onClick={() => setEditId(null)} className="text-cream/30 hover:text-cream/60 p-1"><X size={16} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-cream/80 text-sm">{item.name}</span>
                  {Number(item.surcharge_pct) > 0 ? (
                    <span className="text-amber-400/80 text-xs font-semibold shrink-0 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                      +{Number(item.surcharge_pct)}%
                    </span>
                  ) : (
                    <span className="text-cream/20 text-xs shrink-0">sin recargo</span>
                  )}
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => startEdit(item)} className="btn-ghost p-1.5"><Pencil size={14} className="text-cream/40" /></button>
                    <button onClick={() => setDeleteId(item.id)} className="btn-ghost p-1.5 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        title="Eliminar método" message="¿Eliminás este método de pago?" danger
      />
    </div>
  )
}

// ── Reservas online: switch + link público + ajustes ────────
function BookingSection({ tenant }) {
  const { bookingEnabled, setBookingEnabled } = useAuth()
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [hoursStat, setHoursStat] = useState(null)  // { withHours, total }

  useEffect(() => {
    if (!tenant?.id) return
    const cols = 'booking_slot_min, booking_lead_hours, booking_horizon_days, booking_notice, booking_whatsapp'
    const fallback = { booking_slot_min: 15, booking_lead_hours: 2, booking_horizon_days: 21, booking_notice: '', booking_whatsapp: '' }
    ;(async () => {
      let { data, error } = await supabase.from('tenant_config').select(cols).eq('tenant_id', tenant.id).maybeSingle()
      // por si todavía no se corrió la migración con booking_whatsapp
      if (error) ({ data } = await supabase.from('tenant_config')
        .select('booking_slot_min, booking_lead_hours, booking_horizon_days, booking_notice')
        .eq('tenant_id', tenant.id).maybeSingle())
      setCfg(data ? { ...fallback, ...data } : fallback)
    })()
  }, [tenant?.id])

  const loadHoursStat = useCallback(() => {
    if (!tenant?.id) return
    Promise.all([
      supabase.from('barbers').select('id').eq('tenant_id', tenant.id).eq('is_active', true),
      supabase.from('barber_hours').select('barber_id').eq('tenant_id', tenant.id),
    ]).then(([b, h]) => {
      const withHours = new Set((h.data || []).map(r => r.barber_id)).size
      setHoursStat({ withHours, total: (b.data || []).length })
    })
  }, [tenant?.id])
  useEffect(() => { if (bookingEnabled) loadHoursStat() }, [bookingEnabled, loadHoursStat])

  const link = `${window.location.origin}/reservar/${tenant.slug}`

  async function toggle() {
    const next = !bookingEnabled
    setToggling(true)
    const { error } = await supabase.from('tenant_config')
      .update({ booking_enabled: next, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id)
    setToggling(false)
    if (error) return toast.error('No se pudo guardar. ¿Corriste la migración de reservas en Supabase?')
    setBookingEnabled(next)
    toast.success(next ? 'Reservas online activadas' : 'Reservas online desactivadas')
    if (next) setHoursOpen(true)   // recién activado → configurá los horarios
  }

  async function save() {
    setSaving(true)
    const payload = {
      booking_slot_min:     Math.max(5, Number(cfg.booking_slot_min) || 15),
      booking_lead_hours:   Math.max(0, Number(cfg.booking_lead_hours) || 0),
      booking_horizon_days: Math.min(90, Math.max(1, Number(cfg.booking_horizon_days) || 21)),
      booking_notice:       cfg.booking_notice?.trim() || null,
      booking_whatsapp:     cfg.booking_whatsapp?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    let { error } = await supabase.from('tenant_config').update(payload).eq('tenant_id', tenant.id)
    if (error) {
      // la columna booking_whatsapp puede no existir todavía
      const { booking_whatsapp: _wa, ...rest } = payload
      ;({ error } = await supabase.from('tenant_config').update(rest).eq('tenant_id', tenant.id))
    }
    setSaving(false)
    if (error) return toast.error('Error al guardar')
    toast.success('Ajustes de reservas guardados')
  }

  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CalendarClock size={18} className="text-cream/40 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-display text-lg text-cream">Reservas online</h3>
            <p className="text-cream/40 text-xs mt-1 max-w-md leading-relaxed">
              Tus clientes reservan turno solos desde un enlace. El turno queda confirmado
              al instante y lo ves en la Agenda. Desactivado, el enlace deja de funcionar.
            </p>
          </div>
        </div>
        <button onClick={toggle} disabled={toggling} className="shrink-0 mt-0.5 disabled:opacity-40">
          {bookingEnabled
            ? <ToggleRight size={32} className="text-emerald-400" />
            : <ToggleLeft size={32} className="text-cream/30" />}
        </button>
      </div>

      {bookingEnabled && (
        <div className="mt-4 pt-4 border-t border-dark-300 flex flex-col gap-4">
          <div>
            <label className="label">Enlace para tus clientes</label>
            <div className="flex gap-2">
              <div className="input-dark flex-1 flex items-center gap-2 text-cream/70 text-xs truncate">
                <Link2 size={13} className="shrink-0 text-cream/40" /> {link}
              </div>
              <button onClick={() => { navigator.clipboard?.writeText(link); toast.success('Enlace copiado') }}
                      className="btn-gold px-3 shrink-0"><Copy size={15} /></button>
            </div>
            <p className="text-cream/30 text-xs mt-1">Pegalo en tu bio de Instagram, WhatsApp o Google.</p>
          </div>

          {/* Horarios de atención — se configuran en un modal */}
          <div className="rounded-xl border border-dark-400/60 bg-dark-300/25 p-3.5 flex items-center gap-3">
            <Clock size={18} className="text-cream/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-cream/80 text-sm font-medium">Horarios de atención</p>
              <p className="text-xs mt-0.5">
                {!hoursStat ? (
                  <span className="text-cream/35">Definí qué días y horas trabaja cada barbero.</span>
                ) : hoursStat.total === 0 ? (
                  <span className="text-amber-400/80">Primero cargá barberos activos.</span>
                ) : hoursStat.withHours === 0 ? (
                  <span className="text-amber-400/80">Sin configurar — nadie tiene horario todavía.</span>
                ) : hoursStat.withHours < hoursStat.total ? (
                  <span className="text-amber-400/80">{hoursStat.withHours} de {hoursStat.total} barberos con horario.</span>
                ) : (
                  <span className="text-emerald-400/80">Los {hoursStat.total} barberos tienen horario cargado.</span>
                )}
              </p>
            </div>
            <button onClick={() => setHoursOpen(true)} className="btn-gold px-3 py-1.5 text-xs shrink-0">
              Configurar
            </button>
          </div>

          {cfg && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Anticipación mínima</label>
                  <div className="relative">
                    <input type="number" min="0" className="input-dark pr-12"
                           value={cfg.booking_lead_hours}
                           onChange={e => setCfg(c => ({ ...c, booking_lead_hours: e.target.value }))} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/40 text-xs">horas</span>
                  </div>
                </div>
                <div>
                  <label className="label">Reservar hasta</label>
                  <div className="relative">
                    <input type="number" min="1" max="90" className="input-dark pr-12"
                           value={cfg.booking_horizon_days}
                           onChange={e => setCfg(c => ({ ...c, booking_horizon_days: e.target.value }))} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/40 text-xs">días</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Cada cuánto ofrecer un horario</label>
                <select className="input-dark" value={cfg.booking_slot_min}
                        onChange={e => setCfg(c => ({ ...c, booking_slot_min: e.target.value }))}>
                  {[10, 15, 20, 30, 45, 60].map(n => <option key={n} value={n}>Cada {n} minutos</option>)}
                </select>
              </div>
              <div>
                <label className="label">WhatsApp de la barbería</label>
                <input className="input-dark" inputMode="tel" placeholder="Ej: 299 555 1234"
                       value={cfg.booking_whatsapp || ''}
                       onChange={e => setCfg(c => ({ ...c, booking_whatsapp: e.target.value }))} />
                <p className="text-cream/30 text-xs mt-1">
                  El número al que escribe el cliente al confirmar el turno. Si lo dejás vacío, se usa el teléfono de la barbería.
                </p>
              </div>
              <div>
                <label className="label">Mensaje para el cliente (opcional)</label>
                <textarea className="input-dark min-h-[3.5rem]" placeholder="Ej: Los jueves 20% off pagando en efectivo."
                          value={cfg.booking_notice || ''}
                          onChange={e => setCfg(c => ({ ...c, booking_notice: e.target.value }))} />
              </div>
              <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-2 self-start">
                <Save size={15} /> {saving ? 'Guardando...' : 'Guardar ajustes'}
              </button>
              <p className="text-cream/30 text-xs">
                La duración de cada servicio (lo que ocupa el turno) se define en “Servicios”, más abajo.
              </p>
            </>
          )}
        </div>
      )}

      <Modal open={hoursOpen} onClose={() => { setHoursOpen(false); loadHoursStat() }} title="Horarios de atención" size="lg">
        <HoursEditor tenantId={tenant.id} onDone={() => { setHoursOpen(false); loadHoursStat() }} />
      </Modal>
    </div>
  )
}


export default function ConfigPage() {
  const { tenant, stockEnabled, setStockEnabled, bookingEnabled } = useAuth()
  const [adminPass, setAdminPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [savingStock, setSavingStock] = useState(false)

  async function toggleStock() {
    const next = !stockEnabled
    setSavingStock(true)
    const { error } = await supabase
      .from('tenant_config')
      .update({ stock_enabled: next, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id)
    setSavingStock(false)
    if (error) return toast.error('No se pudo guardar. Falta correr la migración de stock en Supabase.')
    setStockEnabled(next)
    toast.success(next ? 'Control de stock activado' : 'Control de stock desactivado')
  }

  async function handleSaveAdminPass() {
    if (!adminPass || adminPass.length < 4) return toast.error('La contraseña debe tener al menos 4 caracteres')
    setSavingPass(true)
    const { error } = await supabase
      .from('tenant_config')
      .update({ admin_password: adminPass, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id)
    setSavingPass(false)
    if (error) return toast.error('Error al guardar')
    setAdminPass('')
    toast.success('Contraseña de admin actualizada')
  }

  if (!tenant) return null

  return (
    <div>
      <h1 className="section-title mb-1">Configuración</h1>
      <p className="section-sub mb-6">Catálogos y ajustes de {tenant.name}</p>

      {/* ── Control de stock ── */}
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Boxes size={18} className="text-cream/40 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-display text-lg text-cream">Control de stock</h3>
              <p className="text-cream/40 text-xs mt-1 max-w-md leading-relaxed">
                Llevá el inventario de productos y bebidas: cargás cuántas unidades hay, se descuenta
                al registrar la venta oficial, ves cuánto queda al vender y no se puede vender algo sin stock.
                {' '}Desactivado, se ignora por completo.
              </p>
            </div>
          </div>
          <button onClick={toggleStock} disabled={savingStock} className="shrink-0 mt-0.5 disabled:opacity-40" title={stockEnabled ? 'Desactivar' : 'Activar'}>
            {stockEnabled
              ? <ToggleRight size={32} className="text-emerald-400" />
              : <ToggleLeft size={32} className="text-cream/30" />}
          </button>
        </div>
      </div>

      <BookingSection tenant={tenant} />

      <CatalogSection
        title="Servicios" tableName="services" tenantId={tenant.id}
        showPrice showDuration={bookingEnabled} showBookable={bookingEnabled}
      />
      <CatalogSection title="Productos de vitrina" tableName="products" tenantId={tenant.id} showPrice showBarberPrice showStock={stockEnabled} />
      <CatalogSection title="Bebidas" tableName="drinks" tenantId={tenant.id} showPrice showBarberPrice showStock={stockEnabled} />
      <CatalogSection title="Pagadores" tableName="expense_payers" tenantId={tenant.id} showPrice={false} />
      <PaymentMethodSection tenantId={tenant.id} />

      {/* Seguridad — colapsado por defecto */}
      <div className="card mb-4">
        <button
          onClick={() => setSecurityOpen(o => !o)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-cream/40" />
            <span className="text-cream/70 text-sm font-medium">Cambiar contraseña de administrador</span>
          </div>
          {securityOpen ? <ChevronUp size={15} className="text-cream/40" /> : <ChevronDown size={15} className="text-cream/40" />}
        </button>

        {securityOpen && (
          <div className="mt-4 pt-4 border-t border-dark-300 flex gap-3">
            <div className="relative flex-1">
              <input
                type={showPass ? 'text' : 'password'}
                className="input-dark pr-11"
                placeholder="Nueva contraseña"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveAdminPass()}
                autoFocus
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-cream/40 hover:text-cream/70">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button onClick={handleSaveAdminPass} disabled={savingPass} className="btn-gold flex items-center gap-2 shrink-0">
              <Save size={16} /> {savingPass ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
