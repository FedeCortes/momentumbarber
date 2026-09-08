-- ============================================================
-- MIGRACIÓN — Turnos v2: clientes, perfil de barbero, fotos,
--                        cliente en la venta y canje por estrellas
-- Ejecutar en el SQL Editor de Supabase (idempotente)
-- Requiere haber corrido antes supabase_migration_appointments.sql
-- ============================================================

-- ── Perfil del barbero ─────────────────────────────────────
alter table public.barbers
  add column if not exists bio text;

-- Por si se corrió una versión vieja de la migración de reservas sin esta columna
alter table public.tenant_config
  add column if not exists booking_whatsapp text;

-- ── CLIENTES ───────────────────────────────────────────────
-- Se identifican por teléfono normalizado (phone_key).
create table if not exists public.customers (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  phone_key  text not null,
  phone      text,
  name       text,
  email      text,
  notes      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, phone_key)
);
create index if not exists customers_tenant_phone_idx on public.customers (tenant_id, phone_key);
create index if not exists customers_tenant_name_idx  on public.customers (tenant_id, name);

alter table public.appointments
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists appointments_customer_idx on public.appointments (customer_id);

-- ── RLS ────────────────────────────────────────────────────
alter table public.customers enable row level security;
drop policy if exists "customers_root"   on public.customers;
drop policy if exists "customers_tenant" on public.customers;
create policy "customers_root"   on public.customers for all using (public.my_role() = 'root');
create policy "customers_tenant" on public.customers for all using (tenant_id = public.my_tenant_id());

-- ── Normalización de teléfono (espeja normPhone() del front) ─
-- solo dígitos → saca 54 inicial → saca 0 inicial
create or replace function public.norm_phone(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), '\D', '', 'g'),
      '^54', ''),
    '^0', ''),
  '')
$$;

-- ── Alta/actualización de cliente por teléfono ─────────────
create or replace function public.customer_upsert(
  p_tenant uuid, p_phone text, p_name text, p_email text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_key text; v_id uuid;
begin
  -- Un usuario logueado solo puede tocar clientes de su propia barbería.
  -- (El flujo anónimo entra por booking_create, que resuelve el tenant del slug.)
  if auth.uid() is not null and p_tenant is distinct from public.my_tenant_id() then
    raise exception 'No autorizado';
  end if;

  v_key := public.norm_phone(p_phone);
  if v_key is null then return null; end if;   -- sin teléfono válido no hay cliente

  insert into public.customers (tenant_id, phone_key, phone, name, email)
  values (p_tenant, v_key, nullif(trim(p_phone), ''), nullif(trim(p_name), ''), nullif(trim(p_email), ''))
  on conflict (tenant_id, phone_key) do update
    set name       = coalesce(nullif(customers.name, ''),  excluded.name),
        email      = coalesce(nullif(customers.email, ''), excluded.email),
        phone      = coalesce(customers.phone, excluded.phone),
        updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.norm_phone(text)                        to anon, authenticated;
revoke execute on function public.customer_upsert(uuid, text, text, text) from anon;
grant  execute on function public.customer_upsert(uuid, text, text, text) to authenticated;

-- ============================================================
-- booking_shop — ahora devuelve la bio de cada barbero
-- ============================================================
create or replace function public.booking_shop(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when t.id is null or not coalesce(c.booking_enabled, false) then null
    else jsonb_build_object(
      'tenant', jsonb_build_object(
        'name', t.name, 'slug', t.slug, 'phone', t.phone,
        'whatsapp', nullif(coalesce(c.booking_whatsapp, t.phone), '')
      ),
      'config', jsonb_build_object(
        'notice',       c.booking_notice,
        'slot_min',     coalesce(c.booking_slot_min, 15),
        'lead_hours',   coalesce(c.booking_lead_hours, 2),
        'horizon_days', coalesce(c.booking_horizon_days, 21)
      ),
      'services', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'price', s.price,
          'duration_min', s.duration_min, 'description', s.description
        ) order by coalesce(s.sort_order, 0), s.name)
        from public.services s
        where s.tenant_id = t.id and s.is_active and coalesce(s.bookable, true)
      ), '[]'::jsonb),
      'barbers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'name', b.name, 'photo_url', b.photo_url, 'bio', b.bio
        ) order by b.name)
        from public.barbers b
        where b.tenant_id = t.id and b.is_active and coalesce(b.bookable, true)
      ), '[]'::jsonb)
    )
  end
  from public.tenants t
  left join public.tenant_config c on c.tenant_id = t.id
  where t.slug = lower(p_slug) and t.is_active;
