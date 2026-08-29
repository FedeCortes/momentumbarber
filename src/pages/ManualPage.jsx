import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, LogIn, ShoppingBag, FileText, Moon, Users, Settings,
  ReceiptText, BarChart2, LayoutDashboard, PlusCircle, ClipboardList,
  AlertTriangle, Sparkles, Check, MessageCircle, Percent, ArrowRight, Rocket,
  Boxes, BookOpen,
} from 'lucide-react'
import BarberPole from '../components/ui/BarberPole'
import { useAuth } from '../context/AuthContext'

const setupSteps = [
  {
    icon: Users,
    title: 'Dá de alta a tu equipo',
    desc: 'Cargá cada barbero: nombre y comisión general. Es la base — después se ajusta.',
    to: '/admin/barbers',
    cta: 'Ir a Barberos',
  },
  {
    icon: Settings,
    title: 'Cargá tu catálogo',
    desc: 'Servicios, vitrina y bebidas (con su precio de barbero), métodos de pago y pagadores de gastos.',
    to: '/admin/config',
    cta: 'Ir a Configuración',
  },
  {
    icon: Percent,
    title: 'Afiná las comisiones',
    desc: 'Opcional: volvé a Barberos si alguno cobra distinto en un servicio puntual, o no lo hace.',
    to: '/admin/barbers',
    cta: 'Ir a Barberos',
  },
  {
    icon: Boxes,
    title: 'Activá el stock (opcional)',
    desc: 'Si querés llevar el inventario de vitrina y bebidas: prendé el control de stock y cargá cuántas unidades tenés de cada uno.',
    to: '/admin/config',
    cta: 'Ir a Configuración',
  },
  {
    icon: ShoppingBag,
    title: 'Registrá tu primera venta',
    desc: 'Con el equipo y los precios listos, ya podés cargar ventas reales del día a día.',
    to: '/admin/sales',
    cta: 'Ir a Nueva venta',
  },
  {
    icon: Moon,
    title: 'Cerrá la caja',
    desc: 'Al final del día, repartís lo que le corresponde a cada barbero y lo que queda para el local.',
    to: '/admin/closing',
    cta: 'Ir a Cierre',
  },
]

