import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Search, Contact, AlertTriangle, Pencil, Trash2, MessageCircle, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { CustomerForm } from '../../components/ui/CustomerPicker'
import { createCustomer, updateCustomer, fetchAllRows, waLink } from '../../lib/customers'
import toast from 'react-hot-toast'

function fmt(n) { return Number(n || 0).toLocaleString('es-AR') }
function dayLabel(d) { return format(new Date(d + 'T12:00:00'), "d MMM yyyy", { locale: es }) }
const saleTotal = s => Number(s.total_services || 0) + Number(s.total_products || 0) + Number(s.total_drinks || 0) + Number(s.tip || 0) + Number(s.surcharge_amt || 0)

export default function CustomersPage() {
  const { tenant } = useAuth()
  const [customers, setCustomers] = useState([])
  const [visits, setVisits]       = useState([])   // ventas con cliente
  const [barbers, setBarbers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [q, setQ]                 = useState('')
  const [creating, setCreating]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [openId, setOpenId]       = useState(null)
  const [editing, setEditing]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    if (!tenant?.id) return
    let alive = true
    setLoading(true)
    setLoadError(false)
    ;(async () => {
      try {
        const [c, v, b] = await Promise.all([
          fetchAllRows(() => supabase.from('customers').select('*').eq('tenant_id', tenant.id).order('id')),
          fetchAllRows(() => supabase.from('sales')
            .select('id,customer_id,sale_date,barber_id,total_services,total_products,total_drinks,tip,surcharge_amt')
            .eq('tenant_id', tenant.id).not('customer_id', 'is', null).order('id')),
          supabase.from('barbers').select('id,name').eq('tenant_id', tenant.id).then(r => { if (r.error) throw r.error; return r.data || [] }),
        ])
        if (!alive) return
        setCustomers(c)
        setVisits(v)
        setBarbers(b)
      } catch {
        if (alive) setLoadError(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [tenant?.id, reloadKey])

  function reload() { setReloadKey(k => k + 1) }

  // Visitas agrupadas por cliente, de la más reciente a la más vieja
  const byCustomer = useMemo(() => {
    const map = {}
    for (const s of visits) (map[s.customer_id] ||= []).push(s)
    for (const id in map) map[id].sort((a, b) => b.sale_date.localeCompare(a.sale_date))
    return map
  }, [visits])

  const monthStart = format(new Date(), 'yyyy-MM-01')

  const rows = useMemo(() => {
    const list = customers.map(c => {
      const v = byCustomer[c.id] || []
      return {
        ...c,
        visits: v,
        last:  v[0]?.sale_date || null,
        first: v.length ? v[v.length - 1].sale_date : null,
        spent: v.reduce((sum, s) => sum + saleTotal(s), 0),
      }
    })
    // Primero los que vinieron hace menos; los que nunca vinieron, al final por fecha de alta
    list.sort((a, b) => (b.last || '').localeCompare(a.last || '') || (b.created_at || '').localeCompare(a.created_at || ''))
    return list
  }, [customers, byCustomer])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    const digits = t.replace(/\D/g, '')
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(t) ||
      (digits.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(digits)))
  }, [rows, q])

  const newThisMonth = rows.filter(r => r.first && r.first >= monthStart).length
  const open = rows.find(r => r.id === openId) || null
  const barberName = id => barbers.find(b => b.id === id)?.name || 'Solo local'

  async function handleCreate(form) {
    setSaving(true)
    try {
      const { customer, existed } = await createCustomer(tenant.id, form)
      if (existed) toast(`Ese celular ya era de ${customer.name || 'un cliente'}`, { icon: 'ℹ️' })
      else toast.success('Cliente creado')
      setCreating(false)
      reload()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(form) {
    setSaving(true)
    try {
      await updateCustomer(tenant.id, open.id, form)
      toast.success('Cliente actualizado')
      setEditing(false)
      reload()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id)
    if (error) return toast.error(error.message)
    toast.success('Cliente eliminado')
    setDeleteTarget(null)
    setOpenId(null)
    reload()
  }

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="section-title">Clientes</h1>
          <p className="section-sub">
            {customers.length} en total
            {newThisMonth > 0 && <span className="text-emerald-400"> · {newThisMonth} nuevo{newThisMonth === 1 ? '' : 's'} este mes</span>}
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-gold flex items-center gap-2 text-sm shrink-0">
          <Plus size={16} /> Nuevo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <div className="card flex flex-col items-center text-center gap-3 py-10">
          <AlertTriangle size={22} className="text-amber-400" />
          <p className="text-cream/70 text-sm">No se pudo cargar. Puede ser la conexión.</p>
          <button onClick={reload} className="btn-outline-gold text-sm">Reintentar</button>
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Contact}
          title="Todavía no hay clientes"
          description="Cargalos acá o directamente al registrar una venta. Así ves cuándo vino cada uno y cuántos clientes nuevos entran."
          action={<button onClick={() => setCreating(true)} className="btn-gold">Cargar cliente</button>}
        />
      ) : (
        <>
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream/35" />
            <input className="input-dark pl-10" placeholder="Buscar por nombre o celular..." value={q} onChange={e => setQ(e.target.value)} />
          </div>

          {filtered.length === 0 ? (
            <p className="text-cream/30 text-sm text-center py-10">Nadie coincide con «{q}».</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(r => {
                const isNew = r.first && r.first >= monthStart
                return (
                  <button key={r.id} onClick={() => { setOpenId(r.id); setEditing(false) }}
                    className="card card-hover !py-3 flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-2xl bg-gold/12 border border-gold/20 flex items-center justify-center font-display text-gold shrink-0">
                      {(r.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-cream text-sm font-medium truncate">{r.name || 'Sin nombre'}</span>
                        {isNew && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">Nuevo</span>}
                      </div>
                      <p className="text-cream/40 text-xs truncate mt-0.5">
                        {r.visits.length
                          ? `${r.visits.length} visita${r.visits.length === 1 ? '' : 's'} · última ${dayLabel(r.last)}`
                          : 'Sin visitas todavía'}
                        {r.phone ? ` · ${r.phone}` : ''}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-cream/25 shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Alta ── */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo cliente">
        <CustomerForm onSubmit={handleCreate} onCancel={() => setCreating(false)} submitLabel="Crear cliente" saving={saving} />
      </Modal>

      {/* ── Ficha del cliente ── */}
      <Modal open={!!open} onClose={() => setOpenId(null)} title={editing ? 'Editar cliente' : (open?.name || 'Cliente')}>
        {open && (editing ? (
          <CustomerForm initial={open} onSubmit={handleUpdate} onCancel={() => setEditing(false)} saving={saving} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-cream/45 text-xs">{open.phone || 'Sin celular'}</p>
                {open.first && <p className="text-cream/30 text-xs mt-0.5">Cliente desde el {dayLabel(open.first)}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {waLink(open.phone) && (
                  <a href={waLink(open.phone)} target="_blank" rel="noreferrer" className="btn-ghost p-2" title="WhatsApp">
                    <MessageCircle size={16} className="text-emerald-400" />
                  </a>
                )}
                <button onClick={() => setEditing(true)} className="btn-ghost p-2" title="Editar"><Pencil size={15} className="text-cream/50" /></button>
                <button onClick={() => setDeleteTarget(open)} className="btn-ghost p-2" title="Eliminar"><Trash2 size={15} className="text-red-400/70" /></button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-dark-300/60 rounded-xl px-3 py-2.5">
                <p className="text-cream/40 text-[11px] uppercase tracking-wider">Visitas</p>
                <p className="font-display text-2xl text-cream">{open.visits.length}</p>
              </div>
              <div className="bg-dark-300/60 rounded-xl px-3 py-2.5">
                <p className="text-cream/40 text-[11px] uppercase tracking-wider">Gastó</p>
                <p className="font-display text-2xl text-gold">${fmt(open.spent)}</p>
              </div>
            </div>

            <div>
              <p className="label mb-2">Fechas que vino</p>
              {open.visits.length === 0 ? (
                <p className="text-cream/30 text-sm py-3">Todavía no tiene ventas. Elegilo como cliente al registrar una venta.</p>
              ) : (
                <div className="border border-dark-400/60 rounded-xl overflow-hidden">
                  {open.visits.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-dark-400/25 last:border-0">
                      <div className="min-w-0">
                        <p className="text-cream/80 text-sm capitalize">
                          {dayLabel(s.sale_date)}
                          {i === open.visits.length - 1 && <span className="ml-2 text-[10px] text-emerald-400 normal-case">primera vez</span>}
                        </p>
                        <p className="text-cream/35 text-xs">{barberName(s.barber_id)}</p>
                      </div>
                      <span className="text-cream/60 text-sm shrink-0">${fmt(saleTotal(s))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? `Eliminar a ${deleteTarget.name || 'este cliente'}` : 'Eliminar cliente'}
        message="Se borra el cliente de la lista. Sus ventas no se tocan: quedan registradas igual, solo sin el nombre del cliente."
        danger
      />
    </div>
  )
}
