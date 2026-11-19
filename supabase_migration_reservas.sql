-- ============================================================
-- MIGRACIÓN — Reservas online con pago por transferencia
-- Ejecutar en el SQL Editor de Supabase ANTES de publicar la versión
-- que la usa. Idempotente: se puede correr más de una vez.
--
-- Qué agrega:
--   · Página pública /reservar/<slug>: el cliente entra con su WhatsApp
--     (queda como perfil en la tabla customers de siempre), elige servicio,
--     barbero, día y hora, transfiere el total y sube el comprobante.
--   · El turno queda «pendiente» hasta que la barbería lo confirma.
--   · Horario semanal por barbero, bloqueos puntuales y «toma turnos sí/no».
--
-- No cambia nada de lo existente: ventas, registros y cierre siguen igual.
-- Nombres nuevos (rsv_*, bookings) para no chocar con pruebas viejas.
-- ============================================================

create extension if not exists btree_gist;

-- ── Duración de cada servicio y barberos que toman turnos ─────
alter table public.services
  add column if not exists duration_min int not null default 30;

alter table public.barbers
  add column if not exists takes_bookings boolean not null default true;

-- ── Ajustes de reservas (uno por barbería) ────────────────────
alter table public.tenant_config
  add column if not exists logo_url         text,                       -- logo de la barbería (ver supabase_migration_logo.sql)
  add column if not exists rsv_enabled      boolean not null default false,
  add column if not exists rsv_pay_link     text,                       -- link de pago (Mercado Pago, etc.)
  add column if not exists rsv_alias        text,
  add column if not exists rsv_cbu          text,
  add column if not exists rsv_holder       text,
  add column if not exists rsv_bank         text,
  add column if not exists rsv_whatsapp     text,
  add column if not exists rsv_slot_min     int not null default 30,   -- cada cuánto arranca un turno
  add column if not exists rsv_lead_min     int not null default 60,   -- anticipación mínima
  add column if not exists rsv_horizon_days int not null default 14,   -- cuántos días hacia adelante
  add column if not exists rsv_notice       text;                      -- aviso que ve el cliente

-- ── Perfil del cliente por WhatsApp ───────────────────────────
-- Se reusa customers: el cliente que reserva aparece en «Clientes».
alter table public.customers
  add column if not exists booking_token uuid;
create unique index if not exists customers_booking_token_uq
  on public.customers (booking_token) where booking_token is not null;

-- ── Horario semanal de cada barbero ───────────────────────────
-- weekday: 0 = domingo … 6 = sábado. Puede haber varias franjas por día
-- (ej. 10–13 y 16–20).
create table if not exists public.rsv_hours (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  barber_id  uuid not null references public.barbers(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  created_at timestamptz default now(),
  check (end_time > start_time)
);
create index if not exists rsv_hours_barber_idx on public.rsv_hours (barber_id, weekday);

-- ── Bloqueos puntuales (vacaciones, médico, día cerrado) ──────
-- barber_id null = bloquea a toda la barbería.
create table if not exists public.rsv_blocks (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  barber_id  uuid references public.barbers(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz default now(),
  check (ends_at > starts_at)
);
create index if not exists rsv_blocks_tenant_idx on public.rsv_blocks (tenant_id, starts_at);

-- ── Turnos ────────────────────────────────────────────────────
-- status: pending (pagó, falta confirmar) · confirmed · rejected · cancelled
create table if not exists public.bookings (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  barber_id      uuid not null references public.barbers(id) on delete cascade,
  service_id     uuid references public.services(id) on delete set null,
  service_name   text not null,
  customer_id    uuid references public.customers(id) on delete set null,
  customer_name  text not null,
  customer_phone text,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  price          numeric(10,2) not null default 0,
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','rejected','cancelled')),
  receipt_path   text,
  cancelled_by   text check (cancelled_by in ('customer','shop')),
  created_at     timestamptz default now(),
  decided_at     timestamptz,
  check (ends_at > starts_at)
);
create index if not exists bookings_tenant_start_idx on public.bookings (tenant_id, starts_at);
create index if not exists bookings_customer_idx     on public.bookings (customer_id, starts_at);

-- Un barbero nunca queda con dos turnos encimados (pendientes o confirmados)
do $$ begin
  alter table public.bookings add constraint bookings_no_overlap
    exclude using gist (barber_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status in ('pending','confirmed'));
exception when duplicate_object or duplicate_table then null; end $$;

-- ── RLS: la barbería ve y edita lo suyo ───────────────────────
alter table public.rsv_hours  enable row level security;
alter table public.rsv_blocks enable row level security;
alter table public.bookings   enable row level security;

drop policy if exists "rsv_hours_root"    on public.rsv_hours;
drop policy if exists "rsv_hours_tenant"  on public.rsv_hours;
drop policy if exists "rsv_blocks_root"   on public.rsv_blocks;
drop policy if exists "rsv_blocks_tenant" on public.rsv_blocks;
drop policy if exists "bookings_root"     on public.bookings;
drop policy if exists "bookings_tenant"   on public.bookings;
create policy "rsv_hours_root"    on public.rsv_hours  for all using (public.my_role() = 'root');
create policy "rsv_hours_tenant"  on public.rsv_hours  for all using (tenant_id = public.my_tenant_id());
create policy "rsv_blocks_root"   on public.rsv_blocks for all using (public.my_role() = 'root');
create policy "rsv_blocks_tenant" on public.rsv_blocks for all using (tenant_id = public.my_tenant_id());
create policy "bookings_root"     on public.bookings   for all using (public.my_role() = 'root');
create policy "bookings_tenant"   on public.bookings   for all using (tenant_id = public.my_tenant_id());

-- ============================================================
-- FUNCIONES PÚBLICAS (las usa la página del cliente, sin login)
-- El cliente nunca lee tablas directo: solo estas funciones.
-- ============================================================

-- Celular normalizado igual que en la app (solo dígitos, sin 54 / 9 / 0)
create or replace function public.rsv_norm_phone(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    coalesce(p,''), '\D', '', 'g'), '^54', ''), '^9', ''), '^0', ''), '')
$$;

