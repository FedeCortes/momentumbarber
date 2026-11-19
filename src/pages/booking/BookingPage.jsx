import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Clock, Scissors, Users, CalendarDays, Copy, Check,
  Upload, FileText, MessageCircle, CalendarPlus, LogOut, Pencil, CreditCard,
  ShieldCheck, X, User, ExternalLink, Sun, Moon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import BrandMark from '../../components/ui/BrandMark'
import { useTheme } from '../../context/ThemeContext'
import { applyBrandIcon } from '../../lib/brand'
import Spinner from '../../components/ui/Spinner'
import {
  fetchShop, fetchDays, fetchSlots, login, fetchMe, rename, cancelBooking, book, uploadReceipt,
  loadClient, saveClient, money, durationLabel, timeAR, longDateAR, dayParts, dateKeyAR,
  STATUS, waTo,
} from '../../lib/booking'

const STEPS = [
  { key: 'service', label: 'Servicio' },
  { key: 'barber',  label: 'Barbero' },
  { key: 'when',    label: 'Horario' },
  { key: 'pay',     label: 'Pago' },
]

// ─────────────────────────────────────────────────────────────
// Piezas chicas
// ─────────────────────────────────────────────────────────────
function Avatar({ name, url, size = 48 }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return url ? (
    <img src={url} alt={name} className="rounded-full object-cover border border-dark-400/60 shrink-0"
         style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-gold/12 border border-gold/25 text-gold font-semibold flex items-center justify-center shrink-0"
         style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  )
}

