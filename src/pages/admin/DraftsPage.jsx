import { useEffect, useState } from 'react'
import { FileText, Check, X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Receipt, Plus, Minus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Modal from '../../components/ui/Modal'
import DateRangePicker, { dateRangeLabel } from '../../components/ui/DateRangePicker'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router-dom'

// ── Borrador — con edición y borrado para admin ───────────────────────────────
function DraftRow({ draft, barbers, paymentMethods, onStatusChange, showDate, isAdmin, onDelete }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const [working, setWorking] = useState(false)
  const [editOpen, setEditOpen]     = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)

  const [catalog, setCatalog]         = useState({ services: [], products: [], drinks: [] })
  const [selServices, setSelServices] = useState({})
  const [selProducts, setSelProducts] = useState({})
  const [selDrinks, setSelDrinks]     = useState({})
  const [editBarber, setEditBarber]   = useState('')
  const [editPayment, setEditPayment] = useState('')
  const [editTip, setEditTip]         = useState('')

  const pm = paymentMethods.find(p => p.id === draft.payment_method_id)

  async function toggle() {
    if (open) { setOpen(false); return }
    if (!items) {
      const { data } = await supabase.from('draft_items').select('*').eq('draft_id', draft.id)
      setItems(data || [])
    }
    setOpen(true)
  }

  async function updateStatus(status) {
    setWorking(true)
    try {
      if (status === 'approved') {
        const { data: draftItems } = await supabase.from('draft_items').select('*').eq('draft_id', draft.id)
        const barber = barbers.find(b => b.id === draft.barber_id)
        const commission    = barber?.commission_pct || 0
        const tipAmt        = Number(draft.tip) || 0
        const totalServices = Number(draft.total_services) || 0
        const totalProducts = Number(draft.total_products) || 0
        const totalDrinks   = Number(draft.total_drinks) || 0
        const draftSurcharge = Number(draft.surcharge_amt) || 0
        const barberEarnings = totalServices * (commission / 100) + tipAmt
        const shopEarnings   = totalServices * (1 - commission / 100) + totalProducts + totalDrinks + draftSurcharge

        const { data: sale, error: saleErr } = await supabase.from('sales').insert({
          tenant_id:         draft.tenant_id,
          barber_id:         draft.barber_id,
          payment_method_id: draft.payment_method_id,
          tip:               tipAmt,
          total_services:    totalServices,
          total_products:    totalProducts,
          total_drinks:      totalDrinks,
          barber_earnings:   barberEarnings,
          shop_earnings:     shopEarnings,
          surcharge_amt:     draftSurcharge,
          sale_date:         draft.draft_date,
        }).select().single()

        if (saleErr) throw saleErr

        if (draftItems?.length) {
          await supabase.from('sale_items').insert(
            draftItems.map(({ id, draft_id, subtotal, ...rest }) => ({ ...rest, sale_id: sale.id }))
          )
        }
        toast.success('Aprobado y registrado como venta oficial')
      } else {
        toast.success('Borrador descartado')
      }

      await supabase.from('drafts').update({ status }).eq('id', draft.id)
      onStatusChange()
    } catch (e) {
      toast.error(e.message || 'Error al procesar')
    } finally {
      setWorking(false)
    }
  }

  async function openEdit() {
    setLoadingEdit(true)
    try {
      const [{ data: svcs }, { data: prds }, { data: drks }, { data: draftItems }] = await Promise.all([
        supabase.from('services').select('*').eq('tenant_id', draft.tenant_id).eq('is_active', true).order('name'),
        supabase.from('products').select('*').eq('tenant_id', draft.tenant_id).eq('is_active', true).order('name'),
        supabase.from('drinks').select('*').eq('tenant_id', draft.tenant_id).eq('is_active', true).order('name'),
        supabase.from('draft_items').select('*').eq('draft_id', draft.id),
      ])
      setCatalog({ services: svcs || [], products: prds || [], drinks: drks || [] })
      const selSvc = {}, selPrd = {}, selDrk = {}
      ;(draftItems || []).forEach(it => {
        if (it.item_type === 'service') selSvc[it.item_id] = it.quantity
        if (it.item_type === 'product') selPrd[it.item_id] = it.quantity
        if (it.item_type === 'drink')   selDrk[it.item_id] = it.quantity
      })
      setSelServices(selSvc)
      setSelProducts(selPrd)
      setSelDrinks(selDrk)
      setEditBarber(draft.barber_id || '')
      setEditPayment(draft.payment_method_id || '')
      setEditTip(Number(draft.tip) > 0 ? String(draft.tip) : '')
      setEditOpen(true)
    } finally {
      setLoadingEdit(false)
    }
  }

  function toggleItem(setter, item, delta) {
    setter(prev => {
      const next = Math.max(0, (prev[item.id] || 0) + delta)
      if (next === 0) { const { [item.id]: _, ...rest } = prev; return rest }
      return { ...prev, [item.id]: next }
    })
  }

  function calcAmt(sel, list) {
    return Object.entries(sel).reduce((sum, [id, qty]) => {
      const it = list.find(i => i.id === id)
      return sum + (it ? Number(it.price) * qty : 0)
    }, 0)
  }

  const eTotalSvc    = calcAmt(selServices, catalog.services)
  const eTotalPrd    = calcAmt(selProducts, catalog.products)
  const eTotalDrk    = calcAmt(selDrinks,   catalog.drinks)
  const eTipAmt      = Number(editTip) || 0
  const eBase        = eTotalSvc + eTotalPrd + eTotalDrk
  const eSelectedPm  = paymentMethods.find(p => p.id === editPayment)
  const eSurchargePct = Number(eSelectedPm?.surcharge_pct) || 0
  const eSurchargeAmt = eSurchargePct > 0 ? Math.round(eBase * eSurchargePct / 100) : 0
  const eTotal       = eBase + eTipAmt + eSurchargeAmt

  async function handleSave() {
    if (!Object.keys(selServices).length && !Object.keys(selProducts).length && !Object.keys(selDrinks).length)
      return toast.error('Agregá al menos un ítem')
    setSaving(true)
    try {
      await supabase.from('drafts').update({
        barber_id:         editBarber  || null,
        payment_method_id: editPayment || null,
        tip:               eTipAmt,
        total_services:    eTotalSvc,
        total_products:    eTotalPrd,
        total_drinks:      eTotalDrk,
        surcharge_amt:     eSurchargeAmt,
      }).eq('id', draft.id)

      const newItems = [
        ...Object.entries(selServices).map(([id, qty]) => {
          const it = catalog.services.find(s => s.id === id)
          return { draft_id: draft.id, item_type: 'service', item_id: id, name: it.name, price: it.price, quantity: qty }
        }),
        ...Object.entries(selProducts).map(([id, qty]) => {
          const it = catalog.products.find(p => p.id === id)
          return { draft_id: draft.id, item_type: 'product', item_id: id, name: it.name, price: it.price, quantity: qty }
        }),
        ...Object.entries(selDrinks).map(([id, qty]) => {
          const it = catalog.drinks.find(d => d.id === id)
          return { draft_id: draft.id, item_type: 'drink', item_id: id, name: it.name, price: it.price, quantity: qty }
        }),
      ]

      await supabase.from('draft_items').delete().eq('draft_id', draft.id)
      if (newItems.length) await supabase.from('draft_items').insert(newItems)

      toast.success('Borrador actualizado')
      setEditOpen(false)
      setItems(null)
      onStatusChange()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    await supabase.from('draft_items').delete().eq('draft_id', draft.id)
    await supabase.from('drafts').delete().eq('id', draft.id)
    toast.success('Borrador eliminado')
    setDeleteOpen(false)
    onDelete?.()
  }

  const statusColor = { pending: 'text-amber-400', approved: 'text-emerald-400', discarded: 'text-cream/25' }[draft.status]
  const statusLabel = { pending: 'Pendiente', approved: 'Aprobado', discarded: 'Descartado' }[draft.status]

  return (
    <>
      <div className={`border border-dark-400 rounded-xl overflow-hidden ${draft.status === 'discarded' ? 'opacity-40' : ''}`}>
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={toggle} className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="font-display text-base text-gold">${(Number(draft.total) + Number(draft.surcharge_amt || 0)).toLocaleString('es-AR')}</span>
              <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="flex gap-3 mt-0.5 flex-wrap">
              {showDate && <span className="text-gold/50 text-xs">{format(new Date(draft.draft_date + 'T12:00:00'), "d MMM", { locale: es })}</span>}
              <span className="text-cream/30 text-xs">{pm?.name || '—'}</span>
              <span className="text-cream/30 text-xs">{format(new Date(draft.created_at), 'HH:mm')}</span>
              {Number(draft.tip) > 0 && <span className="text-cream/30 text-xs">Propina ${Number(draft.tip).toLocaleString('es-AR')}</span>}
            </div>
          </button>
          {isAdmin && draft.status === 'pending' && (
            <div className="flex gap-1 shrink-0">
              <button onClick={openEdit} disabled={loadingEdit} className="btn-ghost p-1.5">
                <Pencil size={14} className="text-cream/40 hover:text-cream/70" />
              </button>
              <button onClick={() => setDeleteOpen(true)} className="btn-ghost p-1.5 text-red-400/50 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          )}
          <button onClick={toggle} className="shrink-0">
            {open ? <ChevronUp size={14} className="text-cream/30" /> : <ChevronDown size={14} className="text-cream/30" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-dark-400 px-4 py-3">
            {items && items.length > 0 ? (
              <div className="flex flex-col gap-1 mb-3">
                {items.map(it => (
                  <div key={it.id} className="flex justify-between text-sm">
                    <span className="text-cream/60">{it.name}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</span>
                    <span className="text-cream/40">${Number(it.subtotal).toLocaleString('es-AR')}</span>
                  </div>
                ))}
                {Number(draft.tip) > 0 && (
                  <div className="flex justify-between text-sm border-t border-dark-400 pt-1 mt-1">
                    <span className="text-cream/60">Propina</span>
                    <span className="text-gold">${Number(draft.tip).toLocaleString('es-AR')}</span>
                  </div>
                )}
                {Number(draft.surcharge_amt) > 0 && (
                  <div className="flex justify-between text-sm border-t border-dark-400 pt-1 mt-1">
                    <span className="text-cream/60">Recargo {pm?.surcharge_pct}% ({pm?.name})</span>
                    <span className="text-amber-400">+${Number(draft.surcharge_amt).toLocaleString('es-AR')}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-cream/25 text-xs mb-3">Sin detalle de ítems</p>
            )}

            {draft.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  disabled={working}
                  onClick={() => updateStatus('discarded')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <X size={13} /> Descartar
                </button>
                <button
                  disabled={working}
                  onClick={() => updateStatus('approved')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-emerald-500/30 text-emerald-400 text-xs hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                >
                  <Check size={13} /> {working ? 'Procesando...' : 'Aprobar → Oficial'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal edición del borrador */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar borrador" size="md">
        <div className="flex flex-col gap-5">
          {catalog.services.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Servicios</label>
                {eTotalSvc > 0 && <span className="text-gold text-sm font-semibold">${eTotalSvc.toLocaleString('es-AR')}</span>}
              </div>
              <EditItemPicker items={catalog.services} selected={selServices} onToggle={(it, d) => toggleItem(setSelServices, it, d)} />
            </div>
          )}
          {catalog.products.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Vitrina</label>
                {eTotalPrd > 0 && <span className="text-gold text-sm font-semibold">${eTotalPrd.toLocaleString('es-AR')}</span>}
              </div>
              <EditItemPicker items={catalog.products} selected={selProducts} onToggle={(it, d) => toggleItem(setSelProducts, it, d)} />
            </div>
          )}
          {catalog.drinks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Bebidas</label>
                {eTotalDrk > 0 && <span className="text-gold text-sm font-semibold">${eTotalDrk.toLocaleString('es-AR')}</span>}
              </div>
              <EditItemPicker items={catalog.drinks} selected={selDrinks} onToggle={(it, d) => toggleItem(setSelDrinks, it, d)} />
            </div>
          )}
          <div className="border-t border-dark-400/40 pt-4 flex flex-col gap-4">
            <div>
              <label className="label">Barbero</label>
              <select className="input-dark" value={editBarber} onChange={e => setEditBarber(e.target.value)}>
                <option value="">Sin barbero</option>
                {barbers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.commission_pct}%)</option>)}
              </select>
            </div>
            <div>
              <label className="label">Método de pago</label>
              <select className="input-dark" value={editPayment} onChange={e => setEditPayment(e.target.value)}>
                <option value="">—</option>
                {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Propina</label>
              <div className="flex items-center gap-2">
                <span className="text-cream/40 text-sm">$</span>
                <input type="number" min="0" className="input-dark" value={editTip} onChange={e => setEditTip(e.target.value)} placeholder="0" />
              </div>
            </div>
            {eSurchargeAmt > 0 && (
              <div className="flex justify-between text-sm text-amber-400/80 bg-amber-400/8 border border-amber-400/15 rounded-lg px-3 py-2">
                <span>Recargo {eSurchargePct}% ({eSelectedPm?.name})</span>
                <span>+${eSurchargeAmt.toLocaleString('es-AR')}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-cream/40 text-xs">Total{eSurchargeAmt > 0 ? ' a cobrar' : ''}</p>
                <p className="font-display text-2xl text-gold">${eTotal.toLocaleString('es-AR')}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditOpen(false)} className="btn-ghost">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-gold">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Eliminar borrador"
        message="¿Eliminás este borrador? Esta acción no se puede deshacer."
        danger
      />
    </>
  )
}

// ── Item picker para el modal de edición ─────────────────────────────────────
function EditItemPicker({ items, selected, onToggle }) {
  if (items.length === 0) return <p className="text-cream/30 text-xs text-center py-2">Sin ítems</p>
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => {
        const qty = selected[item.id] || 0
        const on  = qty > 0
        return (
          <div key={item.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${on ? 'border-gold/50 bg-gold/8' : 'border-dark-400/60'}`}>
            <button
              onClick={() => onToggle(item, -1)}
              disabled={qty === 0}
              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${qty > 0 ? 'bg-dark-400/60 text-cream/80' : 'bg-dark-400/20 text-cream/20 cursor-default'}`}
            >
              <Minus size={11} />
            </button>
            <button onClick={() => onToggle(item, 1)} className="flex-1 text-left min-w-0">
              <span className={`text-sm font-medium ${on ? 'text-cream' : 'text-cream/65'}`}>
                {item.name}{qty > 1 && <span className="ml-1.5 text-gold text-xs font-bold">×{qty}</span>}
              </span>
            </button>
            <span className={`text-sm shrink-0 ${on ? 'text-gold font-semibold' : 'text-cream/30'}`}>
              ${Number(item.price).toLocaleString('es-AR')}
            </span>
            <button
              onClick={() => onToggle(item, 1)}
              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${on ? 'bg-gold text-ink' : 'bg-dark-400/40 text-cream/50'}`}
            >
              {on ? <Check size={11} strokeWidth={2.5} /> : <Plus size={11} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Venta oficial — con edición/borrado para admin ────────────────────────────
function SaleRow({ sale, barbers, paymentMethods, isAdmin, onRefresh, showDate }) {
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)

  // Edit state
  const [catalog, setCatalog]       = useState({ services: [], products: [], drinks: [] })
  const [selServices, setSelServices] = useState({})
  const [selProducts, setSelProducts] = useState({})
  const [selDrinks, setSelDrinks]   = useState({})
  const [editBarber, setEditBarber]   = useState('')
  const [editPayment, setEditPayment] = useState('')
  const [editTip, setEditTip]         = useState('')

  const pm = paymentMethods.find(p => p.id === sale.payment_method_id)

  async function toggle() {
    if (open) { setOpen(false); return }
    if (!items) {
      const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id)
      setItems(data || [])
    }
    setOpen(true)
  }

  async function openEdit() {
    setLoadingEdit(true)
    try {
      const [{ data: svcs }, { data: prds }, { data: drks }, { data: saleItems }] = await Promise.all([
        supabase.from('services').select('*').eq('tenant_id', sale.tenant_id).eq('is_active', true).order('name'),
        supabase.from('products').select('*').eq('tenant_id', sale.tenant_id).eq('is_active', true).order('name'),
        supabase.from('drinks').select('*').eq('tenant_id', sale.tenant_id).eq('is_active', true).order('name'),
        supabase.from('sale_items').select('*').eq('sale_id', sale.id),
      ])
      setCatalog({ services: svcs || [], products: prds || [], drinks: drks || [] })

      const selSvc = {}, selPrd = {}, selDrk = {}
      ;(saleItems || []).forEach(it => {
        if (it.item_type === 'service') selSvc[it.item_id] = it.quantity
        if (it.item_type === 'product') selPrd[it.item_id] = it.quantity
        if (it.item_type === 'drink')   selDrk[it.item_id] = it.quantity
      })
      setSelServices(selSvc)
      setSelProducts(selPrd)
      setSelDrinks(selDrk)
      setEditBarber(sale.barber_id || '')
      setEditPayment(sale.payment_method_id || '')
      setEditTip(Number(sale.tip) > 0 ? String(sale.tip) : '')
      setEditOpen(true)
    } finally {
      setLoadingEdit(false)
    }
  }

  function toggleItem(setter, item, delta) {
    setter(prev => {
      const next = Math.max(0, (prev[item.id] || 0) + delta)
      if (next === 0) { const { [item.id]: _, ...rest } = prev; return rest }
      return { ...prev, [item.id]: next }
    })
  }

  function calcTotal(sel, list) {
    return Object.entries(sel).reduce((sum, [id, qty]) => {
      const it = list.find(i => i.id === id)
      return sum + (it ? Number(it.price) * qty : 0)
    }, 0)
  }

  const totalServices  = calcTotal(selServices, catalog.services)
  const totalProducts  = calcTotal(selProducts, catalog.products)
  const totalDrinks    = calcTotal(selDrinks,   catalog.drinks)
  const tipAmt         = Number(editTip) || 0
  const sBase          = totalServices + totalProducts + totalDrinks
  const sSelectedPm    = paymentMethods.find(p => p.id === editPayment)
  const sSurchargePct  = Number(sSelectedPm?.surcharge_pct) || 0
  const sSurchargeAmt  = sSurchargePct > 0 ? Math.round(sBase * sSurchargePct / 100) : 0
  const grandTotal     = sBase + tipAmt + sSurchargeAmt

  const selectedBarber   = barbers.find(b => b.id === editBarber)
  const barberEarningsPreview = selectedBarber
    ? totalServices * (selectedBarber.commission_pct / 100) + tipAmt
    : 0

  async function handleSave() {
    if (!Object.keys(selServices).length && !Object.keys(selProducts).length && !Object.keys(selDrinks).length) {
      return toast.error('Agregá al menos un ítem')
    }
    setSaving(true)
    try {
      const commission     = selectedBarber?.commission_pct || 0
      const barberEarnings = totalServices * (commission / 100) + tipAmt
      const shopEarnings   = totalServices * (1 - commission / 100) + totalProducts + totalDrinks + sSurchargeAmt

      await supabase.from('sales').update({
        payment_method_id: editPayment || null,
        barber_id:         editBarber  || null,
        tip:               tipAmt,
        total_services:    totalServices,
        total_products:    totalProducts,
        total_drinks:      totalDrinks,
        barber_earnings:   barberEarnings,
        shop_earnings:     shopEarnings,
        surcharge_amt:     sSurchargeAmt,
      }).eq('id', sale.id)

      const newItems = [
        ...Object.entries(selServices).map(([id, qty]) => {
          const it = catalog.services.find(s => s.id === id)
          return { sale_id: sale.id, item_type: 'service', item_id: id, name: it.name, price: it.price, quantity: qty }
        }),
        ...Object.entries(selProducts).map(([id, qty]) => {
          const it = catalog.products.find(p => p.id === id)
          return { sale_id: sale.id, item_type: 'product', item_id: id, name: it.name, price: it.price, quantity: qty }
        }),
        ...Object.entries(selDrinks).map(([id, qty]) => {
          const it = catalog.drinks.find(d => d.id === id)
          return { sale_id: sale.id, item_type: 'drink', item_id: id, name: it.name, price: it.price, quantity: qty }
        }),
      ]

      await supabase.from('sale_items').delete().eq('sale_id', sale.id)
      if (newItems.length) await supabase.from('sale_items').insert(newItems)

      toast.success('Venta actualizada')
      setEditOpen(false)
      setItems(null) // forzar recarga del detalle
      onRefresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    await supabase.from('sale_items').delete().eq('sale_id', sale.id)
    await supabase.from('sales').delete().eq('id', sale.id)
    toast.success('Venta eliminada')
    setDeleteOpen(false)
    onRefresh()
  }

  return (
    <>
      <div className="border border-dark-400 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={toggle} className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="font-display text-base text-cream">${(Number(sale.total) + Number(sale.surcharge_amt || 0)).toLocaleString('es-AR')}</span>
              <span className="text-xs text-emerald-400/70">Oficial</span>
            </div>
            <div className="flex gap-3 mt-0.5 flex-wrap">
              {showDate && <span className="text-gold/50 text-xs">{format(new Date(sale.sale_date + 'T12:00:00'), "d MMM", { locale: es })}</span>}
              <span className="text-cream/30 text-xs">{pm?.name || '—'}</span>
              <span className="text-cream/30 text-xs">{format(new Date(sale.created_at), 'HH:mm')}</span>
              {Number(sale.tip) > 0 && <span className="text-cream/30 text-xs">Propina ${Number(sale.tip).toLocaleString('es-AR')}</span>}
            </div>
          </button>
          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              <button
                onClick={openEdit}
                disabled={loadingEdit}
                className="btn-ghost p-1.5"
              >
                <Pencil size={14} className="text-cream/40 hover:text-cream/70" />
              </button>
              <button onClick={() => setDeleteOpen(true)} className="btn-ghost p-1.5 text-red-400/50 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          )}
          <button onClick={toggle} className="shrink-0">
            {open ? <ChevronUp size={14} className="text-cream/30" /> : <ChevronDown size={14} className="text-cream/30" />}
          </button>
        </div>

        {open && items && (
          <div className="border-t border-dark-400 px-4 py-3">
            {items.length > 0 ? (
              <div className="flex flex-col gap-1">
                {items.map(it => (
                  <div key={it.id} className="flex justify-between text-sm">
                    <span className="text-cream/60">{it.name}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</span>
                    <span className="text-cream/40">${Number(it.subtotal).toLocaleString('es-AR')}</span>
                  </div>
                ))}
                {Number(sale.tip) > 0 && (
                  <div className="flex justify-between text-sm border-t border-dark-400 pt-1 mt-1">
                    <span className="text-cream/60">Propina</span>
                    <span className="text-gold">${Number(sale.tip).toLocaleString('es-AR')}</span>
                  </div>
                )}
                {Number(sale.surcharge_amt) > 0 && (
                  <div className="flex justify-between text-sm border-t border-dark-400 pt-1 mt-1">
                    <span className="text-cream/60">Recargo {pm?.surcharge_pct}% ({pm?.name})</span>
                    <span className="text-amber-400">+${Number(sale.surcharge_amt).toLocaleString('es-AR')}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-cream/25 text-xs">Sin detalle de ítems</p>
            )}
          </div>
        )}
      </div>

      {/* Modal edición completa */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar venta oficial" size="md">
        <div className="flex flex-col gap-5">

          {/* Servicios */}
          {catalog.services.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Servicios</label>
                {totalServices > 0 && <span className="text-gold text-sm font-semibold">${totalServices.toLocaleString('es-AR')}</span>}
              </div>
              <EditItemPicker items={catalog.services} selected={selServices} onToggle={(it, d) => toggleItem(setSelServices, it, d)} />
            </div>
          )}

          {/* Vitrina */}
          {catalog.products.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Vitrina</label>
                {totalProducts > 0 && <span className="text-gold text-sm font-semibold">${totalProducts.toLocaleString('es-AR')}</span>}
              </div>
              <EditItemPicker items={catalog.products} selected={selProducts} onToggle={(it, d) => toggleItem(setSelProducts, it, d)} />
            </div>
          )}

          {/* Bebidas */}
          {catalog.drinks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Bebidas</label>
                {totalDrinks > 0 && <span className="text-gold text-sm font-semibold">${totalDrinks.toLocaleString('es-AR')}</span>}
              </div>
              <EditItemPicker items={catalog.drinks} selected={selDrinks} onToggle={(it, d) => toggleItem(setSelDrinks, it, d)} />
            </div>
          )}

          <div className="border-t border-dark-400/40 pt-4 flex flex-col gap-4">
            {/* Barbero */}
            <div>
              <label className="label">Barbero</label>
              <select className="input-dark" value={editBarber} onChange={e => setEditBarber(e.target.value)}>
                <option value="">Sin barbero</option>
                {barbers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.commission_pct}%)</option>)}
              </select>
            </div>

            {/* Método de pago */}
            <div>
              <label className="label">Método de pago</label>
              <select className="input-dark" value={editPayment} onChange={e => setEditPayment(e.target.value)}>
                <option value="">—</option>
                {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select>
            </div>

            {/* Propina */}
            <div>
              <label className="label">Propina</label>
              <div className="flex items-center gap-2">
                <span className="text-cream/40 text-sm">$</span>
                <input type="number" min="0" className="input-dark" value={editTip} onChange={e => setEditTip(e.target.value)} placeholder="0" />
              </div>
            </div>

            {/* Preview ganancias */}
            {grandTotal > 0 && selectedBarber && (
              <div className="flex gap-2 text-xs">
                <div className="flex-1 bg-dark-300/60 rounded-lg px-3 py-2">
                  <p className="text-cream/40 mb-0.5">Para {selectedBarber.name}</p>
                  <p className="text-gold font-semibold">${barberEarningsPreview.toLocaleString('es-AR')}</p>
                </div>
                <div className="flex-1 bg-dark-300/60 rounded-lg px-3 py-2">
                  <p className="text-cream/40 mb-0.5">Para el local</p>
                  <p className="text-cream font-semibold">${(grandTotal - barberEarningsPreview).toLocaleString('es-AR')}</p>
                </div>
              </div>
            )}

            {/* Recargo */}
            {sSurchargeAmt > 0 && (
              <div className="flex justify-between text-sm text-amber-400/80 bg-amber-400/8 border border-amber-400/15 rounded-lg px-3 py-2">
                <span>Recargo {sSurchargePct}% ({sSelectedPm?.name})</span>
                <span>+${sSurchargeAmt.toLocaleString('es-AR')}</span>
              </div>
            )}

            {/* Total + acciones */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-cream/40 text-xs">Total{sSurchargeAmt > 0 ? ' a cobrar' : ''}</p>
                <p className="font-display text-2xl text-gold">${grandTotal.toLocaleString('es-AR')}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditOpen(false)} className="btn-ghost">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-gold">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Eliminar venta"
        message="¿Eliminás esta venta oficial? Esta acción no se puede deshacer."
        danger
      />
    </>
  )
}

// ── Sección de un barbero ─────────────────────────────────────────────────────
function BarberSection({ barber, drafts, sales, barbers, paymentMethods, isAdmin, isSingle, onRefresh }) {
  const [tab, setTab] = useState('drafts')

  const pendingCount  = drafts.filter(d => d.status === 'pending').length
  const draftTotal    = drafts.filter(d => d.status !== 'discarded').reduce((s, d) => s + Number(d.total) + Number(d.surcharge_amt || 0), 0)
  const officialTotal = sales.reduce((s, r) => s + Number(r.total) + Number(r.surcharge_amt || 0), 0)
  const match         = draftTotal > 0 && officialTotal > 0 && draftTotal === officialTotal

  return (
    <div className="card mb-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-dark-300 flex items-center justify-center font-display text-gold text-lg shrink-0">
          {barber.name[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-cream">{barber.name}</span>
            {pendingCount > 0 && (
              <span className="bg-amber-500/15 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-cream/40 text-xs">Reportó <span className="text-gold">${draftTotal.toLocaleString('es-AR')}</span></span>
            <span className="text-cream/20 text-xs">·</span>
            <span className="text-cream/40 text-xs">Oficial <span className="text-cream/70">${officialTotal.toLocaleString('es-AR')}</span></span>
            {match && <CheckCircle2 size={13} className="text-emerald-400" />}
            {!match && draftTotal > 0 && officialTotal > 0 && <AlertTriangle size={13} className="text-amber-400" />}
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-dark-300/60 p-1 rounded-lg mb-4">
        <button
          onClick={() => setTab('drafts')}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${tab === 'drafts' ? 'bg-dark-200 text-gold shadow-sm' : 'text-cream/50 hover:text-cream/70'}`}
        >
          Borradores ({drafts.length})
        </button>
        <button
          onClick={() => setTab('sales')}
          className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${tab === 'sales' ? 'bg-dark-200 text-cream shadow-sm' : 'text-cream/50 hover:text-cream/70'}`}
        >
          Oficial ({sales.length})
        </button>
      </div>

      {tab === 'drafts' ? (
        drafts.length === 0
          ? <p className="text-cream/25 text-sm text-center py-3">Sin borradores este día</p>
          : <div className="flex flex-col gap-2">
              {drafts.map(d => (
                <DraftRow key={d.id} draft={d} barbers={barbers} paymentMethods={paymentMethods} onStatusChange={onRefresh} showDate={!isSingle} isAdmin={isAdmin} onDelete={onRefresh} />
              ))}
            </div>
      ) : (
        <div>
          {isAdmin && (
            <Link
              to={`/admin/sales`}
              className="flex items-center justify-center gap-2 py-2.5 mb-3 rounded-lg border border-dashed border-dark-400 text-cream/40 hover:border-gold/40 hover:text-gold text-xs transition-colors"
            >
              <Plus size={14} /> Registrar nueva venta
            </Link>
          )}
          {sales.length === 0
            ? <p className="text-cream/25 text-sm text-center py-3">Sin ventas oficiales este día</p>
            : <div className="flex flex-col gap-2">
                {sales.map(s => (
                  <SaleRow key={s.id} sale={s} barbers={barbers} paymentMethods={paymentMethods} isAdmin={isAdmin} onRefresh={onRefresh} showDate={!isSingle} />
                ))}
              </div>
          }
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function DraftsPage() {
  const { tenant, isAdmin } = useAuth()
  const today = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(today)
  const [to, setTo]     = useState(today)
  const [drafts, setDrafts] = useState([])
  const [sales, setSales] = useState([])
  const [barbers, setBarbers] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenant?.id) return
    Promise.all([
      supabase.from('barbers').select('*').eq('tenant_id', tenant.id),
      supabase.from('payment_methods').select('*').eq('tenant_id', tenant.id),
    ]).then(([b, pm]) => {
      setBarbers(b.data || [])
      setPaymentMethods(pm.data || [])
    })
  }, [tenant?.id])

  useEffect(() => {
    if (!tenant?.id) return
    load()
  }, [tenant?.id, from, to])

  async function load() {
    setLoading(true)
    const [{ data: draftData }, { data: salesData }] = await Promise.all([
      supabase.from('drafts').select('*').eq('tenant_id', tenant.id).gte('draft_date', from).lte('draft_date', to).order('created_at'),
      supabase.from('sales').select('*').eq('tenant_id', tenant.id).gte('sale_date', from).lte('sale_date', to).order('created_at'),
    ])
    setDrafts(draftData || [])
    setSales(salesData || [])
    setLoading(false)
  }

  const activeBarbers   = barbers.filter(b =>
    drafts.some(d => d.barber_id === b.id) || sales.some(s => s.barber_id === b.id)
  )
  const shopOnlySales   = sales.filter(s => !s.barber_id)
  const orphanDrafts    = drafts.filter(d => !d.barber_id)
  const totalPending    = drafts.filter(d => d.status === 'pending').length
  const isSingle        = from === to

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="section-title">Registros</h1>
            <p className="section-sub capitalize">{dateRangeLabel(from, to)}</p>
          </div>
        </div>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      {totalPending > 0 && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 mb-4">
          <AlertTriangle size={15} className="text-amber-400 shrink-0" />
          <p className="text-amber-400 text-sm">{totalPending} pendiente{totalPending > 1 ? 's' : ''} — al aprobar se convierte en venta oficial</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeBarbers.length === 0 && shopOnlySales.length === 0 && orphanDrafts.length === 0 ? (
        <EmptyState icon={FileText} title="Sin actividad este día" description="No hay borradores ni ventas registradas para esta fecha" />
      ) : (
        <>
          {activeBarbers.map(barber => (
            <BarberSection
              key={barber.id}
              barber={barber}
              drafts={drafts.filter(d => d.barber_id === barber.id)}
              sales={sales.filter(s => s.barber_id === barber.id)}
              barbers={barbers}
              paymentMethods={paymentMethods}
              isAdmin={isAdmin}
              isSingle={isSingle}
              onRefresh={load}
            />
          ))}

          {orphanDrafts.length > 0 && (
            <div className="card mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-dark-300 flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-amber-400/60" />
                </div>
                <div>
                  <p className="font-medium text-cream">Borradores sin barbero</p>
                  <p className="text-cream/40 text-xs">Registrados sin asignar a un barbero</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {orphanDrafts.map(d => (
                  <DraftRow key={d.id} draft={d} barbers={barbers} paymentMethods={paymentMethods} onStatusChange={load} showDate={!isSingle} isAdmin={isAdmin} onDelete={load} />
                ))}
              </div>
            </div>
          )}

          {shopOnlySales.length > 0 && (
            <div className="card mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-dark-300 flex items-center justify-center shrink-0">
                  <Receipt size={18} className="text-cream/40" />
                </div>
                <div>
                  <p className="font-medium text-cream">Solo local</p>
                  <p className="text-cream/40 text-xs">Ventas sin barbero · vitrina y bebidas</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {shopOnlySales.map(s => (
                  <SaleRow key={s.id} sale={s} barbers={barbers} paymentMethods={paymentMethods} isAdmin={isAdmin} onRefresh={load} showDate={!isSingle} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