-- Datos de la barbería para armar la página
create or replace function public.rsv_shop(p_slug text)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_t record; v_c record;
begin
  select * into v_t from tenants where slug = p_slug and is_active;
  if not found then return null; end if;
  select * into v_c from tenant_config where tenant_id = v_t.id;

  return json_build_object(
    'id', v_t.id, 'name', v_t.name, 'slug', v_t.slug,
    'logo_url', v_c.logo_url,
    'enabled',  coalesce(v_c.rsv_enabled, false),
    'pay_link', v_c.rsv_pay_link,
    'alias',    v_c.rsv_alias, 'cbu', v_c.rsv_cbu,
    'holder',   v_c.rsv_holder, 'bank', v_c.rsv_bank,
    'whatsapp', coalesce(nullif(v_c.rsv_whatsapp,''), v_t.phone),
    'notice',   v_c.rsv_notice,
    'slot_min', coalesce(v_c.rsv_slot_min, 30),
    'lead_min', coalesce(v_c.rsv_lead_min, 60),
    'horizon_days', coalesce(v_c.rsv_horizon_days, 14),
    'services', coalesce((
      select json_agg(json_build_object('id', s.id, 'name', s.name, 'price', s.price,
                                        'duration_min', s.duration_min) order by s.price, s.name)
      from services s where s.tenant_id = v_t.id and s.is_active), '[]'::json),
    'barbers', coalesce((
      select json_agg(json_build_object(
        'id', b.id, 'name', b.name, 'photo_url', b.photo_url,
        'off_services', coalesce((select json_agg(bs.service_id) from barber_services bs
                                   where bs.barber_id = b.id and not bs.is_enabled), '[]'::json)
      ) order by b.name)
      from barbers b
      where b.tenant_id = v_t.id and b.is_active and b.takes_bookings
        and exists (select 1 from rsv_hours h where h.barber_id = b.id)), '[]'::json)
  );
end $$;