$$;

-- ============================================================
-- booking_create — ahora liga el turno a un cliente
-- ============================================================
create or replace function public.booking_create(
  p_slug text, p_service_id uuid, p_barber_id uuid, p_starts_at timestamptz,
  p_name text, p_phone text, p_email text, p_notes text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tz      text := 'America/Argentina/Buenos_Aires';
  v_tenant  uuid;
  v_cfg     record;
  v_name    text;
  v_price   numeric;
  v_duration int;
  v_end     timestamptz;
  v_barber  uuid;
  v_barber_name text;
  v_appt    public.appointments;
  v_local   timestamp;
  v_customer uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'Nombre y teléfono son obligatorios';
  end if;

  select id into v_tenant from public.tenants where slug = lower(p_slug) and is_active;
  if v_tenant is null then raise exception 'Barbería no encontrada'; end if;

  select * into v_cfg from public.tenant_config where tenant_id = v_tenant;
  if v_cfg is null or not coalesce(v_cfg.booking_enabled, false) then
    raise exception 'Las reservas online no están habilitadas';
  end if;

  select name, coalesce(price, 0), coalesce(duration_min, 30)
    into v_name, v_price, v_duration
    from public.services
   where id = p_service_id and tenant_id = v_tenant and is_active and coalesce(bookable, true);
  if v_name is null then raise exception 'Servicio no disponible'; end if;

  v_end   := p_starts_at + make_interval(mins => v_duration);
  v_local := p_starts_at at time zone v_tz;

  if p_starts_at < now() + make_interval(hours => greatest(0, coalesce(v_cfg.booking_lead_hours, 2))) then
    raise exception 'Ese horario ya no está disponible';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_tenant::text || p_starts_at::text));

  select b.id, b.name into v_barber, v_barber_name
  from public.barbers b
  where b.tenant_id = v_tenant and b.is_active and coalesce(b.bookable, true)
    and (p_barber_id is null or b.id = p_barber_id)
    and not exists (
      select 1 from public.barber_services bs
      where bs.barber_id = b.id and bs.service_id = p_service_id and bs.is_enabled = false
    )
    and exists (
      select 1 from public.barber_hours h
      where h.barber_id = b.id
        and h.weekday = extract(dow from v_local)::int
        and v_local::time >= h.start_time
        and (v_end at time zone v_tz)::time <= h.end_time
    )
    and not exists (
      select 1 from public.barber_time_off t
      where t.barber_id = b.id and t.starts_at < v_end and t.ends_at > p_starts_at
    )
    and not exists (
      select 1 from public.appointments a
      where a.barber_id = b.id and a.status in ('pending','confirmed')
        and a.starts_at < v_end and a.ends_at > p_starts_at
    )
  order by (
    select count(*) from public.appointments a2
    where a2.barber_id = b.id and a2.status in ('pending','confirmed')
      and (a2.starts_at at time zone v_tz)::date = v_local::date
  ) asc, random()
  limit 1;

  if v_barber is null then raise exception 'Ese horario ya no está disponible'; end if;

  v_customer := public.customer_upsert(v_tenant, p_phone, p_name, p_email);

  insert into public.appointments (
    tenant_id, barber_id, service_id, service_name, service_price, duration_min,
    starts_at, ends_at, status, customer_name, customer_phone, customer_email, notes, source, customer_id
  ) values (
    v_tenant, v_barber, p_service_id, v_name, v_price, v_duration,
    p_starts_at, v_end, 'confirmed', trim(p_name), trim(p_phone),
    nullif(trim(p_email), ''), nullif(trim(p_notes), ''), 'online', v_customer
  ) returning * into v_appt;

  return jsonb_build_object(
    'id', v_appt.id, 'cancel_token', v_appt.cancel_token, 'barber_name', v_barber_name,
    'starts_at', v_appt.starts_at, 'ends_at', v_appt.ends_at,
    'service_name', v_appt.service_name, 'service_price', v_appt.service_price
  );
