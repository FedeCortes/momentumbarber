import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Eye, EyeOff, Save, Check, X, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

function CatalogSection({ title, tableName, tenantId, showPrice = true }) {
  const [items, setItems] = useState([])
  const [quickName, setQuickName] = useState('')
  const [quickPrice, setQuickPrice] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
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
    const payload = { name: quickName.trim(), tenant_id: tenantId, ...(showPrice ? { price: Number(quickPrice) || 0 } : {}) }
    const { error } = await supabase.from(tableName).insert(payload)
    setAdding(false)
    if (error) return toast.error(error.message)
    setQuickName('')
    setQuickPrice('')
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
  }

  async function saveEdit(item) {
    if (!editName.trim()) return
    const payload = { name: editName.trim(), ...(showPrice ? { price: Number(editPrice) || 0 } : {}) }
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

      {/* Fila de carga rápida */}
      <div className="flex gap-2 mb-4">
        <input
          ref={nameRef}
          className="input-dark flex-1"
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
            className="input-dark w-28"
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

      {/* Lista */}
      {items.length === 0 ? (
        <p className="text-cream/25 text-sm text-center py-2">Sin ítems todavía</p>
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
                  {showPrice && (
                    <input
                      type="number"
                      className="input-dark w-24 py-1 text-sm"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(item)}
                    />
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
                  <span className="flex-1 text-cream/80 text-sm">{item.name}</span>
                  {showPrice && (
                    <span className="text-gold text-sm font-medium shrink-0">
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

export default function ConfigPage() {
  const { tenant } = useAuth()
  const [adminPass, setAdminPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)

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

      <CatalogSection title="Servicios" tableName="services" tenantId={tenant.id} showPrice />
      <CatalogSection title="Productos de vitrina" tableName="products" tenantId={tenant.id} showPrice />
      <CatalogSection title="Bebidas" tableName="drinks" tenantId={tenant.id} showPrice />
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
