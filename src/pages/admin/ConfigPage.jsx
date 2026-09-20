import { useEffect, useRef, useState } from 'react'
import { Plus, Minus, Pencil, Trash2, Eye, EyeOff, Save, Check, X, ChevronDown, ChevronUp, Lock, Boxes, ToggleLeft, ToggleRight, Camera, ImageOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { stockLevel } from '../../lib/stock'
import { uploadCatalogPhoto, removeCatalogPhoto } from '../../lib/photo'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

// Miniatura de foto de un ítem del catálogo (producto). Tocarla sube/cambia
// la foto; la cruz roja la quita. w-14/h-14 = 56px, bien visible en la lista.
function ItemPhoto({ item, tableName, tenantId, onChange }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadCatalogPhoto(supabase, { tenantId, tableName, itemId: item.id, file })
      const { error } = await supabase.from(tableName).update({ image_url: url }).eq('id', item.id)
      if (error) throw error
      onChange?.()
    } catch (err) {
      toast.error(err.message || 'No se pudo subir la foto')
    } finally {
      setUploading(false)
    }
  }

  async function remove(e) {
    e.stopPropagation()
    if (uploading) return
    setUploading(true)
    try {
      await removeCatalogPhoto(supabase, { tenantId, tableName, itemId: item.id })
      const { error } = await supabase.from(tableName).update({ image_url: null }).eq('id', item.id)
      if (error) throw error
      toast.success('Foto eliminada')
      onChange?.()
    } catch (err) {
      toast.error(err.message || 'No se pudo eliminar la foto')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title={item.image_url ? 'Cambiar foto' : 'Agregar foto'}
        className="relative w-14 h-14 rounded-xl bg-dark-300 border border-dark-400 overflow-hidden flex items-center justify-center group"
      >
        {item.image_url
          ? <img src={item.image_url} alt="" className="w-full h-full object-cover" />
          : <ImageOff size={18} className="text-cream/25" />}
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
          <Camera size={15} className="text-white opacity-0 group-hover:opacity-100" />
        </span>
        {uploading && (
          <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="w-4 h-4 border-2 border-cream/70 border-t-transparent rounded-full animate-spin" />
          </span>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
      </button>
      {item.image_url && !uploading && (
        <button
          type="button"
          onClick={remove}
          title="Quitar foto"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow"
        >
          <X size={11} strokeWidth={3} />
        </button>
      )}
    </div>
  )
}

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

function CatalogSection({ title, tableName, tenantId, showPrice = true, showBarberPrice = false, showStock = false, showPhoto = false }) {
  const [items, setItems] = useState([])
  const [quickName, setQuickName] = useState('')
  const [quickPrice, setQuickPrice] = useState('')
  const [quickBarberPrice, setQuickBarberPrice] = useState('')
  const [quickStock, setQuickStock] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editBarberPrice, setEditBarberPrice] = useState('')
  const [editMinStock, setEditMinStock] = useState('')
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
    }
    const { error } = await supabase.from(tableName).insert(payload)
    setAdding(false)
    if (error) return toast.error(error.message)
    setQuickName('')
    setQuickPrice('')
    setQuickBarberPrice('')
    setQuickStock('')
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
  }

  async function saveEdit(item) {
    if (!editName.trim()) return
    const payload = {
      name: editName.trim(),
      ...(showPrice ? { price: Number(editPrice) || 0 } : {}),
      ...(showBarberPrice ? { barber_price: editBarberPrice === '' ? null : Number(editBarberPrice) } : {}),
      ...(showStock ? { min_stock: Number(editMinStock) || 0 } : {}),
    }
    await supabase.from(tableName).update(payload).eq('id', item.id)
    setEditId(null)
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

      {/* Carga rápida */}
      <div className="rounded-xl border border-dark-400/50 bg-dark-300/25 p-3 mb-4">
        <div className="flex gap-2">
          <input
            ref={nameRef}
            className="input-dark flex-1 min-w-0"
            placeholder="Nombre del ítem..."
            value={quickName}
            onChange={e => setQuickName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {showPrice && (
            <input
              ref={priceRef}
              type="number"
              min="0"
              className="input-dark w-24 shrink-0"
              placeholder="Precio"
              value={quickPrice}
              onChange={e => setQuickPrice(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
          <button
            onClick={quickAdd}
            disabled={adding || !quickName.trim()}
            className="btn-gold px-4 shrink-0 flex items-center gap-1"
          >
            <Plus size={16} />
          </button>
        </div>
        {(showBarberPrice || showStock) && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {showBarberPrice && (
              <div>
                <span className="text-cream/35 text-[10px] uppercase tracking-wide block mb-1 truncate">Precio barbero</span>
                <input
                  type="number" min="0"
                  className="input-dark w-full !px-2.5"
                  placeholder="0"
                  value={quickBarberPrice}
                  onChange={e => setQuickBarberPrice(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            )}
            {showStock && (
              <div>
                <span className="text-cream/35 text-[10px] uppercase tracking-wide block mb-1 truncate">Stock inicial</span>
                <input
                  type="number" min="0"
                  className="input-dark w-full !px-2.5"
                  placeholder="0"
                  value={quickStock}
                  onChange={e => setQuickStock(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            )}
          </div>
        )}
      </div>
      {showBarberPrice && (
        <p className="text-cream/30 text-xs -mt-3 mb-4">Precio barbero: lo que paga un barbero por consumo propio. Vacío = usa el precio normal.</p>
      )}
      {showStock && (
        <p className={`text-cream/30 text-xs mb-4 ${showBarberPrice ? '' : '-mt-3'}`}>
          Stock: unidades que hay ahora (ajustables con − / +). Tocá el lápiz para fijar el <span className="text-cream/45">stock mínimo</span> (punto de reposición): al llegar a ese número o menos, queda en rojo.
        </p>
      )}

      {showPhoto && (
        <p className="text-cream/30 text-xs -mt-3 mb-4">
          Tocá la miniatura de un ítem ya creado para ponerle o cambiarle la foto.
        </p>
      )}

      {/* Lista */}
      {items.length === 0 ? (
        <p className="text-cream/25 text-sm text-center py-2">Sin ítems todavía</p>
      ) : (
        <div className="flex flex-col divide-y divide-dark-300">
          {items.map(item => (
            <div key={item.id} className="py-3 first:pt-0 last:pb-0">
              {editId === item.id ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    {showPhoto && <ItemPhoto item={item} tableName={tableName} tenantId={tenantId} onChange={load} />}
                    <input
                      className="input-dark flex-1 min-w-0 py-1.5 text-sm"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                      autoFocus
                    />
                    <button onClick={() => saveEdit(item)} className="text-emerald-400 hover:text-emerald-300 p-1.5 shrink-0">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditId(null)} className="text-cream/30 hover:text-cream/60 p-1.5 shrink-0">
                      <X size={16} />
                    </button>
                  </div>
                  {(showPrice || showBarberPrice || showStock) && (
                    <div className={`grid gap-2 ${showPhoto ? 'pl-[68px]' : ''} ${
                      { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3' }[
                        [showPrice, showBarberPrice, showStock].filter(Boolean).length
                      ] || 'grid-cols-1'
                    }`}>
                      {showPrice && (
                        <div>
                          <span className="text-cream/35 text-[10px] uppercase tracking-wide block mb-1 truncate">Precio</span>
                          <input
                            type="number" min="0"
                            className="input-dark w-full py-1.5 text-sm !px-2.5"
                            value={editPrice}
                            onChange={e => setEditPrice(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                          />
                        </div>
                      )}
                      {showBarberPrice && (
                        <div>
                          <span className="text-cream/35 text-[10px] uppercase tracking-wide block mb-1 truncate">Precio barbero</span>
                          <input
                            type="number" min="0"
                            className="input-dark w-full py-1.5 text-sm !px-2.5"
                            placeholder={item.price != null ? String(Number(item.price)) : ''}
                            value={editBarberPrice}
                            onChange={e => setEditBarberPrice(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                          />
                        </div>
                      )}
                      {showStock && (
                        <div>
                          <span className="text-cream/35 text-[10px] uppercase tracking-wide block mb-1 truncate">Stock mínimo</span>
                          <input
                            type="number" min="0"
                            className="input-dark w-full py-1.5 text-sm !px-2.5"
                            placeholder="0"
                            value={editMinStock}
                            onChange={e => setEditMinStock(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {showPhoto && <ItemPhoto item={item} tableName={tableName} tenantId={tenantId} onChange={load} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-cream/85 text-sm font-medium truncate">{item.name}</p>
                    {showBarberPrice && (
                      <p className="text-violet-300/70 text-xs mt-0.5 truncate">
                        Precio barbero: ${Number(item.barber_price ?? item.price).toLocaleString('es-AR')}
                      </p>
                    )}
                  </div>
                  {showPrice && (
                    <span className="text-gold text-sm font-semibold shrink-0">
                      ${Number(item.price).toLocaleString('es-AR')}
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
                </div>
              )}
              {editId !== item.id && showStock && (
                <div className={showPhoto ? 'pl-[68px] mt-1' : 'mt-1'}>
                  <StockControl item={item} tableName={tableName} onChange={load} />
                </div>
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

export default function ConfigPage() {
  const { tenant, stockEnabled, setStockEnabled } = useAuth()
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

      <CatalogSection title="Servicios" tableName="services" tenantId={tenant.id} showPrice />
      <CatalogSection title="Productos de vitrina" tableName="products" tenantId={tenant.id} showPrice showBarberPrice showStock={stockEnabled} showPhoto />
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
