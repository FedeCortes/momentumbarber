# Momentum Barber — cómo funciona (en criollo)

Guía para entender toda la app: qué hace, cómo está armada, qué guarda la base
y por qué. Sin tecnicismos de más.

---

## 1. Qué es

Una app de gestión para barberías, **multi-barbería**: una sola instalación
atiende a muchas barberías ("tenants") y cada una ve **solo sus datos**.

Tres tipos de usuario:

| Rol | Quién | Qué hace |
|---|---|---|
| **root** | vos (dueño del sistema) | crea barberías, ve todo |
| **admin** | el dueño de cada barbería | gestión completa de SU barbería |
| **barbero** | cada peluquero | registra su trabajo del día, ve su agenda y su perfil |

---

## 2. Cómo se entra (login)

- **root y admin** entran con **email + contraseña** (o con el *slug* de la
  barbería en vez del email). Eso es una cuenta real de Supabase Auth.
- Hay **una sola cuenta de Supabase por barbería**. El admin y todos sus
  barberos comparten esa cuenta por debajo.
- **El barbero NO tiene cuenta propia.** Después de entrar como la barbería, en
  la pantalla "¿Con qué perfil ingresás?" elige *Barbero* → toca su nombre →
  (si tiene) pone su PIN. Eso queda guardado **en ese celular** (`localStorage`)
  y no se lo vuelve a pedir. "Cambiar" / "Cerrar sesión" lo borra.

**Consecuencia importante:** cuando un barbero está "logueado", las consultas a
la base viajan como la cuenta de la barbería. La app le muestra una pantalla
recortada, pero a nivel permisos tiene el mismo acceso que el admin **dentro de
su barbería** (nunca a otra).

Contraseñas de admin y PIN de barbero se guardan **en texto plano** en la tabla
`tenant_config` / `barbers`. Es una decisión consciente para barberías chicas;
si el proyecto crece hay que hashearlas.

---

## 3. Por qué NO se mezclan los datos entre barberías

La separación **no depende del código de la app**, está en la base de datos con
una función de Postgres llamada **RLS (Row Level Security)**.

- Cada tabla "de barbería" tiene una columna `tenant_id`.
- Hay una regla en la base: *"solo podés ver/tocar filas donde
  `tenant_id = mi_barbería`"*.
- "Mi barbería" la resuelve la función `my_tenant_id()`, que mira quién sos
  (`auth.uid()`) y busca tu `tenant_id` en la tabla `profiles`.
- Aunque la app se olvide de filtrar, o haya un bug en el frontend, **la base
  no devuelve filas de otra barbería.** Es imposible mezclarlas por accidente.

El `root` tiene una regla aparte que sí le deja ver todo.

**Único punto a vigilar:** las funciones de reservas online corren con permisos
elevados (`security definer`) porque las llama gente sin login. Resuelven la
barbería a partir del *slug* de la URL. Están revisadas, pero es la parte donde
un bug tendría más impacto.

---

## 4. Cómo está armada (arquitectura)

```
   NAVEGADOR (React + Vite)                 SUPABASE (todo el backend)
   ├── React Router (páginas)               ├── Postgres  → la base de datos
   ├── AuthContext → sesión y rol            ├── Auth      → login de admin/root
   ├── ThemeContext → modo claro/oscuro      ├── Storage   → fotos de barberos
   └── supabase-js → habla con Supabase      └── Funciones → RPCs + triggers
```

- **No hay servidor propio.** El frontend habla directo con Supabase.
- La "lógica de negocio" (comisiones, cierre) se calcula **en el frontend** y se
  guarda ya calculada en columnas de `sales` (se "congela" para que el
  histórico no cambie si mañana cambia una comisión).
- Deploy: el frontend es estático → **Netlify**. La base → **Supabase**.

Carpetas:

```
src/
├── pages/           una carpeta por rol: admin/, barber/, root/, auth/, booking/
├── components/      UI reutilizable (Modal, Spinner, WeekAgenda, CustomerPicker…)
├── context/         AuthContext (quién sos), ThemeContext
├── lib/             helpers: supabase.js, earnings.js (comisiones), booking.js,
│                    stock.js, photo.js, query.js (reintentos de red)
└── index.css        sistema de diseño: variables CSS para los 2 temas
supabase_migration_*.sql   cada cambio de base es un archivo que se corre a mano
supabase_schema.sql        foto de referencia del esquema (puede quedar atrasada)
```

---

## 5. Mapa de la app

### Admin (`/admin`) — menú agrupado por para-qué-sirve

| Grupo | Sección | Para qué |
|---|---|---|
| **Resumen** | Dashboard | números del día de un vistazo |
| | Estadísticas | gráficos por período (se carga aparte, pesa) |
| **Día a día** | Nueva venta | registro **oficial** de una venta (impacta stats y cierre) |
| | Agenda | turnos: vista semana (calendario) o día; turnos manuales |
| | Registros | los borradores que cargaron los barberos, para revisar |
| | Gastos | gastos operativos (no impactan el cierre) |
| | Cierre | cuánto se le paga a cada barbero al final del día |
| **Clientes y equipo** | Clientes | CRUD de clientes, historial, estrellas |
| | Barberos | alta de barberos, comisión general y por servicio |
| **Ajustes** | Configuración | catálogos, reservas online, stock, estrellas, contraseña |