-- Horarios libres de un día. p_barber null = cualquier barbero.
-- Devuelve una fila por (horario, barbero libre).
create or replace function public.rsv_slots(p_slug text, p_service uuid, p_barber uuid, p_date date)
returns table (starts_at timestamptz, barber_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  tz    constant text := 'America/Argentina/Buenos_Aires';
  v_t   uuid;
  v_c   record;
  v_dur int;
  v_today date := (now() at time zone tz)::date;
begin
  select t.id into v_t from tenants t where t.slug = p_slug and t.is_active;
  if v_t is null then return; end if;
  select * into v_c from tenant_config where tenant_id = v_t;
  if not coalesce(v_c.rsv_enabled, false) then return; end if;
  if p_date < v_today or p_date > v_today + coalesce(v_c.rsv_horizon_days, 14) then return; end if;
  select s.duration_min into v_dur from services s where s.id = p_service and s.tenant_id = v_t and s.is_active;
  if v_dur is null then return; end if;

  return query
  with b as (
    select br.id from barbers br
    where br.tenant_id = v_t and br.is_active and br.takes_bookings
      and (p_barber is null or br.id = p_barber)
      and not exists (select 1 from barber_services bs
                      where bs.barber_id = br.id and bs.service_id = p_service and not bs.is_enabled)
  ),
  cand as (
    select h.barber_id as bid, gs as st
    from rsv_hours h
    join b on b.id = h.barber_id
    cross join lateral generate_series(
      (p_date + h.start_time) at time zone tz,
      ((p_date + h.end_time) at time zone tz) - make_interval(mins => v_dur),
      make_interval(mins => greatest(coalesce(v_c.rsv_slot_min, 30), 5))
    ) gs
    where h.weekday = extract(dow from p_date)::int
  )
  select c.st, c.bid from cand c
  where c.st >= now() + make_interval(mins => coalesce(v_c.rsv_lead_min, 60))
    and not exists (
      select 1 from bookings k
      where k.barber_id = c.bid and k.status in ('pending','confirmed')
        and tstzrange(k.starts_at, k.ends_at) && tstzrange(c.st, c.st + make_interval(mins => v_dur)))
    and not exists (
      select 1 from rsv_blocks x
      where x.tenant_id = v_t and (x.barber_id is null or x.barber_id = c.bid)
        and tstzrange(x.starts_at, x.ends_at) && tstzrange(c.st, c.st + make_interval(mins => v_dur)))
  order by 1, 2;
end $$;

-- Días con lugar (para pintar el calendario del cliente)
create or replace function public.rsv_days(p_slug text, p_service uuid, p_barber uuid)
returns table (day date, free int)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select coalesce(c.rsv_horizon_days, 14) as h
    from tenants t left join tenant_config c on c.tenant_id = t.id
    where t.slug = p_slug
  )
  select d::date, (select count(distinct s.starts_at)::int from public.rsv_slots(p_slug, p_service, p_barber, d::date) s)
  from cfg, generate_series((now() at time zone 'America/Argentina/Buenos_Aires')::date,
                            (now() at time zone 'America/Argentina/Buenos_Aires')::date + cfg.h, interval '1 day') d
$$;