end;
$$;

-- ============================================================
-- Backfill — clientes a partir de los turnos ya existentes
-- ============================================================
insert into public.customers (tenant_id, phone_key, phone, name, email)
select distinct on (a.tenant_id, public.norm_phone(a.customer_phone))
       a.tenant_id, public.norm_phone(a.customer_phone),
       a.customer_phone, a.customer_name, a.customer_email
from public.appointments a
where public.norm_phone(a.customer_phone) is not null
order by a.tenant_id, public.norm_phone(a.customer_phone), a.created_at
on conflict (tenant_id, phone_key) do nothing;

update public.appointments a
set customer_id = c.id
from public.customers c
where a.customer_id is null
  and c.tenant_id = a.tenant_id
  and c.phone_key = public.norm_phone(a.customer_phone);

-- ============================================================
-- CLIENTE EN LA VENTA  +  CANJE POR ESTRELLAS (fidelización)
-- ============================================================
alter table public.customers
  add column if not exists stars       int not null default 0,
  add column if not exists redemptions int not null default 0;

alter table public.sales
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.drafts
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists sales_customer_idx  on public.sales  (customer_id);
create index if not exists drafts_customer_idx on public.drafts (customer_id);

alter table public.tenant_config
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_min     int not null default 10;

-- Cada venta oficial con cliente suma 1 estrella (solo si la fidelización está activa)
create or replace function public.tg_award_loyalty_star()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null
     and exists (select 1 from public.tenant_config c
                 where c.tenant_id = new.tenant_id and c.loyalty_enabled) then
    update public.customers
       set stars = stars + 1, updated_at = now()
     where id = new.customer_id and tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;
drop trigger if exists award_loyalty_star on public.sales;
create trigger award_loyalty_star after insert on public.sales
  for each row execute function public.tg_award_loyalty_star();

-- Registrar un canje: +1 canje y estrellas a 0
create or replace function public.customer_redeem(p_customer uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c public.customers; v_cfg record;
begin
  select * into v_c from public.customers
   where id = p_customer and tenant_id = public.my_tenant_id();
  if v_c is null then raise exception 'Cliente no encontrado'; end if;

  select loyalty_enabled, loyalty_min into v_cfg
    from public.tenant_config where tenant_id = v_c.tenant_id;
  if not coalesce(v_cfg.loyalty_enabled, false) then
    raise exception 'El canje por estrellas no está activado';
  end if;
  if v_c.stars < coalesce(v_cfg.loyalty_min, 10) then
    raise exception 'Todavía no llega al mínimo de estrellas';
  end if;

  update public.customers
     set stars = 0, redemptions = redemptions + 1, updated_at = now()
   where id = p_customer;
  return jsonb_build_object('ok', true, 'redemptions', v_c.redemptions + 1);
end;
$$;
grant execute on function public.customer_redeem(uuid) to authenticated;

-- ============================================================
-- STORAGE — bucket público para fotos de barberos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read"  on storage.objects;
drop policy if exists "avatars_write" on storage.objects;

create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_write" on storage.objects
  for all to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_tenant_id()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_tenant_id()::text);