### Barbero (`/barber`) — barra inferior

- **Registrar**: carga su trabajo del día como *borrador* (`drafts`). No es
  plata oficial; el admin lo revisa.
- **Agenda**: los turnos que le reservaron (semana/día). Marca Atendido / No vino.
- **Registros**: su historial y cuánto le corresponde.
- **Perfil**: su nombre, foto (se sube a Supabase Storage) y descripción.
  Desde ahí entra a **Mis horarios** (grilla semanal de cuándo atiende).

### Página pública de reservas (`/reservar/<slug>`) — sin login

El cliente elige servicio → barbero (o "cualquiera") → día y hora → deja sus
datos → queda confirmado. Recibe un link (`/reservar/<slug>/t/<id>?token=…`)
para cancelar o reprogramar solo.

---

## 6. La base de datos, tabla por tabla

### Núcleo

- **`tenants`** — las barberías. `name`, `slug` (para la URL y el login),
  `email`, `phone`, `is_active`.
- **`profiles`** — extiende a los usuarios de Supabase Auth. `role`
  (`root` / `admin`), `tenant_id`. Es lo que usa `my_tenant_id()`.
- **`tenant_config`** — todos los ajustes de una barbería en una fila:
  `admin_password`, `stock_enabled`, `booking_enabled` + parámetros de reservas
  (`booking_slot_min`, `booking_lead_hours`, `booking_horizon_days`,
  `booking_notice`, `booking_whatsapp`), `loyalty_enabled`, `loyalty_min`.

### Equipo y catálogo

- **`barbers`** — `name`, `photo_url`, `bio`, `commission_pct` (comisión
  general), `password_hash` (el PIN, texto plano), `is_active`, `bookable`
  (aparece en reservas online).
- **`services`** — `name`, `price`, `duration_min`, `bookable`, `description`,
  `sort_order`.
- **`barber_services`** — excepciones: qué servicio **no** hace un barbero, o
  con qué % lo cobra distinto. Sin fila = hace el servicio y cobra su % general.
- **`products`** (vitrina) y **`drinks`** (bebidas) — `price`, `barber_price`
  (precio especial para consumo del barbero), `stock`, `min_stock`.
- **`payment_methods`** — `name`, `surcharge_pct` (recargo que se suma solo).
- **`expense_payers`** — quién paga cada gasto.

### Ventas y plata

- **`sales`** — venta **oficial**. Barbero, método de pago, propina, totales por
  rubro, y **`barber_earnings` / `shop_earnings` calculados y congelados** al
  guardar. `customer_id` opcional. `sale_date`.
- **`sale_items`** — el detalle: tipo (`service`/`product`/`drink`), nombre y
  precio congelados, cantidad, y `commission_pct` aplicado en ese momento.
- **`drafts`** + **`draft_items`** — igual que sales/sale_items pero cargado por
  el **barbero**. No impacta stats. `status` (`pending`/`approved`/`discarded`).
- **`barber_purchases`** — consumo personal del barbero a precio especial. Se le
  descuenta en el cierre.
- **`expenses`** — gastos operativos. Aparte del cierre.

### Reservas / agenda

- **`barber_hours`** — grilla semanal por barbero. Varias filas por día = turno
  partido. Sin filas ese día = no atiende.
- **`barber_time_off`** — bloqueos puntuales (franco, vacaciones).
- **`appointments`** — los turnos. Barbero, servicio (nombre y precio
  congelados), `starts_at`/`ends_at`, `status`
  (`pending`/`confirmed`/`cancelled`/`completed`/`no_show`),
  datos del cliente, `customer_id`, `source` (`online`/`admin`),
  `cancel_token` (para el link de autogestión), `sale_id`.

### Clientes y fidelización

- **`customers`** — se identifican por **teléfono normalizado** (`phone_key`:
  solo dígitos, sin 0 ni 54 iniciales). `name`, `email`, `notes`, `stars`,
  `redemptions` (canjes). Único por `(tenant_id, phone_key)` → nunca se duplica
  el mismo teléfono.

---

## 7. Funciones de la base (por qué existen)

- **`my_tenant_id()` / `my_role()`** — el corazón del multi-tenant. Todas las
  reglas RLS las usan.
- **`adjust_stock(...)`** — suma/resta stock de forma atómica al vender.
- **`norm_phone(texto)`** — normaliza un teléfono. **Tiene que dar el mismo
  resultado que `normPhone()` en `src/lib/booking.js`** (si tocás una, tocá la
  otra).
- **`booking_shop(slug)`** — datos públicos de la barbería + servicios y
  barberos reservables. `security definer` (la llama gente sin login).
