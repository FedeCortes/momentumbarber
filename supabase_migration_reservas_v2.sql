-- ============================================================
-- ⚠ ORDEN: reservas → logo → reservas_v2 → reservas_v3. Si ya corriste v3, NO vuelvas a correr esta.
-- MIGRACIÓN — Reservas v2
--   1) Precio online propio por servicio (opcional).
--   2) La página del cliente muestra los horarios ocupados (en rojo) y
--      distingue «agenda llena» de «cerrado».
--   3) Cada venta / registro puede quedar atado a su turno reservado
--      (booking_id): así el turno pagado por adelantado se carga UNA sola vez
--      y en Registros y en el Cierre se ve que vino de una reserva.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de supabase_migration_reservas.sql.
-- Idempotente. No cambia turnos ni precios existentes: un servicio sin
-- precio online se sigue cobrando a su precio de siempre.
-- ============================================================

-- Por si no se corrió la del logo (rsv_shop lo usa)
alter table public.tenant_config add column if not exists logo_url text;

-- ── 1) Precio online (vacío = mismo precio que en el local) ──
alter table public.services
  add column if not exists booking_price numeric(10,2)
  check (booking_price is null or booking_price >= 0);

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
      select json_agg(json_build_object('id', s.id, 'name', s.name,
                                        'price', coalesce(s.booking_price, s.price),
                                        'duration_min', s.duration_min)
                      order by coalesce(s.booking_price, s.price), s.name)
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
            c.phone, p_starts_at, p_starts_at + make_interval(mins => s.duration_min), coalesce(s.booking_price, s.price),
            'pending', p_receipt_path)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar. Elegí otro.';
  end;

  update customers set updated_at = now() where id = c.id;

  return json_build_object('id', v_id, 'barber_id', v_barber,
                           'barber_name', (select name from barbers where id = v_barber));
end $$;

-- ── 2) Grilla completa del día: libres y ocupados ────────────
-- Una fila por (horario, barbero) con free = true/false.
-- Ocupado = turno pendiente/confirmado o bloqueo («Ocupado» del panel).
-- No muestra horarios que ya pasaron (ni dentro de la anticipación mínima).
create or replace function public.rsv_grid(p_slug text, p_service uuid, p_barber uuid, p_date date)
returns table (starts_at timestamptz, barber_id uuid, free boolean)
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
  select c.st, c.bid,
    not exists (
      select 1 from bookings k
      where k.barber_id = c.bid and k.status in ('pending','confirmed')
        and tstzrange(k.starts_at, k.ends_at) && tstzrange(c.st, c.st + make_interval(mins => v_dur)))
    and not exists (
      select 1 from rsv_blocks x
      where x.tenant_id = v_t and (x.barber_id is null or x.barber_id = c.bid)
        and tstzrange(x.starts_at, x.ends_at) && tstzrange(c.st, c.st + make_interval(mins => v_dur)))
  from cand c
  where c.st >= now() + make_interval(mins => coalesce(v_c.rsv_lead_min, 60))
  order by 1, 2;
end $$;

-- Los libres salen de la misma grilla (una sola regla para todo)
create or replace function public.rsv_slots(p_slug text, p_service uuid, p_barber uuid, p_date date)
returns table (starts_at timestamptz, barber_id uuid)
language sql stable security definer set search_path = public as $$
  select g.starts_at, g.barber_id from public.rsv_grid(p_slug, p_service, p_barber, p_date) g where g.free
$$;

-- Días: libres y total (total 0 = cerrado; libres 0 con total > 0 = agenda llena)
drop function if exists public.rsv_days(text, uuid, uuid);
create function public.rsv_days(p_slug text, p_service uuid, p_barber uuid)
returns table (day date, free int, total int)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select coalesce(c.rsv_horizon_days, 14) as h
    from tenants t left join tenant_config c on c.tenant_id = t.id
    where t.slug = p_slug
  )
  select d::date,
         (select count(distinct g.starts_at) filter (where g.free)::int from public.rsv_grid(p_slug, p_service, p_barber, d::date) g),
         (select count(distinct g.starts_at)::int                       from public.rsv_grid(p_slug, p_service, p_barber, d::date) g)
  from cfg, generate_series((now() at time zone 'America/Argentina/Buenos_Aires')::date,
                            (now() at time zone 'America/Argentina/Buenos_Aires')::date + cfg.h, interval '1 day') d
$$;

-- ── 3) Venta / registro ← turno reservado ────────────────────
alter table public.sales  add column if not exists booking_id uuid references public.bookings(id) on delete set null;
alter table public.drafts add column if not exists booking_id uuid references public.bookings(id) on delete set null;
-- Un turno no puede cargarse dos veces como venta oficial ni como registro
create unique index if not exists sales_booking_uq  on public.sales  (booking_id) where booking_id is not null;
create unique index if not exists drafts_booking_uq on public.drafts (booking_id) where booking_id is not null;

grant execute on function public.rsv_shop(text)                                      to anon, authenticated;
grant execute on function public.rsv_book(uuid, text, uuid, uuid, timestamptz, text)   to anon, authenticated;
grant execute on function public.rsv_grid(text, uuid, uuid, date)                      to anon, authenticated;
grant execute on function public.rsv_slots(text, uuid, uuid, date)                     to anon, authenticated;
grant execute on function public.rsv_days(text, uuid, uuid)                            to anon, authenticated;