function Roadmap() {
  return (
    <div className="card mb-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--gold) / 0.15)' }}>
          <Rocket size={15} className="text-gold" />
        </div>
        <div>
          <p className="text-cream text-sm font-semibold">Puesta en marcha</p>
          <p className="text-cream/35 text-xs">Si es tu primera vez, seguí este orden</p>
        </div>
      </div>

      <div className="mt-4">
        {setupSteps.map((s, i) => (
          <div key={i} className="relative pl-11 pb-6 last:pb-0">
            {i < setupSteps.length - 1 && (
              <span
                className="absolute left-[15px] top-8 bottom-0 w-px"
                style={{ background: 'linear-gradient(to bottom, rgb(var(--gold) / 0.4), rgb(var(--gold) / 0.08))' }}
              />
            )}
            <div
              className="absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center border font-mono text-xs font-bold text-gold"
              style={{ background: 'rgb(var(--surface-card))', borderColor: 'rgb(var(--gold) / 0.4)' }}
            >
              {i + 1}
            </div>
            <div className="flex items-center gap-2 mb-0.5">
              <s.icon size={13} className="text-gold/70 shrink-0" />
              <p className="text-cream text-sm font-semibold">{s.title}</p>
            </div>
            <p className="text-cream/55 text-xs leading-relaxed">{s.desc}</p>
            <Link
              to={s.to}
              className="inline-flex items-center gap-1 mt-1.5 text-gold/80 hover:text-gold text-xs font-semibold transition-colors"
            >
              {s.cta} <ArrowRight size={11} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ title, tag, icon: Icon, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="border-b border-dark-400/30 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 py-3.5 text-left">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-dark-300 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-gold" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-cream text-sm font-semibold">{title}</p>
          {tag && <p className="text-cream/35 text-xs mt-0.5">{tag}</p>}
        </div>
        {open ? <ChevronUp size={15} className="text-cream/40 shrink-0" /> : <ChevronDown size={15} className="text-cream/40 shrink-0" />}
      </button>
      {open && (
        <div className="pb-4 sm:pl-11 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  )
}

function StepList({ children }) {
  return <ol className="flex flex-col gap-2.5">{children}</ol>
}
function Step({ n, children }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-gold font-mono text-xs pt-0.5 shrink-0">0{n}</span>
      <span className="text-cream/65 text-sm leading-relaxed">{children}</span>
    </li>
  )
}
function FactList({ children }) {
  return <ul className="flex flex-col gap-2">{children}</ul>
}
function Fact({ children }) {
  return (
    <li className="flex gap-2 text-cream/65 text-sm leading-relaxed">
      <Check size={13} className="text-gold shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  )
}
function Callout({ warn, children }) {
  return (
    <div className={`rounded-xl px-3.5 py-3 text-xs leading-relaxed flex gap-2.5 ${
      warn ? 'bg-amber-500/8 border border-amber-500/20 text-amber-200/80' : 'bg-gold/8 border border-gold/20 text-cream/70'
    }`}>
      {warn
        ? <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
        : <Sparkles size={14} className="text-gold shrink-0 mt-0.5" />}
      <span>{children}</span>
    </div>
  )
}

export default function ManualPage({ compact = false }) {
  const { isAdmin } = useAuth()

  return (
    <div className="pb-8">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: 'rgb(var(--gold))', boxShadow: 'var(--sh-gold)' }}>
          <BarberPole size={19} strokeWidth={2} style={{ color: 'rgb(var(--ink))' }} />
        </div>
        <div>
          <p className="page-eyebrow mb-0">Ayuda</p>
          <h1 className="section-title leading-tight">Manual</h1>
        </div>
      </div>
      <p className="section-sub mb-6">
        {compact
          ? 'Guía rápida para vos, el barbero.'
          : 'Momentum Barber es la caja registradora de tu barbería: cargás cada venta, el sistema reparte la comisión de cada barbero y a la noche el cierre ya está armado. Acá tenés cómo se usa, pantalla por pantalla.'}
      </p>

      {compact && (
        <Callout warn>
          <b>Ojo:</b> todo lo que cargás en Registrar es un <b>borrador</b>, nunca una venta oficial.
          Solo lo que carga el administrador cuenta como oficial — él lo compara contra tu registro y decide.
        </Callout>
      )}

      {!compact && isAdmin && <Roadmap />}

      {/* ── Antes de arrancar ── */}
      {!compact && (
        <div className="card mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-dark-300 flex items-center justify-center shrink-0">
              <LogIn size={15} className="text-gold" />
            </div>
            <p className="text-cream text-sm font-semibold">Antes de arrancar</p>
          </div>
          <p className="text-cream/60 text-sm leading-relaxed">
            Una cuenta abre la puerta de toda la barbería: usuario (o el nombre corto de tu barbería) y contraseña.
            Después elegís tu perfil — <b className="text-cream">Administrador</b> (pide una segunda clave, la de admin)
            o <b className="text-cream">Barbero</b> (elegís tu nombre; si tenés pin, te lo pide).
          </p>
          <Callout>Cambiás de perfil sin cerrar sesión con el botón <b>«Cambiar»</b>, arriba.</Callout>
        </div>
      )}

      {/* ── Si sos barbero ── */}
      {!compact && <p className="label mt-2">Si sos barbero</p>}
      <div className="card mb-4">
        <Row title="Registrar" tag="Cargar un corte" icon={PlusCircle} defaultOpen>
          <p className="text-cream/60 text-sm leading-relaxed">Lo primero que ves al entrar. Cargá cada corte apenas lo termines.</p>
          <StepList>
            <Step n={1}>Ves solo los <b>servicios habilitados</b> para vos. ¿Falta uno? Pedíselo al administrador.</Step>
            <Step n={2}>Sumás con <b>+</b>, restás con <b>−</b>. Comisión distinta a la general = etiqueta violeta.</Step>
            <Step n={3}><b>Vitrina</b> y <b>Bebidas</b>: 100% para el local, no dejan comisión.</Step>
            <Step n={4}><b>Propina</b>: 100% tuya. Elegís método de pago y confirmás.</Step>
          </StepList>
          <Callout warn><b>No es una venta oficial.</b> Solo lo que carga el administrador cuenta como oficial — él lo revisa en Registros. Cargá justo lo que cobraste.</Callout>
          <Callout>Si la barbería usa <b>control de stock</b>, cada bebida o producto te muestra cuántas <b>quedan</b>. Lo que está en rojo o <b>«Sin stock»</b> no lo podés cargar: avisale al administrador para que reponga.</Callout>
        </Row>

        <Row title="Mis registros" tag="Tu historial" icon={ClipboardList}>
          <p className="text-cream/60 text-sm leading-relaxed">
            Elegís un rango de fechas y te arma el resumen: cortes, propinas y <b>«Te corresponde»</b> — lo que deberías cobrar.
          </p>
          <FactList>
            <Fact>Abrís cada registro para ver el detalle de ítems y comisión.</Fact>
            <Fact><b>Editar</b> te lleva a Registrar con los datos cargados.</Fact>
            <Fact><b>Eliminar</b>: tocás dos veces para confirmar.</Fact>
          </FactList>
        </Row>
      </div>

      {/* ── Si sos administrador ── */}
      {!compact && <p className="label mt-2">Si sos administrador</p>}
      {!compact && (
      <div className="card mb-4">
        <Row title="Dashboard" tag="Pantalla de inicio" icon={LayoutDashboard} defaultOpen={isAdmin}>
          <p className="text-cream/60 text-sm leading-relaxed">Te avisa si hay registros de barberos sin revisar, y te muestra lo recaudado hoy y en el mes.</p>
        </Row>

        <Row title="Nueva venta" tag="Cargar cada venta real" icon={ShoppingBag}>
          <p className="text-cream/60 text-sm leading-relaxed">Dos pestañas, según qué estés cargando.</p>
          <StepList>
            <Step n={1}><b>¿Quién lo atendió?</b> El barbero, o «Solo local» (100% para el local).</Step>
            <Step n={2}><b>Servicios:</b> solo los habilitados para ese barbero, con el reparto ya calculado.</Step>
            <Step n={3}><b>Vitrina y Bebidas</b> (100% local), propina y método de pago (recargo automático). Con el stock activo se ve cuántas quedan y no te deja vender sin stock.</Step>
            <Step n={4}>Confirmás y queda como venta oficial, la que cuenta para el Cierre <i>(y la que descuenta stock)</i>.</Step>
          </StepList>
          <p className="text-cream/60 text-sm leading-relaxed mt-1">
            <b className="text-gold">Consumo de barbero</b>: cuando un barbero se compra algo para él, a un precio distinto al de cliente.
            Elegís el barbero, cargás el producto (ya con su precio de barbero) y se descuenta solo en el Cierre.
          </p>
        </Row>

        <Row title="Registros" tag="Comparar lo cargado vs. lo oficial" icon={FileText}>
          <p className="text-cream/60 text-sm leading-relaxed">
            Compará lo que cada barbero cargó contra la venta oficial <i>(la oficial es siempre la que carga el administrador — el registro del barbero nunca cuenta por sí solo)</i>.
          </p>
          <FactList>
            <Fact><b>Coincide</b>: check verde.</Fact>
            <Fact><b>No coincide</b>: aviso, antes de que se escape en el cierre.</Fact>
            <Fact><b>Copiar</b> a venta oficial, <b>editar</b> o <b>descartar</b> — sin tipear de nuevo.</Fact>
          </FactList>
        </Row>

        <Row title="Cierre" tag="El resumen del día" icon={Moon}>
          <StepList>
            <Step n={1}><b>Total recaudado</b>, separado por método de pago.</Step>
            <Step n={2}><b>A pagarle a cada barbero</b>: servicios, comisión, propinas — y resta lo que consumió a precio de barbero.</Step>
            <Step n={3}><b>Para el local</b>: lo que efectivamente queda en la barbería.</Step>
          </StepList>
          <Callout><b>Compartís por WhatsApp</b> o lo descargás como texto con un botón.</Callout>
        </Row>

        <Row title="Barberos" tag="Alta, edición y comisiones" icon={Users}>
          <FactList>
            <Fact>Nombre y <b>comisión general</b> sobre servicios.</Fact>
            <Fact><b>Servicios habilitados</b>, con % distinto si corresponde.</Fact>
            <Fact>Una <b>contraseña opcional</b> para entrar a su perfil.</Fact>
          </FactList>
          <Callout warn><b>Eliminar</b> borra en cascada sus ventas y registros. Si solo dejó de trabajar, mejor <b>desactivalo</b>.</Callout>
        </Row>

        <Row title="Configuración" tag="Los catálogos de tu barbería" icon={Settings}>
          <FactList>
            <Fact><b>Servicios</b> — nombre y precio.</Fact>
            <Fact><b>Vitrina y bebidas</b> — precio normal y precio de barbero.</Fact>
            <Fact><b>Pagadores</b> y <b>métodos de pago</b> (con recargo si corresponde).</Fact>
            <Fact>El <b>switch de Control de stock</b> (ver abajo) y la <b>clave de administrador</b>.</Fact>
          </FactList>
        </Row>

        <Row title="Control de stock" tag="Opcional — inventario de vitrina y bebidas" icon={Boxes}>
          <p className="text-cream/60 text-sm leading-relaxed">
            Un switch en <b>Configuración</b> lo prende o lo apaga. <b>Apagado</b> (por defecto), la app funciona igual que siempre y no se habla más de stock.
            <b> Prendido</b>, cada producto y bebida lleva su inventario.
          </p>
          <StepList>
            <Step n={1}>En <b>Configuración → Productos / Bebidas</b>, cargás cuántas unidades tenés con <b>− / +</b> o escribiendo el número.</Step>
            <Step n={2}>Con el lápiz fijás el <b>stock mínimo</b> (punto de reposición). Cuando el stock llega a ese número o menos, queda en <b>rojo</b>; por encima, en <b>verde</b>.</Step>
            <Step n={3}>Al vender (vos, el consumo de barbero o el registro del barbero) aparece cuántas <b>quedan</b>, y baja a medida que sumás.</Step>
            <Step n={4}>Si algo está en <b>0</b> no se puede vender hasta reponer.</Step>
          </StepList>
          <Callout>El stock <b>se descuenta solo en la venta oficial</b> (o al pasar un borrador a oficial). Si editás o eliminás esa venta, el stock se ajusta o se repone solo.</Callout>
          <Callout warn>El registro del barbero <b>muestra</b> el stock pero <b>no lo descuenta</b>: la baja real ocurre cuando la venta se hace oficial. Mientras tanto el número puede quedar un poco alto si todavía no cerraste el día.</Callout>
        </Row>

        <Row title="Gastos" tag="Lo que sale de la caja" icon={ReceiptText}>
          <p className="text-cream/60 text-sm leading-relaxed">Insumos, alquiler o cualquier gasto: nombre, monto, quién pagó. Resumen por pagador.</p>
          <Callout>Los gastos <b>no descuentan del Cierre</b>. Es un registro aparte.</Callout>
        </Row>

        <Row title="Estadísticas" tag="Cómo viene el negocio" icon={BarChart2}>
          <FactList>
            <Fact>Ventas por día, en un gráfico.</Fact>
            <Fact>Qué <b>servicios se piden más</b>.</Fact>
            <Fact><b>Ranking de barberos</b> por facturación y métodos de pago.</Fact>
          </FactList>
        </Row>
      </div>
      )}

      {/* ── Quién ve qué ── */}
      {!compact && (
        <>
          <p className="label mt-2">Quién ve qué</p>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="card flex-1">
              <p className="text-cream text-sm font-semibold mb-2">Barbero</p>
              <p className="text-cream/55 text-xs leading-relaxed">Registrar · Mis registros</p>
            </div>
            <div className="card flex-1" style={{ borderColor: 'rgb(var(--gold) / 0.3)' }}>
              <p className="text-gold text-sm font-semibold mb-2">Administrador</p>
              <p className="text-cream/55 text-xs leading-relaxed">Dashboard · Nueva venta · Registros · Barberos · Gastos · Cierre · Estadísticas · Configuración</p>
            </div>
          </div>
        </>
      )}

      {/* ── Glosario ── */}
      <p className="label mt-2">En criollo</p>
      <div className="card mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-dark-300 flex items-center justify-center shrink-0">
            <BookOpen size={15} className="text-gold" />
          </div>
          <p className="text-cream text-sm font-semibold">Cuatro palabras que se repiten</p>
        </div>
        <dl className="flex flex-col gap-3">
          {[
            ['Borrador', 'Lo que carga el barbero desde su celular. Es su registro, sirve para comparar. Nunca cuenta por sí solo.'],
            ['Venta oficial', 'La que carga el administrador. Es la única que cuenta para el Cierre, las Estadísticas y el stock.'],
            ['Comisión', 'El porcentaje de cada servicio que se lleva el barbero. Puede ser general o distinta para un servicio puntual.'],
            ['Cierre', 'El resumen del día: cuánto entró, cuánto le toca a cada barbero y cuánto queda para el local.'],
          ].map(([term, def]) => (
            <div key={term}>
              <dt className="text-cream text-sm font-semibold">{term}</dt>
              <dd className="text-cream/55 text-xs leading-relaxed mt-0.5">{def}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── FAQ ── */}
      <p className="label mt-2">Preguntas frecuentes</p>
      <div className="card mb-4">
        {compact ? (
          <>
            <Row title="¿Por qué esto no es una venta oficial?" defaultOpen>
              <p className="text-cream/60 text-sm leading-relaxed">
                Porque solo lo que carga el administrador cuenta como oficial. Tu registro es un borrador: sirve para que él lo compare
                contra la venta real y decida.
              </p>
            </Row>
            <Row title="¿Cómo sé si mi registro quedó como venta oficial?">
              <p className="text-cream/60 text-sm leading-relaxed">Preguntale al administrador — él lo revisa en Registros. Vos, en Mis registros, siempre ves tu propio cálculo.</p>
            </Row>
            <Row title="¿Por qué la vitrina y las bebidas no me dejan comisión?">
              <p className="text-cream/60 text-sm leading-relaxed">Van 100% al local por defecto. Distinto es el precio de barbero, que se descuenta en el Cierre si compraste algo para vos.</p>
            </Row>
            <Row title="Un producto dice «Sin stock», ¿qué hago?">
              <p className="text-cream/60 text-sm leading-relaxed">No lo podés cargar hasta que el administrador reponga: avisale. El número de «quedan» lo maneja él desde Configuración.</p>
            </Row>
          </>
        ) : (
          <>
            <Row title="¿Por qué la vitrina y las bebidas no le dejan comisión al barbero?">
              <p className="text-cream/60 text-sm leading-relaxed">
                Por defecto van 100% al local. Distinto es el <b>precio de barbero</b>: lo que paga si compra para sí mismo, eso sí se descuenta en el Cierre.
              </p>
            </Row>
            <Row title="Un barbero cargó algo distinto a la venta real, ¿qué hago?">
              <p className="text-cream/60 text-sm leading-relaxed">
                Andá a Registros: comparás su registro contra la venta oficial. Para el Cierre siempre cuenta la venta oficial
                <i> (la que carga el administrador — el registro del barbero nunca cuenta por sí solo)</i>.
              </p>
            </Row>
            <Row title="¿Los gastos bajan el total del Cierre?">
              <p className="text-cream/60 text-sm leading-relaxed">No. Es un registro aparte, no toca la caja del día.</p>
            </Row>
            <Row title="Se va un barbero de la barbería, ¿lo borro?">
              <p className="text-cream/60 text-sm leading-relaxed">Mejor desactivalo desde Barberos. Eliminarlo borra también sus ventas y registros.</p>
            </Row>
            <Row title="¿Cómo cambio la clave de administrador?">
              <p className="text-cream/60 text-sm leading-relaxed">Configuración → Cambiar contraseña de administrador. Mínimo 4 caracteres.</p>
            </Row>
            <Row title="¿Cómo funciona el precio de barbero?">
              <p className="text-cream/60 text-sm leading-relaxed">Se configura una vez por producto, en Configuración. En «Consumo de barbero» se aplica solo y se descuenta en el Cierre.</p>
            </Row>
            <Row title="¿Tengo que usar el control de stock?">
              <p className="text-cream/60 text-sm leading-relaxed">No. Viene apagado y la app funciona igual sin él. Prendelo solo si querés llevar el inventario de vitrina y bebidas — se activa y desactiva cuando quieras desde Configuración.</p>
            </Row>
            <Row title="¿Para qué sirve el «stock mínimo»?">
              <p className="text-cream/60 text-sm leading-relaxed">Es el punto de reposición: cuando el stock baja hasta ese número (o menos) el producto se marca en rojo, para que sepas de una qué comprar. Por encima, verde.</p>
            </Row>
            <Row title="Vendí algo y el stock no bajó, ¿por qué?">
              <p className="text-cream/60 text-sm leading-relaxed">El stock baja con la <b>venta oficial</b> (la que cargás vos), no con el borrador del barbero. Al cerrar el día y pasar todo a oficial, queda al día. Si editás o borrás una venta, el stock se ajusta solo.</p>
            </Row>
          </>
        )}
      </div>

      <a
        href="https://wa.me/5491121608606"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-outline-gold w-full flex items-center justify-center gap-2"
      >
        <MessageCircle size={15} /> ¿Dudas con la app? Escribinos
      </a>
    </div>
  )
}
