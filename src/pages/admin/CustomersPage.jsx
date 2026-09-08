import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, Plus, Contact, MessageCircle, Phone, Trash2, Save,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import StarMeter from '../../components/booking/StarMeter'
import {
  fmtDayShort, waLink, telLink, normPhone, customerUpsert,
  STATUS_LABEL, STATUS_BADGE,
} from '../../lib/booking'
import toast from 'react-hot-toast'

export default function CustomersPage() {
  const { tenant, loyaltyEnabled, loyaltyMin } = useAuth()
  const [customers, setCustomers] = useState([])
  const [appts, setAppts] = useState([])
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [c, a, b] = await Promise.all([
      supabase.from('customers').select('*').eq('tenant_id', tenant.id),
      supabase.from('appointments').select('id, customer_id, status, starts_at, service_name, service_price, barber_id')
        .eq('tenant_id', tenant.id).order('starts_at', { ascending: false }),
      supabase.from('barbers').select('id, name').eq('tenant_id', tenant.id),
    ])
    setCustomers(c.data || [])
    setAppts(a.data || [])
    setBarbers(b.data || [])
    setLoading(false)
  }, [tenant?.id])

  useEffect(() => { load() }, [load])

  const barberName = useMemo(() => Object.fromEntries(barbers.map(b => [b.id, b.name])), [barbers])

  const stats = useMemo(() => {
    const m = {}
    for (const a of appts) {
      if (!a.customer_id) continue
      const s = (m[a.customer_id] ||= { visits: 0, last: null, total: 0 })
      s.total++
      if (a.status === 'completed') {
        s.visits++
        if (!s.last || a.starts_at > s.last) s.last = a.starts_at
      }
    }
    return m
  }, [appts])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const key = normPhone(q)
    return customers
      .filter(c => {
        if (!t) return true
        return (c.name || '').toLowerCase().includes(t) || (c.phone_key || '').includes(key || '_')
      })
      .map(c => ({ ...c, st: stats[c.id] || { visits: 0, last: null, total: 0 } }))
      .sort((a, b) => (b.st.last || '').localeCompare(a.st.last || '') || (a.name || '').localeCompare(b.name || ''))
  }, [customers, stats, q])

  const history = useMemo(() => {
    if (!selected) return []
    return appts.filter(a => a.customer_id === selected.id)
  }, [appts, selected])

  // Refresca la ficha abierta y la lista (después de un canje)
  async function refreshSelected() {
    if (!selected) return
    const { data } = await supabase.from('customers').select('*').eq('id', selected.id).maybeSingle()
    if (data) setSelected(data)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="section-title">Clientes</h1>
          <p className="section-sub">{customers.length} en total</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-gold flex items-center gap-2 text-sm">
          <Plus size={16} /> Cliente
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream/35" />
        <input className="input-dark pl-10" placeholder="Buscar por nombre o teléfono..."
               value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={24} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Contact} title="Sin clientes"
          description={q ? 'Nadie coincide con la búsqueda.' : 'Se van sumando solos cuando alguien saca un turno.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(c => (
            <button key={c.id} onClick={() => setSelected(c)} className="card !p-4 flex items-center gap-3 text-left hover:border-gold/40 transition-colors">
              <div className="w-10 h-10 rounded-full bg-gold/12 border border-gold/20 flex items-center justify-center font-display text-gold shrink-0">
                {(c.name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-cream text-sm font-medium truncate">{c.name || 'Sin nombre'}</p>
                <p className="text-cream/45 text-xs mt-0.5">
                  {c.phone || c.phone_key}
                  {c.st.visits > 0 && <span className="text-cream/30"> · {c.st.visits} corte{c.st.visits === 1 ? '' : 's'}</span>}
                </p>
                {loyaltyEnabled && (Number(c.stars) > 0 || Number(c.redemptions) > 0) && (
                  <div className="mt-1.5"><StarMeter customer={c} min={loyaltyMin} compact /></div>
                )}
              </div>
              {c.st.last && (
                <span className="text-cream/30 text-[11px] shrink-0 text-right">
                  último<br /><span className="text-cream/50">{fmtDayShort(c.st.last)}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detalle */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Cliente" size="lg">
        {selected && (
          <CustomerDetail
            customer={selected} history={history} barberName={barberName}
            loyalty={loyaltyEnabled ? { enabled: true, min: loyaltyMin } : null}
            onRedeemed={refreshSelected}
            onClose={() => setSelected(null)}
            onSaved={() => { setSelected(null); load() }}
          />
        )}
      </Modal>

      {/* Alta manual */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo cliente">
        <NewCustomer tenantId={tenant?.id} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />
      </Modal>
    </div>
  )
}

function CustomerDetail({ customer, history, barberName, loyalty, onRedeemed, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: customer.name || '', email: customer.email || '', notes: customer.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('customers')
      .update({ name: form.name.trim() || null, email: form.email.trim() || null, notes: form.notes.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', customer.id)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Cliente guardado')
    onSaved()
  }

  async function del() {
    setConfirmDel(false)
    const { error } = await supabase.from('customers').delete().eq('id', customer.id)
    if (error) return toast.error(error.message)
    toast.success('Cliente eliminado')
    onSaved()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {customer.phone && (
          <>
            <a href={waLink(customer.phone, `Hola ${(form.name || '').split(' ')[0]}!`)} target="_blank" rel="noreferrer"
               className="flex items-center gap-1.5 text-emerald-400/80 hover:text-emerald-400 text-xs border border-emerald-400/25 rounded-lg px-2.5 py-1.5">
              <MessageCircle size={13} /> WhatsApp
            </a>
            <a href={telLink(customer.phone)}
               className="flex items-center gap-1.5 text-cream/55 hover:text-cream text-xs border border-dark-400 rounded-lg px-2.5 py-1.5">
              <Phone size={13} /> {customer.phone}
            </a>
          </>
        )}
      </div>

      {loyalty?.enabled && (
        <div className="rounded-xl border border-gold/25 bg-gold/8 p-3">
          <p className="text-cream/50 text-[11px] uppercase tracking-wide mb-2">Estrellas</p>
          <StarMeter customer={customer} min={loyalty.min} onRedeemed={onRedeemed} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Nombre</label>
          <input className="input-dark" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input-dark" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">Notas</label>
        <textarea className="input-dark min-h-[3.5rem]" placeholder="Ej: alérgico a X, prefiere tijera, cliente de Mateo..."
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>

      <div>
        <p className="label">Historial de cortes ({history.length})</p>
        {history.length === 0 ? (
          <p className="text-cream/30 text-sm">Todavía sin turnos.</p>
        ) : (
          <div className="flex flex-col divide-y divide-dark-300 max-h-56 overflow-y-auto">
            {history.map(a => (
              <div key={a.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="text-cream/40 text-xs w-24 shrink-0">{fmtDayShort(a.starts_at)}</span>
                <span className="text-cream/75 flex-1 min-w-0 truncate">{a.service_name}</span>
                <span className="text-cream/35 text-xs shrink-0">{barberName[a.barber_id] || '—'}</span>
                <span className={`${STATUS_BADGE[a.status]} shrink-0`}>{STATUS_LABEL[a.status]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-2">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button onClick={onClose} className="btn-ghost">Cerrar</button>
        <button onClick={() => setConfirmDel(true)} className="btn-ghost ml-auto text-red-400/70 hover:text-red-400 flex items-center gap-1.5">
          <Trash2 size={14} /> Eliminar
        </button>
      </div>

      <ConfirmDialog
        open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={del}
        title="Eliminar cliente" danger
        message="Se borra el cliente. Sus turnos quedan pero sin cliente asociado."
      />
    </div>
  )
}

function NewCustomer({ tenantId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim() || !normPhone(form.phone)) return toast.error('Nombre y teléfono válido son obligatorios')
    setSaving(true)
    const id = await customerUpsert(supabase, { tenantId, phone: form.phone, name: form.name, email: form.email })
    if (id) {
      // completar/pisar con lo que cargó el admin
      await supabase.from('customers').update({
        name: form.name.trim(), email: form.email.trim() || null, updated_at: new Date().toISOString(),
      }).eq('id', id)
    }
    setSaving(false)
    if (!id) return toast.error('No se pudo crear. ¿Corriste la migración de clientes?')
    toast.success('Cliente creado')
    onSaved()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="label">Nombre completo *</label>
        <input className="input-dark" value={form.name} autoFocus onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Teléfono *</label>
          <input className="input-dark" inputMode="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input-dark" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn-gold flex-1">{saving ? 'Guardando...' : 'Crear'}</button>
      </div>
    </div>
  )
}
