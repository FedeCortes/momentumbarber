import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import {
  Search, Scissors, Clock, ChevronRight, ChevronLeft, Check, User,
  CalendarCheck, Sun, Moon, Phone, MessageCircle, CalendarPlus, ArrowRight,
  MapPin, Sparkles, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import BarberPoleMark from '../../components/ui/BarberPoleMark'
import Spinner from '../../components/ui/Spinner'
import {
  fmtTime, fmtDay, weekdayAbbr, dayPart, fmtMoney, fmtDuration,
  waLink, telLink, googleCalLink,
} from '../../lib/booking'
import toast from 'react-hot-toast'

const PARTS = ['Mañana', 'Tarde', 'Noche']
const STEPS = [
  { key: 'service',  label: 'Servicio' },
  { key: 'barber',   label: 'Profesional' },
  { key: 'datetime', label: 'Horario' },
  { key: 'contact',  label: 'Tus datos' },
]
const stepIndex = k => STEPS.findIndex(s => s.key === k)

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function ThemeBtn() {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} className="p-2 rounded-xl text-cream/45 hover:text-cream hover:bg-dark-300/60 transition-all"
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

function Stepper({ step, maxReached, go }) {
  const cur = stepIndex(step)
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2 mb-6">
      {STEPS.map((s, i) => {
        const done = i < cur
        const active = i === cur
        const clickable = i <= maxReached
        return (
          <li key={s.key} className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <button
              disabled={!clickable}
              onClick={() => clickable && go(s.key)}
              className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? 'bg-gold/15 text-gold'
                : done ? 'text-cream/70 hover:text-cream'
                : 'text-cream/30'
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                active ? 'bg-gold text-ink' : done ? 'bg-emerald-400/20 text-emerald-400' : 'bg-dark-300 text-cream/40'
              }`}>
                {done ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span className="hidden sm:block">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="w-3 sm:w-5 h-px bg-dark-400 shrink-0" />}
          </li>
        )
      })}
    </ol>
  )
}

function SummaryLines({ shop, service, barber, slot, showTotal = true }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-dark-300">
        <div className="w-9 h-9 rounded-xl bg-gold/12 border border-gold/20 flex items-center justify-center shrink-0">
          <BarberPoleMark size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-cream text-sm font-semibold truncate">{shop.tenant.name}</p>
          {shop.tenant.phone && <p className="text-cream/40 text-xs truncate">{shop.tenant.phone}</p>}
        </div>
      </div>

      {service ? (
        <>
          <p className="text-cream text-sm font-medium">{service.name}</p>
          <p className="text-cream/45 text-xs mt-0.5 flex items-center gap-1.5">
            <Clock size={11} /> {fmtDuration(service.duration_min)}
          </p>
        </>
      ) : (
        <p className="text-cream/35 text-sm">Elegí un servicio para empezar</p>
      )}

      {barber !== undefined && (
        <p className="text-cream/60 text-xs mt-3 flex items-center gap-1.5">
          <User size={12} className="text-cream/40" /> {barber ? barber.name : 'Cualquier profesional'}
        </p>
      )}
      {slot && (
        <p className="text-cream/60 text-xs mt-2 flex items-center gap-1.5">
          <CalendarCheck size={12} className="text-cream/40" /> {fmtDay(slot.start)} · {fmtTime(slot.start)}
        </p>
      )}

      {showTotal && service && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-dark-300">
          <span className="text-cream/50 text-xs uppercase tracking-wide">Total</span>
          <span className="text-gold font-display text-lg font-bold">{fmtMoney(service.price)}</span>
        </div>
      )}
    </div>
  )
}

// Datos de ejemplo para previsualizar el diseño en desarrollo (?preview)
const PREVIEW_SHOP = {
  tenant: { name: 'Barbería Momentum', slug: 'demo', phone: '299 555 1234', whatsapp: '299 555 1234' },
  config: { notice: 'Los jueves 20% off pagando en efectivo. Llegá 5 minutos antes de tu turno.', slot_min: 15, lead_hours: 2, horizon_days: 21 },
  services: [
    { id: 's1', name: 'Corte de cabello', price: 35000, duration_min: 45, description: 'Incluye asesoramiento, lavado y peinado.' },
    { id: 's2', name: 'Corte + Barba', price: 44000, duration_min: 60, description: 'Corte completo más perfilado y arreglo de barba con toallas calientes.' },
    { id: 's3', name: 'Barba Spa', price: 33000, duration_min: 45, description: null },
    { id: 's4', name: 'Corte niño', price: 25000, duration_min: 30, description: null },
  ],
  barbers: [
    { id: 'b1', name: 'Lautaro', photo_url: null, bio: 'Especialista en fades y trabajos con tijera.' },
    { id: 'b2', name: 'Mateo', photo_url: null, bio: 'Barba y color. 6 años de experiencia.' },
    { id: 'b3', name: 'Thomas', photo_url: null, bio: null },
  ],
}
function previewSlots() {
  const out = []
  const base = new Date(); base.setHours(0, 0, 0, 0)
  for (let d = 1; d <= 8; d++) {
    const day = new Date(base); day.setDate(day.getDate() + d)
    if (day.getDay() === 0) continue
    const slots = []
    for (const h of [9, 10, 11, 13, 14, 15, 16, 18, 19]) {
      if (Math.random() > 0.35) {
        const s = new Date(day); s.setHours(h, [0, 30][Math.floor(Math.random() * 2)])
        slots.push({ start: s.toISOString(), barber_ids: ['b1'] })
      }
    }
    if (slots.length) out.push({ date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`, slots })
  }
  return out
}

export default function BookingPage() {
  const { slug } = useParams()
  const [sp] = useSearchParams()
  const preview = import.meta.env.DEV && sp.has('preview')
  const [shop, setShop] = useState(undefined)   // undefined = cargando, null = no disponible
  const [step, setStep] = useState('service')

  const [service, setService] = useState(null)
  const [barber, setBarber]   = useState(undefined)  // undefined = sin elegir, null = "cualquiera"
  const [q, setQ] = useState('')

  const [slotData, setSlotData] = useState(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [dateKey, setDateKey] = useState(null)
  const [slot, setSlot] = useState(null)

  const [form, setForm] = useState({ first: '', last: '', phone: '', email: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    document.title = 'Reservá tu turno'
    if (preview) { setShop(PREVIEW_SHOP); return }
    ;(async () => {
      const { data, error } = await supabase.rpc('booking_shop', { p_slug: slug })
      if (error) { setShop(null); return }
      setShop(data || null)
    })()
  }, [slug, preview])

  useEffect(() => {
    if (step !== 'datetime' || !service) return
    setSlotsLoading(true)
    setSlotData(null); setDateKey(null); setSlot(null)
    if (preview) {
      const days = previewSlots()
      setSlotsLoading(false); setSlotData(days)
      if (days.length) setDateKey(days[0].date)
      return
    }
    ;(async () => {
      const { data, error } = await supabase.rpc('booking_slots', {
        p_slug: slug,
        p_service_id: service.id,
        p_barber_id: barber?.id ?? null,
        p_days: shop?.config?.horizon_days ?? 21,
      })
      setSlotsLoading(false)
      if (error) { toast.error(error.message || 'No se pudo cargar la disponibilidad'); return }
      const days = data || []
      setSlotData(days)
      if (days.length) setDateKey(days[0].date)
    })()
  }, [step, service, barber, slug, shop, preview])

  const services = useMemo(() => shop?.services || [], [shop])
  const barbers  = useMemo(() => shop?.barbers || [], [shop])
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? services.filter(s => s.name.toLowerCase().includes(t)) : services
  }, [services, q])

  const currentDay = slotData?.find(d => d.date === dateKey)
  const grouped = useMemo(() => {
    const g = { Mañana: [], Tarde: [], Noche: [] }
    for (const s of currentDay?.slots || []) g[dayPart(s.start)].push(s)
    return g
  }, [currentDay])

  const maxReached = Math.max(
    stepIndex(step),
    service ? 1 : 0,
    barber !== undefined ? 2 : 0,
    slot ? 3 : 0,
  )

  function go(k) { setStep(k); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function pickService(s) { setService(s); setBarber(undefined); setSlot(null); go('barber') }
  function pickBarber(b)  { setBarber(b); setSlot(null); go('datetime') }
  function pickSlot(s)    { setSlot(s); go('contact') }

  async function submit() {
    if (!form.first.trim() || !form.phone.trim()) return toast.error('Completá tu nombre y teléfono')
    if (preview) {
      const ends = new Date(new Date(slot.start).getTime() + service.duration_min * 60000)
      setResult({
        id: 'preview', cancel_token: 'preview', barber_name: barber?.name || 'Lautaro',
        starts_at: slot.start, ends_at: ends.toISOString(),
        service_name: service.name, service_price: service.price,
      })
      setStep('done'); window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSaving(true)
    const { data, error } = await supabase.rpc('booking_create', {
      p_slug: slug,
      p_service_id: service.id,
      p_barber_id: barber?.id ?? null,
      p_starts_at: slot.start,
      p_name: `${form.first.trim()} ${form.last.trim()}`.trim(),
      p_phone: form.phone.trim(),
      p_email: form.email.trim() || null,
      p_notes: form.notes.trim() || null,
    })
    setSaving(false)
    if (error) {
      toast.error(error.message || 'No se pudo reservar')
      if ((error.message || '').includes('disponible')) go('datetime')
      return
    }
    setResult(data)
    setStep('done')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Carga / error ────────────────────────────────────────
  if (shop === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-dark-100"><Spinner /></div>
  }
  if (shop === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-dark-100 px-6 text-center">
        <BarberPoleMark size={48} className="mb-5" />
        <h1 className="font-display text-xl text-cream mb-2">Reservas no disponibles</h1>
        <p className="text-cream/50 text-sm max-w-xs">
          Esta barbería todavía no tiene la reserva online activada, o el enlace es incorrecto.
        </p>
      </div>
    )
  }

  const tenant = shop.tenant
  const waPhone = tenant.whatsapp || tenant.phone   // funciona con o sin la columna booking_whatsapp

  return (
    <div className="min-h-screen bg-dark-100 pb-28 lg:pb-16">
      <header className="bg-dark-200/95 backdrop-blur border-b border-dark-400/40 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <BarberPoleMark size={30} className="shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-cream truncate">{tenant.name}</p>
            <p className="text-[10px] text-gold/70 uppercase tracking-widest font-semibold">Reserva online</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {tenant.phone && (
            <a href={telLink(tenant.phone)} className="p-2 rounded-xl text-cream/45 hover:text-cream hover:bg-dark-300/60 transition-all sm:hidden">
              <Phone size={16} />
            </a>
          )}
          <ThemeBtn />
        </div>
      </header>

      {step === 'done' && result ? (
        <main className="max-w-md mx-auto px-4 pt-8">
          <DoneCard result={result} tenant={tenant} slug={slug} service={service} />
        </main>
      ) : (
        <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 lg:pt-10">
          {/* Hero */}
          <div className="barber-bg mb-6">
            <h1 className="font-display text-2xl sm:text-3xl text-cream tracking-tight font-bold">
              Reservá tu turno
            </h1>
            <p className="text-cream/50 text-sm mt-1 flex items-center gap-1.5">
              <MapPin size={13} className="text-cream/35" /> {tenant.name}
            </p>
          </div>

          <Stepper step={step} maxReached={maxReached} go={go} />

          {shop.config?.notice && step === 'service' && (
            <div className="rounded-2xl border border-gold/25 bg-gold/8 p-4 mb-6 flex gap-3">
              <Sparkles size={16} className="text-gold shrink-0 mt-0.5" />
              <p className="text-cream/75 text-sm leading-relaxed whitespace-pre-line">{shop.config.notice}</p>
            </div>
          )}

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 lg:items-start">
            {/* Panel del paso actual */}
            <div>
              {step === 'service' && (
                <section>
                  <SectionHead n={1} title="Elegí el servicio" />
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cream/35" />
                    <input className="input-dark pl-10" placeholder="Buscar servicio..."
                           value={q} onChange={e => setQ(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {filtered.length === 0 && <p className="text-cream/30 text-sm text-center py-8">No hay servicios para reservar.</p>}
                    {filtered.map(s => (
                      <button key={s.id} onClick={() => pickService(s)}
                              className={`group rounded-2xl border p-4 text-left flex items-center gap-4 transition-all ${
                                service?.id === s.id ? 'border-gold bg-gold/8' : 'border-dark-400/60 hover:border-gold/50 bg-dark-200'
                              }`}
                              style={{ boxShadow: 'var(--sh-card)' }}>
                        <div className="w-10 h-10 rounded-xl bg-gold/12 border border-gold/20 flex items-center justify-center shrink-0">
                          <Scissors size={16} className="text-gold" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-cream text-sm font-semibold">{s.name}</p>
                          <p className="text-cream/45 text-xs mt-1 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmtDuration(s.duration_min)}</span>
                          </p>
                          {s.description && <p className="text-cream/35 text-xs mt-1.5 line-clamp-2">{s.description}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-gold font-display text-base font-bold">{fmtMoney(s.price)}</p>
                          <span className="text-cream/30 text-[11px] group-hover:text-gold inline-flex items-center gap-0.5 mt-1">
                            Reservar <ChevronRight size={12} />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {step === 'barber' && (
                <section>
                  <BackBtn onClick={() => go('service')} />
                  <SectionHead n={2} title="¿Con quién querés atenderte?" />
                  <button onClick={() => pickBarber(null)}
                          className="w-full rounded-2xl border border-dark-400/60 bg-dark-200 hover:border-gold/50 p-4 text-left flex items-center gap-4 transition-all mb-2.5"
                          style={{ boxShadow: 'var(--sh-card)' }}>
                    <div className="w-11 h-11 rounded-full bg-gold/12 border border-gold/20 flex items-center justify-center shrink-0">
                      <Sparkles size={17} className="text-gold" />
                    </div>
                    <div className="flex-1">
                      <p className="text-cream text-sm font-semibold">Cualquier profesional</p>
                      <p className="text-cream/45 text-xs mt-0.5">Más horarios para elegir</p>
                    </div>
                    <ChevronRight size={16} className="text-cream/25 shrink-0" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {barbers.map(b => (
                      <button key={b.id} onClick={() => pickBarber(b)}
                              className="rounded-2xl border border-dark-400/60 bg-dark-200 hover:border-gold/50 p-4 flex items-center gap-3 text-left transition-all"
                              style={{ boxShadow: 'var(--sh-card)' }}>
                        <div className="w-12 h-12 rounded-full bg-dark-300 border border-dark-400 flex items-center justify-center font-display text-cream/70 text-lg shrink-0 overflow-hidden">
                          {b.photo_url ? <img src={b.photo_url} alt="" className="w-full h-full object-cover" /> : b.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-cream text-sm font-medium leading-tight">{b.name}</p>
                          {b.bio && <p className="text-cream/40 text-xs mt-1 line-clamp-2">{b.bio}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {step === 'datetime' && (
                <section>
                  <BackBtn onClick={() => go('barber')} />
                  <SectionHead n={3} title="Elegí día y hora" />
                  {slotsLoading ? (
                    <div className="flex justify-center py-12"><Spinner /></div>
                  ) : !slotData?.length ? (
                    <div className="rounded-2xl border border-dark-400/60 bg-dark-200 p-6 text-center">
                      <p className="text-cream/60 text-sm">No hay horarios disponibles en las próximas semanas.</p>
                      <p className="text-cream/35 text-xs mt-2">Probá con otro profesional o escribinos.</p>
                      {waPhone && (
                        <a href={waLink(waPhone, `Hola! Quiero un turno para ${service.name}`)} target="_blank" rel="noreferrer"
                           className="btn-gold inline-flex items-center gap-2 mt-4">
                          <MessageCircle size={15} /> Escribir por WhatsApp
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      <DateStrip days={slotData} dateKey={dateKey} onPick={setDateKey} />
                      <div className="mt-5">
                        {PARTS.map(p => grouped[p].length > 0 && (
                          <div key={p} className="mb-5">
                            <p className="text-cream/40 text-xs uppercase tracking-widest mb-2.5">{p}</p>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {grouped[p].map(s => (
                                <button key={s.start} onClick={() => pickSlot(s)}
                                  className="py-2.5 rounded-xl border border-dark-400 bg-dark-200 text-cream/85 text-sm font-medium hover:border-gold hover:bg-gold/10 hover:text-gold transition-colors">
                                  {fmtTime(s.start)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}

              {step === 'contact' && (
                <section>
                  <BackBtn onClick={() => go('datetime')} />
                  <SectionHead n={4} title="Tus datos" />
                  <p className="text-cream/45 text-xs mb-4 -mt-2">Te mandamos el detalle y un enlace para cancelar o reprogramar.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Nombre *</label>
                      <input className="input-dark" value={form.first} autoFocus
                             onChange={e => setForm(f => ({ ...f, first: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Apellido</label>
                      <input className="input-dark" value={form.last}
                             onChange={e => setForm(f => ({ ...f, last: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Teléfono / WhatsApp *</label>
                      <input className="input-dark" inputMode="tel" placeholder="Ej: 299 555 1234" value={form.phone}
                             onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Email (opcional)</label>
                      <input className="input-dark" type="email" value={form.email}
                             onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Comentario (opcional)</label>
                      <textarea className="input-dark min-h-[4rem]" value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                  <button onClick={submit} disabled={saving}
                          className="btn-gold w-full mt-5 hidden lg:flex items-center justify-center gap-2">
                    {saving ? 'Reservando...' : <>Confirmar turno <ArrowRight size={16} /></>}
                  </button>
                  <p className="text-cream/30 text-[11px] mt-3 hidden lg:block">
                    Al reservar aceptás recibir mensajes sobre tu turno.
                  </p>
                </section>
              )}
            </div>

            {/* Resumen (desktop) */}
            <aside className="hidden lg:block">
              <div className="rounded-2xl border border-dark-400/60 bg-dark-200 p-5 sticky top-24" style={{ boxShadow: 'var(--sh-card)' }}>
                <p className="text-cream/40 text-[11px] font-bold uppercase tracking-widest mb-3">Tu turno</p>
                <SummaryLines shop={shop} service={service} barber={barber} slot={slot} />
              </div>
            </aside>
          </div>
        </main>
      )}

      {/* Barra de resumen + CTA (mobile) */}
      {step !== 'done' && service && (
        <>
          {sheetOpen && (
            <div className="lg:hidden fixed inset-0 z-40 bg-black/50 flex items-end" onClick={() => setSheetOpen(false)}>
              <div className="w-full rounded-t-3xl bg-dark-200 border-t border-dark-400/50 p-5 pb-8" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-cream/40 text-[11px] font-bold uppercase tracking-widest">Tu turno</p>
                  <button onClick={() => setSheetOpen(false)} className="text-cream/40"><X size={18} /></button>
                </div>
                <SummaryLines shop={shop} service={service} barber={barber} slot={slot} />
              </div>
            </div>
          )}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-dark-200 border-t border-dark-400/50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
               style={{ boxShadow: 'var(--sh-modal)' }}>
            <div className="flex items-center gap-3">
              <button onClick={() => setSheetOpen(true)} className="flex-1 min-w-0 text-left">
                <p className="text-cream text-sm font-semibold truncate">{service.name} · {fmtMoney(service.price)}</p>
                <p className="text-cream/45 text-xs truncate">
                  {slot ? `${fmtDay(slot.start)} · ${fmtTime(slot.start)}` : barber !== undefined ? (barber ? barber.name : 'Cualquier profesional') : 'Elegí profesional'}
                  {' · '}<span className="text-gold/70">ver detalle</span>
                </p>
              </button>
              {step === 'contact' && (
                <button onClick={submit} disabled={saving} className="btn-gold shrink-0 flex items-center gap-1.5">
                  {saving ? '...' : <>Confirmar <ArrowRight size={15} /></>}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SectionHead({ n, title }) {
  return (
    <h2 className="font-display text-lg sm:text-xl text-cream mb-4 flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-full bg-gold/15 text-gold text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      {title}
    </h2>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-cream/45 hover:text-cream text-sm mb-3 -mt-1 transition-colors">
      <ChevronLeft size={15} /> Volver
    </button>
  )
}

function DateStrip({ days, dateKey, onPick }) {
  const first = days.find(d => d.date === dateKey) || days[0]
  const m = first ? new Date(first.slots[0].start) : new Date()
  return (
    <div>
      <p className="text-cream/70 text-sm font-medium mb-2.5 capitalize">
        {MONTHS[m.getMonth()]} {m.getFullYear()}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {days.map(d => {
          const active = d.date === dateKey
          const dt = new Date(d.slots[0].start)
          return (
            <button key={d.date} onClick={() => onPick(d.date)}
              className={`shrink-0 w-16 py-2.5 rounded-2xl border text-center transition-colors ${
                active ? 'bg-gold text-ink border-gold' : 'border-dark-400 bg-dark-200 text-cream/60 hover:border-gold/50'
              }`}>
              <p className={`text-[10px] uppercase tracking-wide ${active ? 'text-ink/70' : 'text-cream/40'}`}>
                {weekdayAbbr(dt)}
              </p>
              <p className="text-lg font-display font-bold leading-none mt-1">{dt.getDate()}</p>
              <p className={`text-[10px] mt-1 ${active ? 'text-ink/60' : 'text-cream/30'}`}>{d.slots.length} libres</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DoneCard({ result, tenant, slug, service }) {
  const waPhone = tenant.whatsapp || tenant.phone
  const waText = `Hola! Confirmo mi turno en ${tenant.name}:\n${service?.name || result.service_name} con ${result.barber_name}\n${fmtDay(result.starts_at)} a las ${fmtTime(result.starts_at)}`
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center mx-auto mb-4">
        <Check size={30} className="text-emerald-400" strokeWidth={2.5} />
      </div>
      <h1 className="font-display text-2xl text-cream font-bold">¡Turno confirmado!</h1>
      <p className="text-cream/50 text-sm mt-1.5">Te esperamos en {tenant.name}</p>

      <div className="rounded-2xl border border-dark-400/60 bg-dark-200 mt-6 text-left overflow-hidden" style={{ boxShadow: 'var(--sh-card)' }}>
        <div className="p-5 flex flex-col gap-3">
          <Row icon={Scissors} label="Servicio" text={result.service_name} />
          <Row icon={User} label="Profesional" text={result.barber_name} />
          <Row icon={CalendarCheck} label="Día" text={fmtDay(result.starts_at)} />
          <Row icon={Clock} label="Hora" text={`${fmtTime(result.starts_at)} – ${fmtTime(result.ends_at)}`} />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 bg-dark-300/40 border-t border-dark-400/50">
          <span className="text-cream/50 text-xs uppercase tracking-wide">Total</span>
          <span className="text-gold font-display text-lg font-bold">{fmtMoney(result.service_price)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-5">
        {waPhone && (
          <a href={waLink(waPhone, waText)} target="_blank" rel="noreferrer"
             className="btn-gold flex items-center justify-center gap-2">
            <MessageCircle size={16} /> Avisar a la barbería por WhatsApp
          </a>
        )}
        <a href={googleCalLink({
              title: `${result.service_name} — ${tenant.name}`,
              details: `Profesional: ${result.barber_name}`,
              start: result.starts_at, end: result.ends_at, location: tenant.name,
           })} target="_blank" rel="noreferrer"
           className="btn-outline-gold flex items-center justify-center gap-2">
          <CalendarPlus size={16} /> Agregar al calendario
        </a>
        <Link to={`/reservar/${slug}/t/${result.id}?token=${result.cancel_token}`}
              className="text-cream/45 text-xs hover:text-cream mt-1 py-1">
          Ver, cancelar o reprogramar este turno
        </Link>
      </div>
    </div>
  )
}

function Row({ icon: Icon, label, text }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-cream/40 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-cream/40 text-[11px] uppercase tracking-wide">{label}</p>
        <p className="text-cream/85 text-sm">{text}</p>
      </div>
    </div>
  )
}