- **`booking_slots(slug, servicio, barbero, días)`** — el cálculo pesado:
  agarra los horarios de cada barbero, resta lo ya reservado y los bloqueos, y
  devuelve los huecos libres.
- **`booking_create(...)`** — crea el turno; re-valida el hueco, asigna barbero
  si vino "cualquiera", y **da de alta el cliente** (`customer_upsert`).
- **`booking_appointment` / `booking_cancel` / `booking_reschedule`** — la
  autogestión del cliente, protegida por el `cancel_token`.
- **`customer_upsert(tenant, tel, nombre, email)`** — alta/actualización de
  cliente por teléfono. Solo `authenticated`, y valida que el tenant sea el
  tuyo.
- **`customer_redeem(cliente)`** — registra un canje: `redemptions + 1`,
  `stars = 0`. Valida que la fidelización esté activa y que llegue al mínimo.
- **Trigger `award_loyalty_star`** — después de insertar una venta con
  `customer_id`, si la fidelización está activa, le suma **1 estrella** al
  cliente. Automático, invisible desde la app.

---

## 8. Flujos clave, paso a paso

### Registrar una venta (admin)

1. Elegís quién atendió (o "Solo local").
2. (Opcional) asociás un cliente — buscás o creás uno ahí mismo.
3. Cargás servicios / vitrina / bebidas, propina y método de pago.
4. La app calcula el reparto **servicio por servicio** (cada uno con su %),
   suma propina (100% barbero) y recargo del método (100% local).
5. Al confirmar: se inserta en `sales` + `sale_items` con las ganancias ya
   calculadas, se descuenta stock, y (si hay cliente + fidelización) el trigger
   suma la estrella.

### Reservar un turno (cliente, sin login)

1. `booking_shop(slug)` trae servicios y barberos.
2. Elige servicio y barbero → `booking_slots(...)` trae los horarios libres.
3. Completa nombre y teléfono → `booking_create(...)`:
   - vuelve a chequear que el hueco siga libre (con un lock para que dos
     personas no tomen el mismo),
   - da de alta / actualiza el cliente,
   - inserta el `appointment` confirmado.
4. Ve la confirmación con botón de WhatsApp a la barbería y link de autogestión.

### Canje por estrellas

1. En Configuración se prende "Canje por estrellas" y se pone el mínimo (ej. 10).
2. Cada venta oficial con cliente → +1 estrella (trigger).
3. Cuando `stars >= mínimo`, aparece **Canjear** en la ficha del cliente y en la
   pantalla de venta.
4. Canjear → `customer_redeem`: +1 canje, estrellas a 0. La visita siguiente
   vuelve a sumar desde 1.

### Cierre del día

Junta ventas, borradores aprobados, consumos y comisiones, y muestra cuánto
cobra cada barbero. Toda la matemática está en `DayClosingPage` + `earnings.js`.

---

## 9. Deploy y cómo actualizar

### Hoy

- **1 repo de GitHub** (`FedeCortes/momentumbarber`), rama `main` = producción.
- **1 sitio de Netlify** que despliega `main`.
- **1 proyecto de Supabase** (la base + auth + storage).
- Variables de entorno en Netlify (nunca en el repo):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### Dev vs. producción (recomendado)

- Rama **`dev`** con lo nuevo → **segundo sitio de Netlify** que despliega `dev`.
  Tu cliente real sigue en `main` y no ve nada hasta que hagas `merge dev → main`.
- Cuando haya más clientes o migraciones delicadas: **segundo proyecto de
  Supabase** para dev.

### Correr una migración

1. Abrir el archivo `supabase_migration_*.sql`.
2. Supabase → SQL Editor → New query → pegar todo → Run.
3. Son **idempotentes**: se pueden correr de nuevo sin romper nada.
4. Orden: primero `appointments`, después `booking_v2`.

> No hay herramienta de migraciones: son archivos sueltos que se corren a mano.
> Es la primera deuda técnica a resolver si esto crece (pasarse al CLI de
> Supabase).

---

## 10. Cosas a tener en cuenta (deuda técnica)

1. **Migraciones a mano.** Sin registro de qué se aplicó. `booking_shop` llegó a
   estar definida en 3 archivos → riesgo de que se desincronicen.
2. **La matemática de plata vive en el frontend.** Se congela bien en la base,
   pero un bug de cálculo escribe mal `barber_earnings` para siempre.
3. **Sin tests.** Unos pocos sobre `earnings.js` serían seguro barato.
4. **Contraseñas en texto plano.** OK para el modelo actual, no si crece.
5. **El barbero tiene, a nivel permisos, el mismo acceso que el admin** dentro
   de su barbería (la UI lo limita, no la base). No mezcla barberías.
6. **`get_tenant_email_by_slug` y `create_tenant_auth_user`** existen en la base
   pero su SQL no está en el repo (se corrió aparte). Si rearmás la base desde
   cero, hay que recuperarlas.
