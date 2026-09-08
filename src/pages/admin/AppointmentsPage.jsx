import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, MessageCircle, Phone,
  Check, X, UserX, Pencil, Trash2, ShoppingBag, MoreVertical,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import { qAll } from '../../lib/query'
import WeekAgenda from '../../components/booking/WeekAgenda'
import {
  fmtTime, fmtDay, fmtDayShort, fmtMoney, fmtDuration, waLink, telLink, customerUpsert,
  dayStart, addDays,
  STATUS_LABEL, STATUS_BADGE,
} from '../../lib/booking'
import toast from 'react-hot-toast'

// ── helpers de fecha ────────────────────────────────────────
const mondayOf = d => { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const toDateInput = d => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const toDatetimeInput = d => {
  const x = new Date(d)
  return `${toDateInput(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}
const isToday = d => toDateInput(d) === toDateInput(new Date())

const STATUS_FILTERS = [
  { v: 'all',       label: 'Todos' },
  { v: 'active',    label: 'Vigentes' },
  { v: 'completed', label: 'Atendidos' },
  { v: 'cancelled', label: 'Cancelados' },
]

export default function AppointmentsPage() {
  const { tenant } = useAuth()
  const navigate = useNavigate()

  const [view, setView] = useState(() => {
    try { return localStorage.getItem('mb_agenda_view') || 'week' } catch { return 'week' }
  })
  const [date, setDate] = useState(dayStart(new Date()))
  const [appts, setAppts] = useState([])
  const [barbers, setBarbers] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  const isWeek = view === 'week'
  const weekStart = useMemo(() => mondayOf(date), [date])
  function switchView(v) {
    setView(v)
    try { localStorage.setItem('mb_agenda_view', v) } catch { /* ignore */ }
  }

  const [barberFilter, setBarberFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [menuId, setMenuId] = useState(null)
  const [visitsBefore, setVisitsBefore] = useState({})  // appt.id -> cortes completados previos del cliente

  const load = useCallback(async () => {
    if (!tenant?.id) return
    setLoading(true)
    const start = isWeek ? mondayOf(date) : dayStart(date)
    const from = start.toISOString()
    const to = addDays(start, isWeek ? 7 : 1).toISOString()
    try {
      const [a, b, s] = await qAll([
        x => x.from('appointments').select('*').eq('tenant_id', tenant.id)
              .gte('starts_at', from).lt('starts_at', to).order('starts_at'),
        x => x.from('barbers').select('id, name, is_active').eq('tenant_id', tenant.id).order('name'),
        x => x.from('services').select('id, name, price, duration_min').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      ])
      setAppts(a || [])
      setBarbers(b || [])
      setServices(s || [])

      // cortes previos de cada cliente (para el badge "cliente nuevo / Nª visita")
      const custIds = [...new Set((a || []).map(x => x.customer_id).filter(Boolean))]
      if (custIds.length) {
        const { data: hist } = await supabase.from('appointments')
          .select('customer_id, starts_at')
          .eq('tenant_id', tenant.id).eq('status', 'completed').in('customer_id', custIds)
        const map = {}
        for (const appt of a || []) {
          if (!appt.customer_id) continue
          map[appt.id] = (hist || []).filter(h => h.customer_id === appt.customer_id && h.starts_at < appt.starts_at).length
        }
        setVisitsBefore(map)
      } else {
        setVisitsBefore({})
      }
    } catch {
      toast.error('No se pudo cargar la agenda')
    } finally {
      setLoading(false)
    }
  }, [tenant?.id, date, isWeek])

  useEffect(() => { load() }, [load])

  const barberName = useMemo(
    () => Object.fromEntries(barbers.map(b => [b.id, b.name])),
    [barbers],
  )

  const visible = useMemo(() => appts.filter(a => {
    if (barberFilter !== 'all' && a.barber_id !== barberFilter) return false
    if (statusFilter === 'active'    && !['pending', 'confirmed'].includes(a.status)) return false
    if (statusFilter === 'completed' && !['completed', 'no_show'].includes(a.status)) return false
    if (statusFilter === 'cancelled' && a.status !== 'cancelled') return false
    return true
  }), [appts, barberFilter, statusFilter])

  const counts = useMemo(() => {
    const c = { total: appts.length, active: 0, done: 0 }
    for (const a of appts) {
      if (['pending', 'confirmed'].includes(a.status)) c.active++
      if (a.status === 'completed') c.done++
    }
    return c
  }, [appts])

  async function setStatus(a, status) {
    setMenuId(null)
    const { error } = await supabase.from('appointments')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', a.id)
    if (error) return toast.error(error.message)
    toast.success(`Turno: ${STATUS_LABEL[status].toLowerCase()}`)
    load()
  }

  async function handleDelete() {
    const a = deleteTarget
    setDeleteTarget(null)
    const { error } = await supabase.from('appointments').delete().eq('id', a.id)
    if (error) return toast.error(error.message)
    toast.success('Turno eliminado')
    load()
  }

  function loadAsSale(a) {
    setMenuId(null)
    navigate('/admin/sales', { state: { prefill: { barberId: a.barber_id, serviceId: a.service_id, appointmentId: a.id } } })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="section-title">Agenda</h1>
          <p className="section-sub">
            {counts.active} vigente{counts.active === 1 ? '' : 's'} · {counts.total} turno{counts.total === 1 ? '' : 's'} {isWeek ? 'esta semana' : 'este día'}
          </p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true) }} className="btn-gold flex items-center gap-2 text-sm">
          <Plus size={16} /> Turno
        </button>
      </div>

      {/* Toggle vista + navegador */}
      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-dark-400 overflow-hidden shrink-0">
          {[['week', 'Semana'], ['day', 'Día']].map(([v, l]) => (
            <button key={v} onClick={() => switchView(v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? 'bg-gold/15 text-gold' : 'text-cream/50 hover:text-cream'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="card !p-1.5 flex items-center gap-1 flex-1">
          <button onClick={() => setDate(d => addDays(d, isWeek ? -7 : -1))} className="btn-ghost p-2"><ChevronLeft size={16} /></button>
          <div className="flex-1 text-center min-w-0">
            {isWeek ? (
              <>
                <p className="text-cream text-sm font-medium">
                  {fmtDayShort(weekStart).replace(/^\w+,\s*/, '')} – {fmtDayShort(addDays(weekStart, 6)).replace(/^\w+,\s*/, '')}
                </p>
                <p className="text-cream/40 text-xs">Semana</p>
              </>
            ) : (
              <>
                <input type="date" value={toDateInput(date)}
                       onChange={e => e.target.value && setDate(dayStart(new Date(e.target.value + 'T12:00')))}
                       className="bg-transparent text-cream text-sm font-medium text-center outline-none w-full" />
                <p className="text-cream/40 text-xs capitalize">{fmtDay(date)}</p>
              </>
            )}
          </div>
          <button onClick={() => setDate(d => addDays(d, isWeek ? 7 : 1))} className="btn-ghost p-2"><ChevronRight size={16} /></button>
          {!isToday(date) && (
            <button onClick={() => setDate(dayStart(new Date()))} className="btn-ghost text-xs px-2">Hoy</button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={barberFilter} onChange={e => setBarberFilter(e.target.value)}
                className="input-dark !w-auto !py-1.5 text-xs">
          <option value="all">Todos los barberos</option>
          {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {STATUS_FILTERS.map(f => (
          <button key={f.v} onClick={() => setStatusFilter(f.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              statusFilter === f.v ? 'bg-gold/15 border-gold text-gold' : 'border-dark-400 text-cream/50 hover:text-cream'
            }`}>{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={24} /></div>
      ) : isWeek ? (
        <>
          <WeekAgenda
            appointments={visible}
            weekStart={weekStart}
            barberName={barberName}
            showBarber={barberFilter === 'all'}
            onSelect={a => { setEditing(a); setFormOpen(true) }}
          />
          <p className="text-cream/30 text-[11px] mt-2 text-center">Tocá un turno para editarlo · deslizá para ver toda la semana</p>
        </>
      ) : visible.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Sin turnos" description="No hay turnos para este día con los filtros elegidos." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map(a => {
            const cancelledLike = ['cancelled', 'no_show'].includes(a.status)
            return (
              <div key={a.id} className={`card !p-4 ${cancelledLike ? 'opacity-55' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="text-center shrink-0 w-14">
                    <p className="font-display text-gold text-base leading-none">{fmtTime(a.starts_at)}</p>
                    <p className="text-cream/30 text-[10px] mt-1">{fmtDuration(a.duration_min)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-cream text-sm font-medium">{a.customer_name}</span>
                      <span className={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status]}</span>
                      {a.customer_id && (
                        visitsBefore[a.id] > 0
                          ? <span className="text-cream/35 text-[10px] uppercase tracking-wide">{visitsBefore[a.id] + 1}ª visita</span>
                          : <span className="text-gold/70 text-[10px] uppercase tracking-wide font-semibold">cliente nuevo</span>
                      )}
                      {a.source === 'admin' && <span className="text-cream/25 text-[10px] uppercase tracking-wide">manual</span>}
                    </div>
                    <p className="text-cream/55 text-xs mt-0.5">
                      {a.service_name} · {fmtMoney(a.service_price)} · con {barberName[a.barber_id] || '—'}
                    </p>
                    {a.notes && <p className="text-cream/40 text-xs mt-1 italic">“{a.notes}”</p>}
                    {a.admin_notes && <p className="text-amber-400/60 text-xs mt-1">Nota: {a.admin_notes}</p>}

                    <div className="flex items-center gap-1.5 mt-2">
                      {a.customer_phone && (
                        <>
                          <a href={waLink(a.customer_phone, `Hola ${a.customer_name.split(' ')[0]}! Te escribo de ${tenant.name} por tu turno del ${fmtDay(a.starts_at)} a las ${fmtTime(a.starts_at)}.`)}
                             target="_blank" rel="noreferrer"
                             className="flex items-center gap-1 text-emerald-400/80 hover:text-emerald-400 text-xs border border-emerald-400/25 rounded-lg px-2 py-1">
                            <MessageCircle size={12} /> WhatsApp
                          </a>
                          <a href={telLink(a.customer_phone)}
                             className="flex items-center gap-1 text-cream/50 hover:text-cream text-xs border border-dark-400 rounded-lg px-2 py-1">
                            <Phone size={12} /> {a.customer_phone}
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Menú de acciones */}
                  <div className="relative shrink-0">
                    <button onClick={() => setMenuId(menuId === a.id ? null : a.id)} className="btn-ghost p-2">
                      <MoreVertical size={16} />
                    </button>
                    {menuId === a.id && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setMenuId(null)} />
                        <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-dark-400/60 py-1 z-40"
                             style={{ background: 'rgb(var(--surface-card))', boxShadow: 'var(--sh-modal)' }}>
                          {a.status === 'pending' && <MenuItem icon={Check} label="Confirmar" onClick={() => setStatus(a, 'confirmed')} />}
                          {!['completed', 'cancelled'].includes(a.status) &&
                            <MenuItem icon={Check} label="Marcar atendido" onClick={() => setStatus(a, 'completed')} />}
                          {!['no_show', 'cancelled'].includes(a.status) &&
                            <MenuItem icon={UserX} label="No vino" onClick={() => setStatus(a, 'no_show')} />}
                          {a.status !== 'cancelled' &&
                            <MenuItem icon={X} label="Cancelar" onClick={() => setStatus(a, 'cancelled')} />}
                          {a.service_id &&
                            <MenuItem icon={ShoppingBag} label="Cargar como venta" onClick={() => loadAsSale(a)} />}
                          <MenuItem icon={Pencil} label="Editar" onClick={() => { setMenuId(null); setEditing(a); setFormOpen(true) }} />
                          <MenuItem icon={Trash2} label="Eliminar" danger onClick={() => { setMenuId(null); setDeleteTarget(a) }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Editar turno' : 'Nuevo turno'}>
        <AppointmentForm
          appt={editing} barbers={barbers.filter(b => b.is_active)} services={services}
          defaultDate={date} tenantId={tenant.id}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load() }}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Eliminar turno" danger
        message={deleteTarget ? `¿Eliminás el turno de ${deleteTarget.customer_name}? Se borra de forma permanente.` : ''}
      />
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
        danger ? 'text-red-400/80 hover:text-red-400 hover:bg-red-400/5' : 'text-cream/65 hover:text-cream hover:bg-dark-300/50'
      }`}>
      <Icon size={14} /> {label}
    </button>
  )
}