-- Entrar con WhatsApp. Si el número ya es cliente → entra directo.
-- Si es nuevo y no mandó nombre → { need_name: true }.
create or replace function public.rsv_login(p_slug text, p_phone text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_t uuid; v_key text; c record;
begin
  select id into v_t from tenants where slug = p_slug and is_active;
  if v_t is null then raise exception 'Barbería no encontrada'; end if;
  v_key := public.rsv_norm_phone(p_phone);
  if v_key is null or length(v_key) < 8 or length(v_key) > 12 then
    raise exception 'Revisá el número de WhatsApp (con código de área, sin 0 ni 15)';
  end if;

  select * into c from customers where tenant_id = v_t and phone_key = v_key;
  if not found then
    if coalesce(trim(p_name), '') = '' then
      return json_build_object('need_name', true);
    end if;
    insert into customers (tenant_id, name, phone, phone_key, booking_token)
    values (v_t, left(trim(p_name), 60), p_phone, v_key, gen_random_uuid())
    returning * into c;
  else
    if c.booking_token is null then
      update customers set booking_token = gen_random_uuid(), updated_at = now()
       where id = c.id returning * into c;
    end if;
    if coalesce(trim(c.name), '') = '' and coalesce(trim(p_name), '') <> '' then
      update customers set name = left(trim(p_name), 60), updated_at = now()
       where id = c.id returning * into c;
    end if;
  end if;

  return json_build_object('token', c.booking_token, 'name', coalesce(c.name, ''), 'phone', c.phone);
end $$;

-- Perfil + turnos del cliente
create or replace function public.rsv_me(p_token uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from customers where booking_token = p_token;
  if not found then return null; end if;
  return json_build_object(
    'name', c.name, 'phone', c.phone,
    'bookings', coalesce((
      select json_agg(json_build_object(
        'id', k.id, 'service_name', k.service_name, 'price', k.price,
        'starts_at', k.starts_at, 'ends_at', k.ends_at, 'status', k.status,
        'cancelled_by', k.cancelled_by,
        'barber_name', (select name from barbers where id = k.barber_id)
      ) order by k.starts_at desc)
      from (select * from bookings where customer_id = c.id order by starts_at desc limit 30) k
    ), '[]'::json)
  );
end $$;

-- Cambiar el nombre del perfil
create or replace function public.rsv_rename(p_token uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Poné tu nombre'; end if;
  update customers set name = left(trim(p_name), 60), updated_at = now() where booking_token = p_token;
end $$;

-- Reservar. p_barber null = el primero libre a esa hora.
create or replace function public.rsv_book(
  p_token uuid, p_slug text, p_service uuid, p_barber uuid, p_starts_at timestamptz, p_receipt_path text)
returns json language plpgsql security definer set search_path = public as $$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  v_t uuid; c record; s record; v_barber uuid; v_id uuid; v_active int;
begin
  select id into v_t from tenants where slug = p_slug and is_active;
  if v_t is null then raise exception 'Barbería no encontrada'; end if;
  select * into c from customers where booking_token = p_token and tenant_id = v_t;
  if not found then raise exception 'Volvé a entrar con tu WhatsApp'; end if;
  select * into s from services where id = p_service and tenant_id = v_t and is_active;
  if not found then raise exception 'Ese servicio ya no está disponible'; end if;
  if coalesce(p_receipt_path, '') = '' or split_part(p_receipt_path, '/', 1) <> v_t::text then
    raise exception 'Subí el comprobante de la transferencia';
  end if;

  select count(*) into v_active from bookings
   where customer_id = c.id and status in ('pending','confirmed') and starts_at > now();
  if v_active >= 3 then
    raise exception 'Ya tenés 3 turnos por delante. Si necesitás otro, escribile a la barbería.';
  end if;

  select sl.barber_id into v_barber
    from public.rsv_slots(p_slug, p_service, p_barber, (p_starts_at at time zone tz)::date) sl
   where sl.starts_at = p_starts_at
   order by (select count(*) from bookings k2 where k2.barber_id = sl.barber_id
              and k2.status in ('pending','confirmed')
              and (k2.starts_at at time zone tz)::date = (p_starts_at at time zone tz)::date)
   limit 1;
  if v_barber is null then
    raise exception 'Ese horario se acaba de ocupar. Elegí otro.';
  end if;

  begin
    insert into bookings (tenant_id, barber_id, service_id, service_name, customer_id, customer_name,
                          customer_phone, starts_at, ends_at, price, status, receipt_path)
    values (v_t, v_barber, s.id, s.name, c.id, coalesce(nullif(trim(c.name), ''), 'Cliente'),
            c.phone, p_starts_at, p_starts_at + make_interval(mins => s.duration_min), s.price,
            'pending', p_receipt_path)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar. Elegí otro.';
  end;

  update customers set updated_at = now() where id = c.id;

  return json_build_object('id', v_id, 'barber_id', v_barber,
                           'barber_name', (select name from barbers where id = v_barber));
end $$;

-- Cancelar (solo antes de la anticipación mínima)
create or replace function public.rsv_cancel(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k record; v_lead int;
begin
  select b.* into k from bookings b join customers c on c.id = b.customer_id
   where b.id = p_id and c.booking_token = p_token;
  if not found then raise exception 'Turno no encontrado'; end if;
  if k.status not in ('pending','confirmed') then raise exception 'Ese turno ya no está activo'; end if;
  select coalesce(rsv_lead_min, 60) into v_lead from tenant_config where tenant_id = k.tenant_id;
  if k.starts_at < now() + make_interval(mins => coalesce(v_lead, 60)) then
    raise exception 'Falta muy poco para el turno: escribile a la barbería por WhatsApp.';
  end if;
  update bookings set status = 'cancelled', cancelled_by = 'customer', decided_at = now() where id = p_id;
end $$;

grant execute on function public.rsv_shop(text)                                   to anon, authenticated;
grant execute on function public.rsv_slots(text, uuid, uuid, date)                to anon, authenticated;
grant execute on function public.rsv_days(text, uuid, uuid)                       to anon, authenticated;
grant execute on function public.rsv_login(text, text, text)                      to anon, authenticated;
grant execute on function public.rsv_me(uuid)                                     to anon, authenticated;
grant execute on function public.rsv_rename(uuid, text)                           to anon, authenticated;
grant execute on function public.rsv_book(uuid, text, uuid, uuid, timestamptz, text) to anon, authenticated;
grant execute on function public.rsv_cancel(uuid, uuid)                           to anon, authenticated;

-- ============================================================
-- STORAGE — comprobantes (privado)
-- El cliente solo puede SUBIR a la carpeta de una barbería con reservas
-- prendidas; solo la barbería puede VER sus comprobantes.
-- ============================================================
-- ¿Esa carpeta es de una barbería con reservas prendidas? (security definer:
-- el cliente anónimo no puede leer tenant_config directo)
create or replace function public.rsv_tenant_open(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenant_config where tenant_id::text = p_folder and rsv_enabled)
$$;
grant execute on function public.rsv_tenant_open(text) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('booking-receipts', 'booking-receipts', false)
on conflict (id) do nothing;

drop policy if exists "booking_receipts_upload" on storage.objects;
drop policy if exists "booking_receipts_read"   on storage.objects;

create policy "booking_receipts_upload" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'booking-receipts'
    and public.rsv_tenant_open((storage.foldername(name))[1])
  );

create policy "booking_receipts_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booking-receipts'
    and ((storage.foldername(name))[1] = public.my_tenant_id()::text or public.my_role() = 'root')
  );