function CopyRow({ label, value }) {
  const [done, setDone] = useState(false)
  if (!value) return null
  async function copy() {
    try { await navigator.clipboard.writeText(value) } catch {
      const t = document.createElement('textarea'); t.value = value; document.body.appendChild(t); t.select()
      document.execCommand('copy'); t.remove()
    }
    setDone(true); setTimeout(() => setDone(false), 1600)
  }
  return (
    <button type="button" onClick={copy}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-dark-200 border border-dark-400/50 hover:border-gold/40 transition-colors text-left">
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-cream/40">{label}</span>
        <span className="block text-cream font-semibold text-[15px] break-all">{value}</span>
      </span>
      <span className={`shrink-0 flex items-center gap-1 text-xs font-semibold ${done ? 'text-emerald-500' : 'text-gold'}`}>
        {done ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
      </span>
    </button>
  )
}

function StepHeader({ title, subtitle, onBack }) {
  return (
    <div className="flex items-start gap-2 mb-5">
      {onBack && (
        <button onClick={onBack} aria-label="Volver"
          className="-ml-2 mt-0.5 p-2 rounded-xl text-cream/50 hover:text-cream hover:bg-dark-300/60 transition-colors">
          <ChevronLeft size={20} />
        </button>
      )}
      <div>
        <h2 className="font-display text-[22px] leading-tight font-semibold text-cream">{title}</h2>
        {subtitle && <p className="text-cream/45 text-sm mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

function Progress({ step }) {
  const idx = STEPS.findIndex(s => s.key === step)
  if (idx < 0) return null
  return (
    <div className="flex items-center gap-1.5 mb-6" aria-label={`Paso ${idx + 1} de ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex-1">
          <div className={`h-1 rounded-full transition-colors duration-300 ${i <= idx ? 'bg-gold' : 'bg-dark-400/50'}`} />
          <p className={`mt-1.5 text-[10px] font-bold uppercase tracking-wider ${i === idx ? 'text-gold' : 'text-cream/30'}`}>{s.label}</p>
        </div>
      ))}
    </div>
  )
}

function Summary({ service, barber, anyBarber, slot, onEdit }) {
  if (!service) return null
  const items = [
    { k: 'service', icon: Scissors, text: service.name },
    (barber || anyBarber) && { k: 'barber', icon: User, text: barber ? barber.name : 'Cualquier barbero' },
    slot && { k: 'when', icon: CalendarDays, text: `${dayParts(dateKeyAR(slot)).dow.replace(/^./, c => c.toUpperCase())} ${dayParts(dateKeyAR(slot)).day} · ${timeAR(slot)}` },
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1.5 mb-5">
      {items.map(({ k, icon: Icon, text }) => (
        <button key={k} onClick={() => onEdit(k)}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-dark-200 border border-dark-400/50 text-xs text-cream/75 hover:border-gold/40 transition-colors">
          <Icon size={12} className="text-gold" /> {text}
        </button>
      ))}
    </div>
  )
}

function googleCalLink({ title, start, end, details }) {
  const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const p = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${f(start)}/${f(end)}`, details: details || '' })
  return `https://calendar.google.com/calendar/render?${p}`
}

// ─────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────
export default function BookingPage() {
  const { slug } = useParams()
  const [shop, setShop]       = useState(null)
  const [state, setState]     = useState('loading')  // loading | ok | notfound | error
  const [client, setClient]   = useState(() => loadClient(slug))
  const [step, setStep]       = useState('service')

  const [service, setService] = useState(null)
  const [barber, setBarber]   = useState(null)       // objeto o null
  const [anyBarber, setAnyBarber] = useState(false)
  const [slot, setSlot]       = useState(null)       // ISO string
  const [result, setResult]   = useState(null)

  const topRef = useRef(null)

  useEffect(() => {
    let alive = true
    fetchShop(slug)
      .then(s => { if (!alive) return; if (!s) setState('notfound'); else { setShop(s); setState('ok') } })
      .catch(() => alive && setState('error'))
    return () => { alive = false }
  }, [slug])

  useEffect(() => { if (shop?.name) document.title = `Reservá en ${shop.name}` }, [shop?.name])
  useEffect(() => { if (shop) applyBrandIcon(shop.logo_url) }, [shop])

  function go(next) {
    setStep(next)
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function updateClient(c) { setClient(c); saveClient(slug, c) }

  const barbersForService = useMemo(() => {
    if (!shop || !service) return []
    return shop.barbers.filter(b => !(b.off_services || []).includes(service.id))
  }, [shop, service])

  function pickService(s) {
    setService(s); setSlot(null)
    const list = shop.barbers.filter(b => !(b.off_services || []).includes(s.id))
    if (barber && !list.some(b => b.id === barber.id)) setBarber(null)
    if (list.length === 1) { setBarber(list[0]); setAnyBarber(false); go('when') }
    else go('barber')
  }
  function pickBarber(b) { setBarber(b); setAnyBarber(!b); setSlot(null); go('when') }
  function pickSlot(iso) { setSlot(iso); go(client ? 'pay' : 'id') }
  function editFromSummary(k) { if (k === 'service') go('service'); else if (k === 'barber') go('barber'); else go('when') }
  function restart() { setService(null); setBarber(null); setAnyBarber(false); setSlot(null); setResult(null); go('service') }

  // ── Estados de carga ─────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-100">
        <Spinner size={26} />
      </div>
    )
  }
  if (state !== 'ok') {
    return (
      <Shell>
        <div className="text-center py-20">
          <p className="font-display text-xl text-cream mb-2">
            {state === 'notfound' ? 'No encontramos esta barbería' : 'No pudimos cargar la página'}
          </p>
          <p className="text-cream/45 text-sm mb-6">
            {state === 'notfound' ? 'Revisá el link que te pasaron.' : 'Revisá tu conexión y probá de nuevo.'}
          </p>
          {state === 'error' && <button className="btn-gold" onClick={() => location.reload()}>Reintentar</button>}
        </div>
      </Shell>
    )
  }

  const wa = shop.whatsapp ? waTo(shop.whatsapp, `Hola! Quería sacar un turno en ${shop.name}`) : ''

  if (!shop.enabled || !shop.services.length || !shop.barbers.length) {
    return (
      <Shell shop={shop}>
        <div className="card text-center py-12">
          <CalendarDays className="mx-auto text-gold mb-4" size={30} />
          <p className="font-display text-lg text-cream mb-1">Las reservas online no están abiertas</p>
          <p className="text-cream/45 text-sm mb-6">Escribinos y te damos un turno.</p>
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-gold inline-flex items-center gap-2"><MessageCircle size={16} /> Escribir por WhatsApp</a>}
        </div>
      </Shell>
    )
  }

  return (
    <Shell shop={shop} client={client} onMine={() => go(client ? 'mine' : 'id-mine')} onHome={restart}>
      <div ref={topRef} className="scroll-mt-24" />

      {['service', 'barber', 'when', 'id', 'pay'].includes(step) && (
        <Progress step={step === 'id' ? 'pay' : step} />
      )}
      {['barber', 'when', 'id', 'pay'].includes(step) && (
        <Summary service={service} barber={barber} anyBarber={anyBarber} slot={step === 'when' ? null : slot} onEdit={editFromSummary} />
      )}

      {step === 'service' && (
        <ServiceStep shop={shop} client={client} onPick={pickService} />
      )}
      {step === 'barber' && (
        <BarberStep barbers={barbersForService} selected={barber} anySelected={anyBarber}
          onPick={pickBarber} onBack={() => go('service')} />
      )}
      {step === 'when' && (
        <WhenStep slug={slug} shop={shop} service={service} barber={barber}
          onPick={pickSlot} onBack={() => go(barbersForService.length > 1 ? 'barber' : 'service')} />
      )}
      {(step === 'id' || step === 'id-mine') && (
        <IdentifyStep slug={slug} forMine={step === 'id-mine'}
          onBack={() => go(step === 'id-mine' ? (slot ? 'pay' : 'service') : 'when')}
          onDone={c => { updateClient(c); go(step === 'id-mine' ? 'mine' : 'pay') }} />
      )}
      {step === 'pay' && client && (
        <PayStep slug={slug} shop={shop} client={client} service={service} barber={barber} slot={slot}
          onBack={() => go('when')}
          onSlotTaken={() => { setSlot(null); go('when') }}
          onLoggedOut={() => { updateClient(null); go('id') }}
          onDone={r => { setResult(r); go('done') }} />
      )}
      {step === 'done' && result && (
        <DoneStep shop={shop} client={client} service={service} slot={slot} result={result}
          onMine={() => go('mine')} onAgain={restart} />
      )}
      {step === 'mine' && client && (
        <MineStep shop={shop} client={client}
          onClient={updateClient}
          onLogout={() => { updateClient(null); restart() }}
          onNew={restart} />
      )}
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────
// Marco: encabezado fijo con la marca de la barbería
// ─────────────────────────────────────────────────────────────
function ThemeButton() {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      className="w-9 h-9 rounded-full border border-dark-400/60 hover:border-gold/40 flex items-center justify-center text-cream/60 hover:text-cream transition-colors">
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

function Shell({ shop, client, onMine, onHome, children }) {
  return (
    <div className="min-h-screen bg-dark-100">
      <header className="sticky top-0 z-30 border-b border-dark-400/40 backdrop-blur-md"
              style={{ background: 'rgb(var(--surface-card) / 0.88)' }}>
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={onHome} className="flex items-center gap-3 min-w-0 text-left" disabled={!onHome}>
            <BrandMark logoUrl={shop?.logo_url} size={34} className="shrink-0" alt={shop?.name} />
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold text-cream leading-tight truncate">{shop?.name || 'Reservas'}</p>
              <p className="text-[10px] text-cream/40 uppercase tracking-widest font-semibold">Turnos online</p>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
          <ThemeButton />
          {onMine && (
            <button onClick={onMine}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-dark-400/60 hover:border-gold/40 transition-colors">
              {client
                ? <Avatar name={client.name} size={26} />
                : <span className="w-[26px] h-[26px] rounded-full bg-dark-300 flex items-center justify-center"><User size={14} className="text-cream/50" /></span>}
              <span className="text-xs font-semibold text-cream/75">{client ? 'Mis turnos' : 'Entrar'}</span>
            </button>
          )}
          </div>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 pt-6 pb-16">{children}</main>
      <footer className="max-w-md mx-auto px-4 pb-8 text-center text-[11px] text-cream/25">
        Reservas con <span className="text-gold/60 font-semibold">Momentum</span>
      </footer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 1 · Servicio
// ─────────────────────────────────────────────────────────────
function ServiceStep({ shop, client, onPick }) {
  return (
    <>
      <StepHeader
        title={client?.name ? `Hola, ${client.name.split(' ')[0]}` : 'Reservá tu turno'}
        subtitle="Elegí qué te vas a hacer." />
      {shop.notice && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-gold/25 bg-gold/[0.06] text-sm text-cream/75">
          {shop.notice}
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {shop.services.map(s => (
          <button key={s.id} onClick={() => onPick(s)}
            className="card-hover !p-4 flex items-center gap-4 text-left">
            <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
              <Scissors size={18} className="text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-cream font-semibold leading-snug line-clamp-2">{s.name}</p>
              <p className="text-cream/45 text-xs flex items-center gap-1 mt-0.5"><Clock size={12} /> {durationLabel(s.duration_min)}</p>
            </div>
            <p className="text-gold font-bold text-[15px] shrink-0">{money(s.price)}</p>
            <ChevronRight size={18} className="text-cream/25 shrink-0" />
          </button>
        ))}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// 2 · Barbero
// ─────────────────────────────────────────────────────────────
function BarberStep({ barbers, selected, anySelected, onPick, onBack }) {
  const opt = (active) => `card-hover !p-4 flex flex-col items-center text-center gap-2.5 ${active ? '!border-gold/70 shadow-gold' : ''}`
  return (
    <>
      <StepHeader title="¿Con quién?" subtitle="Elegí tu barbero o dejá que te toque el primero libre." onBack={onBack} />
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => onPick(null)} className={opt(anySelected)}>
          <div className="w-16 h-16 rounded-full bg-dark-300 border border-dark-400/60 flex items-center justify-center">
            <Users size={24} className="text-gold" />
          </div>
          <div>
            <p className="text-cream font-semibold text-sm">Cualquiera</p>
            <p className="text-cream/40 text-[11px]">Más horarios</p>
          </div>
        </button>
        {barbers.map(b => (
          <button key={b.id} onClick={() => onPick(b)} className={opt(selected?.id === b.id)}>
            <Avatar name={b.name} url={b.photo_url} size={64} />
            <p className="text-cream font-semibold text-sm truncate max-w-full">{b.name}</p>
          </button>
        ))}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// 3 · Día y hora
// ─────────────────────────────────────────────────────────────
function WhenStep({ slug, shop, service, barber, onPick, onBack }) {
  const [days, setDays]     = useState(null)
  const [day, setDay]       = useState(null)
  const [slots, setSlots]   = useState(null)
  const [err, setErr]       = useState(false)
  const [reload, setReload] = useState(0)
  const stripRef = useRef(null)

  useEffect(() => {
    let alive = true
    setDays(null); setErr(false)
    fetchDays(slug, service.id, barber?.id)
      .then(d => {
        if (!alive) return
        const list = (d || []).map(x => ({ key: typeof x.day === 'string' ? x.day.slice(0, 10) : dateKeyAR(x.day), free: x.free }))
        setDays(list)
        setDay(cur => (cur && list.some(x => x.key === cur && x.free > 0)) ? cur : (list.find(x => x.free > 0)?.key || null))
      })
      .catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [slug, service.id, barber?.id, reload])

  useEffect(() => {
    if (!day) { setSlots(null); return }
    let alive = true
    setSlots(null)
    fetchSlots(slug, service.id, barber?.id, day)
      .then(rows => {
        if (!alive) return
        const uniq = [...new Set((rows || []).map(r => new Date(r.starts_at).toISOString()))]
        setSlots(uniq)
      })
      .catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [slug, service.id, barber?.id, day])

  const groups = useMemo(() => {
    if (!slots) return []
    const g = [
      { label: 'Mañana', items: [] },
      { label: 'Tarde', items: [] },
      { label: 'Noche', items: [] },
    ]
    for (const iso of slots) {
      const h = Number(timeAR(iso).slice(0, 2))
      g[h < 13 ? 0 : h < 19 ? 1 : 2].items.push(iso)
    }
    return g.filter(x => x.items.length)
  }, [slots])

  const noneAtAll = days && !days.some(d => d.free > 0)

  return (
    <>
      <StepHeader title="¿Cuándo?" subtitle={`${service.name} · ${durationLabel(service.duration_min)}`} onBack={onBack} />

      {err && (
        <div className="card text-center py-8">
          <p className="text-cream/60 text-sm mb-4">No pudimos traer los horarios.</p>
          <button className="btn-outline-gold" onClick={() => setReload(r => r + 1)}>Reintentar</button>
        </div>
      )}

      {!err && !days && <div className="py-12 flex justify-center"><Spinner /></div>}

      {!err && days && noneAtAll && (
        <div className="card text-center py-10">
          <CalendarDays className="mx-auto text-gold mb-3" size={26} />
          <p className="text-cream font-semibold mb-1">No quedan turnos libres</p>
          <p className="text-cream/45 text-sm mb-5">{barber ? 'Probá con otro barbero o' : 'Probá'} más adelante.</p>
          {shop.whatsapp && (
            <a href={waTo(shop.whatsapp, `Hola! Busco turno para ${service.name}`)} target="_blank" rel="noreferrer"
               className="btn-outline-gold inline-flex items-center gap-2"><MessageCircle size={15} /> Consultar por WhatsApp</a>
          )}
        </div>
      )}

      {!err && days && !noneAtAll && (
        <>
          <div ref={stripRef} className="-mx-4 px-4 scroll-px-4 flex gap-2 overflow-x-auto pb-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {days.map(d => {
              const p = dayParts(d.key)
              const active = d.key === day
              const full = d.free === 0
              return (
                <button key={d.key} disabled={full} onClick={() => setDay(d.key)}
                  className={`snap-start shrink-0 w-[62px] py-2.5 rounded-2xl border flex flex-col items-center transition-colors duration-100 ${
                    active ? 'bg-gold border-gold text-ink shadow-gold-md'
                    : full ? 'border-dark-400/30 text-cream/20 cursor-not-allowed'
                    : 'border-dark-400/60 bg-dark-200 text-cream hover:border-gold/50'}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-ink/70' : full ? '' : 'text-cream/45'}`}>{p.dow}</span>
                  <span className="text-xl font-bold leading-tight">{p.day}</span>
                  <span className={`text-[10px] font-semibold ${active ? 'text-ink/70' : full ? '' : 'text-cream/40'}`}>{full ? 'sin lugar' : p.month}</span>
                </button>
              )
            })}
          </div>

          {day && <p className="text-cream/50 text-sm mt-4 mb-3">{dayParts(day).long}</p>}

          {!slots && <div className="py-10 flex justify-center"><Spinner /></div>}
          {slots && !slots.length && <p className="text-cream/45 text-sm py-6 text-center">Ese día ya no tiene lugar.</p>}
          {slots && groups.map(g => (
            <div key={g.label} className="mb-5">
              <p className="label !mb-2.5">{g.label}</p>
              <div className="grid grid-cols-4 gap-2">
                {g.items.map(iso => (
                  <button key={iso} onClick={() => onPick(iso)}
                    className="py-2.5 rounded-xl border border-dark-400/60 bg-dark-200 text-cream text-sm font-semibold hover:border-gold hover:text-gold active:scale-[0.97] transition-all">
                    {timeAR(iso)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// 4 · WhatsApp = perfil
// ─────────────────────────────────────────────────────────────
function IdentifyStep({ slug, forMine, onBack, onDone }) {
  const [phone, setPhone] = useState('')
  const [name, setName]   = useState('')
  const [needName, setNeedName] = useState(false)
  const [busy, setBusy]   = useState(false)
  const nameRef = useRef(null)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const r = await login(slug, phone, needName ? name : null)
      if (r?.need_name) { setNeedName(true); setTimeout(() => nameRef.current?.focus(), 50); return }
      onDone({ token: r.token, name: r.name, phone: r.phone })
      toast.success(r.name ? `¡Hola, ${r.name.split(' ')[0]}!` : '¡Listo!')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <StepHeader
        title={forMine ? 'Entrá con tu WhatsApp' : 'Tu WhatsApp'}
        subtitle={needName ? 'Es tu primera vez: ¿cómo te llamás?' : 'Con tu número queda tu perfil. La próxima vez reservás en dos toques.'}
        onBack={onBack} />
      <form onSubmit={submit} className="card flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="rsv-phone">WhatsApp</label>
          <div className="flex items-stretch rounded-xl border border-dark-400/70 bg-dark-300/60 focus-within:border-gold/60 focus-within:ring-2 focus-within:ring-gold/15 transition-all">
            <span className="px-3.5 flex items-center text-cream/50 text-sm font-semibold border-r border-dark-400/60">+54</span>
            <input id="rsv-phone" type="tel" inputMode="tel" autoComplete="tel-national" required autoFocus
              value={phone} onChange={e => { setPhone(e.target.value); setNeedName(false) }}
              placeholder="11 2345 6789"
              className="flex-1 bg-transparent border-0 focus:ring-0 text-cream px-3.5 py-3 text-[15px] placeholder:text-cream/30" />
          </div>
          <p className="text-cream/35 text-[11px] mt-1.5">Con código de área, sin 0 ni 15.</p>
        </div>
        {needName && (
          <div>
            <label className="label" htmlFor="rsv-name">Nombre y apellido</label>
            <input id="rsv-name" ref={nameRef} required value={name} onChange={e => setName(e.target.value)}
              autoComplete="name" placeholder="Ej: Juan Pérez" className="input-dark !text-[15px]" maxLength={60} />
          </div>
        )}
        <button type="submit" disabled={busy || phone.replace(/\D/g, '').length < 8 || (needName && !name.trim())}
          className="btn-gold !py-3.5 flex items-center justify-center gap-2">
          {busy ? <Spinner size={16} /> : needName ? 'Crear mi perfil' : 'Continuar'}
        </button>
        <p className="text-cream/30 text-[11px] text-center flex items-center justify-center gap-1.5">
          <ShieldCheck size={12} /> Solo lo usa la barbería para tus turnos.
        </p>
      </form>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// 5 · Pago
// ─────────────────────────────────────────────────────────────
function PayStep({ slug, shop, client, service, barber, slot, onBack, onSlotTaken, onLoggedOut, onDone }) {
  const [file, setFile]       = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy]       = useState(false)
  const [paidPath, setPaidPath] = useState(null)   // si el turno se ocupó, el comprobante ya subido se reusa
  const inputRef = useRef(null)

  useEffect(() => {
    if (!file || !/^image\//.test(file.type)) { setPreview(null); return }
    const u = URL.createObjectURL(file); setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const hasTransfer = shop.alias || shop.cbu
  const hasLink = !!shop.pay_link

  async function confirm() {
    if (!file || busy) return
    setBusy(true)
    try {
      const path = paidPath || await uploadReceipt(shop.id, file)
      setPaidPath(path)
      const r = await book({ token: client.token, slug, serviceId: service.id, barberId: barber?.id, startsAt: slot, receiptPath: path })
      onDone(r)
    } catch (err) {
      const m = err.message || ''
      if (/ocup/i.test(m)) { toast.error(m); onSlotTaken() }
      else if (/Volvé a entrar/i.test(m)) { toast.error(m); onLoggedOut() }
      else toast.error(m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <StepHeader title="Pagá y confirmá" subtitle="El turno se reserva con el pago total del servicio." onBack={onBack} />

      <div className="card !p-0 overflow-hidden mb-4">
        <div className="p-4 flex flex-col gap-2.5 text-sm">
          <Row k="Servicio" v={service.name} />
          <Row k="Barbero" v={barber ? barber.name : 'El primero libre'} />
          <Row k="Día" v={<span>{longDateAR(slot)}</span>} />
          <Row k="Hora" v={`${timeAR(slot)} hs`} />
          <Row k="A nombre de" v={client.name} />
        </div>
        <div className="px-4 py-3.5 border-t border-dark-400/40 bg-gold/[0.06] flex items-center justify-between">
          <span className="text-cream/60 text-sm font-semibold">Total a pagar</span>
          <span className="text-gold text-2xl font-bold">{money(service.price)}</span>
        </div>
      </div>

      <p className="label">1 · Pagá</p>
      <div className="flex flex-col gap-2 mb-5">
        {hasLink && (
          <a href={shop.pay_link} target="_blank" rel="noreferrer"
             className="btn-outline-gold !py-3.5 !border-gold flex items-center justify-center gap-2 !font-semibold">
            <CreditCard size={17} /> Pagar {money(service.price)} <ExternalLink size={14} className="opacity-60" />
          </a>
        )}
        {hasLink && hasTransfer && <p className="text-center text-cream/35 text-xs my-1">o por transferencia</p>}
        {hasTransfer && (
          <>
            <CopyRow label="Alias" value={shop.alias} />
            <CopyRow label="CBU / CVU" value={shop.cbu} />
            {(shop.holder || shop.bank) && (
              <p className="text-cream/45 text-xs px-1">
                {shop.holder && <>Titular: <span className="text-cream/70">{shop.holder}</span></>}
                {shop.holder && shop.bank && ' · '}
                {shop.bank}
              </p>
            )}
          </>
        )}
        {!hasLink && !hasTransfer && (
          <p className="text-cream/50 text-sm">La barbería todavía no cargó sus datos de pago. Escribiles por WhatsApp.</p>
        )}
      </div>

      <p className="label">2 · Subí el comprobante</p>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
             onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setPaidPath(null) } e.target.value = '' }} />
      {!file ? (
        <button onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl border-2 border-dashed border-dark-400/70 hover:border-gold/60 bg-dark-200/60 py-7 flex flex-col items-center gap-2 transition-colors">
          <Upload size={22} className="text-gold" />
          <span className="text-cream font-semibold text-sm">Elegir captura o foto</span>
          <span className="text-cream/35 text-xs">También PDF</span>
        </button>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 flex items-center gap-3">
          {preview
            ? <img src={preview} alt="" className="w-14 h-14 rounded-xl object-cover border border-dark-400/50" />
            : <div className="w-14 h-14 rounded-xl bg-dark-300 flex items-center justify-center"><FileText size={22} className="text-cream/50" /></div>}
          <div className="flex-1 min-w-0">
            <p className="text-cream text-sm font-semibold truncate">{file.name || 'Comprobante'}</p>
            <p className="text-emerald-500 text-xs font-semibold flex items-center gap-1"><Check size={12} /> Listo para enviar</p>
          </div>
          <button onClick={() => { setFile(null); setPaidPath(null) }} aria-label="Quitar"
            className="p-2 rounded-lg text-cream/40 hover:text-cream hover:bg-dark-300/60"><X size={16} /></button>
        </div>
      )}

      <button onClick={confirm} disabled={!file || busy}
        className="btn-gold w-full !py-4 mt-5 !text-[15px] flex items-center justify-center gap-2">
        {busy ? <><Spinner size={16} /> Reservando…</> : 'Confirmar reserva'}
      </button>
      <p className="text-cream/35 text-[11px] text-center mt-3">
        La barbería revisa el pago y te confirma el turno.
      </p>
    </>
  )
}

function Row({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-cream/45">{k}</span>
      <span className="text-cream font-semibold text-right">{v}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 6 · Listo
// ─────────────────────────────────────────────────────────────
function DoneStep({ shop, client, service, slot, result, onMine, onAgain }) {
  const end = new Date(new Date(slot).getTime() + service.duration_min * 60000)
  const text = `Hola! Soy ${client.name}. Reservé ${service.name} el ${longDateAR(slot)} a las ${timeAR(slot)} con ${result.barber_name}. Ya subí el comprobante.`
  return (
    <div className="text-center pt-4">
      <div className="mx-auto w-20 h-20 rounded-full bg-gold/12 border border-gold/30 flex items-center justify-center mb-5 animate-[pop_.4s_ease-out]">
        <Check size={38} className="text-gold" strokeWidth={2.5} />
      </div>
      <h2 className="font-display text-2xl font-semibold text-cream mb-1.5">¡Listo, {client.name.split(' ')[0]}!</h2>
      <p className="text-cream/50 text-sm mb-6 max-w-xs mx-auto">Tu turno quedó reservado. Apenas la barbería revise el pago, te lo confirma.</p>

      <div className="card text-left !p-4 flex flex-col gap-2.5 text-sm mb-5">
        <Row k="Servicio" v={service.name} />
        <Row k="Barbero" v={result.barber_name} />
        <Row k="Cuándo" v={<span>{longDateAR(slot)} · {timeAR(slot)} hs</span>} />
        <Row k="Estado" v={<span className={STATUS.pending.cls}>{STATUS.pending.short}</span>} />
      </div>

      <div className="flex flex-col gap-2">
        {shop.whatsapp && (
          <a href={waTo(shop.whatsapp, text)} target="_blank" rel="noreferrer"
             className="btn-gold !py-3.5 flex items-center justify-center gap-2"><MessageCircle size={16} /> Avisar por WhatsApp</a>
        )}
        <a href={googleCalLink({ title: `${service.name} · ${shop.name}`, start: slot, end, details: `Con ${result.barber_name}` })}
           target="_blank" rel="noreferrer"
           className="btn-outline-gold !py-3 flex items-center justify-center gap-2"><CalendarPlus size={16} /> Agendar en el calendario</a>
        <div className="flex gap-2 mt-1">
          <button onClick={onMine} className="btn-ghost flex-1">Mis turnos</button>
          <button onClick={onAgain} className="btn-ghost flex-1">Otro turno</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Mis turnos / perfil
// ─────────────────────────────────────────────────────────────
function MineStep({ shop, client, onClient, onLogout, onNew }) {
  const [me, setMe]       = useState(null)
  const [err, setErr]     = useState(false)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(false)
  const [name, setName]   = useState(client.name || '')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let alive = true
    setErr(false)
    fetchMe(client.token)
      .then(r => {
        if (!alive) return
        if (!r) { onLogout(); toast.error('Volvé a entrar con tu WhatsApp'); return }
        setMe(r)
      })
      .catch(() => alive && setErr(true))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.token, reload])

  async function saveName(e) {
    e.preventDefault()
    try {
      await rename(client.token, name)
      onClient({ ...client, name: name.trim() })
      setEditing(false); toast.success('Nombre actualizado')
    } catch (er) { toast.error(er.message) }
  }

  async function cancel(b) {
    if (!confirm(`¿Cancelar ${b.service_name} del ${longDateAR(b.starts_at)} a las ${timeAR(b.starts_at)}?`)) return
    setBusyId(b.id)
    try {
      await cancelBooking(client.token, b.id)
      toast.success('Turno cancelado')
      setReload(r => r + 1)
    } catch (er) { toast.error(er.message) } finally { setBusyId(null) }
  }

  const now = Date.now()
  const upcoming = (me?.bookings || []).filter(b => new Date(b.ends_at).getTime() > now && ['pending', 'confirmed'].includes(b.status))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const past = (me?.bookings || []).filter(b => !upcoming.includes(b))

  return (
    <>
      <div className="card !p-4 flex items-center gap-3.5 mb-6">
        <Avatar name={client.name} size={52} />
        <div className="flex-1 min-w-0">
          {editing ? (
            <form onSubmit={saveName} className="flex gap-2">
              <input value={name} onChange={e => setName(e.target.value)} className="input-dark !py-2" autoFocus maxLength={60} />
              <button className="btn-gold !px-3 !py-2" disabled={!name.trim()}><Check size={16} /></button>
            </form>
          ) : (
            <>
              <p className="text-cream font-semibold text-lg leading-tight truncate flex items-center gap-2">
                {client.name || 'Sin nombre'}
                <button onClick={() => setEditing(true)} className="text-cream/30 hover:text-gold" aria-label="Editar nombre"><Pencil size={13} /></button>
              </p>
              <p className="text-cream/45 text-sm">{client.phone}</p>
            </>
          )}
        </div>
        {!editing && (
          <button onClick={onLogout} className="btn-ghost !px-2.5" title="Salir"><LogOut size={16} /></button>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg font-semibold text-cream">Próximos turnos</h2>
        <button onClick={onNew} className="text-gold text-sm font-semibold">+ Nuevo</button>
      </div>

      {err && (
        <div className="card text-center py-6 mb-6">
          <p className="text-cream/60 text-sm mb-3">No pudimos cargar tus turnos.</p>
          <button className="btn-outline-gold" onClick={() => setReload(r => r + 1)}>Reintentar</button>
        </div>
      )}
      {!err && !me && <div className="py-10 flex justify-center"><Spinner /></div>}
      {me && !upcoming.length && (
        <div className="card-flat text-center py-8 mb-6">
          <p className="text-cream/50 text-sm mb-4">No tenés turnos por delante.</p>
          <button onClick={onNew} className="btn-gold">Reservar turno</button>
        </div>
      )}
      {me && upcoming.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-7">
          {upcoming.map(b => (
            <div key={b.id} className="card !p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-cream font-semibold">{longDateAR(b.starts_at)}</p>
                  <p className="text-gold font-bold text-xl leading-tight">{timeAR(b.starts_at)} hs</p>
                </div>
                <span className={STATUS[b.status]?.cls}>{STATUS[b.status]?.short}</span>
              </div>
              <p className="text-cream/55 text-sm">{b.service_name} · con {b.barber_name} · {money(b.price)}</p>
              <div className="flex gap-2 mt-3">
                {shop.whatsapp && (
                  <a href={waTo(shop.whatsapp, `Hola! Soy ${client.name}, tengo turno el ${longDateAR(b.starts_at)} a las ${timeAR(b.starts_at)}.`)}
                     target="_blank" rel="noreferrer" className="btn-ghost !px-3 flex items-center gap-1.5"><MessageCircle size={14} /> Escribir</a>
                )}
                <button onClick={() => cancel(b)} disabled={busyId === b.id}
                  className="btn-ghost !px-3 text-red-400/80 hover:!text-red-400 ml-auto">
                  {busyId === b.id ? <Spinner size={14} /> : 'Cancelar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {me && past.length > 0 && (
        <>
          <p className="label">Historial</p>
          <div className="flex flex-col divide-y divide-dark-400/30 card-flat !p-0">
            {past.slice(0, 15).map(b => (
              <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-cream/80 text-sm font-medium truncate">{b.service_name} · {b.barber_name}</p>
                  <p className="text-cream/40 text-xs">{longDateAR(b.starts_at)} · {timeAR(b.starts_at)}</p>
                </div>
                <span className={`${STATUS[b.status]?.cls} shrink-0`}>
                  {b.status === 'confirmed' ? 'Hecho' : STATUS[b.status]?.short}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