function AppointmentForm({ appt, barbers, services, defaultDate, tenantId, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    customer_name:  appt?.customer_name || '',
    customer_phone: appt?.customer_phone || '',
    service_id:     appt?.service_id || services[0]?.id || '',
    barber_id:      appt?.barber_id || barbers[0]?.id || '',
    when:           toDatetimeInput(appt?.starts_at || new Date(new Date(defaultDate).setHours(10, 0, 0, 0))),
    status:         appt?.status || 'confirmed',
    admin_notes:    appt?.admin_notes || '',
  }))
  const [saving, setSaving] = useState(false)

  const svc = services.find(s => s.id === form.service_id)

  async function save() {
    if (!form.customer_name.trim() || !form.customer_phone.trim()) return toast.error('Nombre y teléfono son obligatorios')
    if (!form.service_id || !form.barber_id) return toast.error('Elegí servicio y barbero')
    if (!form.when) return toast.error('Elegí fecha y hora')
    setSaving(true)
    const starts = new Date(form.when)
    const duration = svc?.duration_min || appt?.duration_min || 30
    const ends = new Date(starts.getTime() + duration * 60000)
    const customerId = await customerUpsert(supabase, {
      tenantId, phone: form.customer_phone, name: form.customer_name,
    })
    const payload = {
      tenant_id: tenantId,
      barber_id: form.barber_id,
      service_id: form.service_id,
      service_name: svc?.name || appt?.service_name || 'Servicio',
      service_price: svc?.price ?? appt?.service_price ?? 0,
      duration_min: duration,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status: form.status,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      admin_notes: form.admin_notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (customerId) payload.customer_id = customerId
    let error
    if (appt) {
      ({ error } = await supabase.from('appointments').update(payload).eq('id', appt.id))
    } else {
      ({ error } = await supabase.from('appointments').insert({ ...payload, source: 'admin' }))
    }
    // por si todavía no está la columna customer_id
    if (error && /customer_id/.test(error.message || '')) {
      const { customer_id: _cid, ...rest } = payload
      if (appt) ({ error } = await supabase.from('appointments').update(rest).eq('id', appt.id))
      else ({ error } = await supabase.from('appointments').insert({ ...rest, source: 'admin' }))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(appt ? 'Turno actualizado' : 'Turno creado')
    onSaved()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Cliente *</label>
          <input className="input-dark" value={form.customer_name}
                 onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Teléfono *</label>
          <input className="input-dark" inputMode="tel" value={form.customer_phone}
                 onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">Servicio *</label>
        <select className="input-dark" value={form.service_id}
                onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))}>
          <option value="">Elegí un servicio</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name} · {fmtMoney(s.price)} · {fmtDuration(s.duration_min)}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Barbero *</label>
          <select className="input-dark" value={form.barber_id}
                  onChange={e => setForm(f => ({ ...f, barber_id: e.target.value }))}>
            <option value="">Elegí un barbero</option>
            {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input-dark" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Fecha y hora *</label>
        <input type="datetime-local" className="input-dark" value={form.when}
               onChange={e => setForm(f => ({ ...f, when: e.target.value }))} />
      </div>
      <div>
        <label className="label">Nota interna (opcional)</label>
        <input className="input-dark" value={form.admin_notes}
               onChange={e => setForm(f => ({ ...f, admin_notes: e.target.value }))} />
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn-gold flex-1">{saving ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </div>
  )
}
