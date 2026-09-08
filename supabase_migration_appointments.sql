-- ============================================================
-- MIGRACIÓN — Reservas online / Agenda de turnos
-- Ejecutar en el SQL Editor de Supabase (es idempotente: se puede correr de nuevo)
-- ============================================================

-- ── Columnas nuevas en tablas existentes ────────────────────
alter table public.services
  add column if not exists duration_min int not null default 30,
  add column if not exists bookable     boolean not null default true,
  add column if not exists sort_order   int default 0,
  add column if not exists description  text;

alter table public.barbers
  add column if not exists bookable boolean not null default true;

alter table public.tenant_config
  add column if not exists booking_enabled      boolean not null default false,
  add column if not exists booking_slot_min     int not null default 15,
  add column if not exists booking_lead_hours   int not null default 2,
  add column if not exists booking_horizon_days int not null default 21,
  add column if not exists booking_notice       text,
  add column if not exists booking_whatsapp     text;  -- WhatsApp que ve el cliente al confirmar (si vacío, usa tenants.phone)

-- ── Horarios de atención (grilla semanal por barbero) ───────
-- Varias filas por (barbero, weekday) => turno partido.
-- Sin filas para un weekday => ese día el barbero no atiende.
create table if not exists public.barber_hours (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  barber_id  uuid not null references public.barbers(id) on delete cascade,
  weekday    int  not null check (weekday between 0 and 6),  -- 0 = domingo
  start_time time not null,
  end_time   time not null,
  created_at timestamptz default now(),
  check (end_time > start_time)
);
create index if not exists barber_hours_barber_idx on public.barber_hours (barber_id, weekday);
create index if not exists barber_hours_tenant_idx on public.barber_hours (tenant_id);

-- ── Bloqueos puntuales (franco, vacaciones, ausencia de un día) ──
create table if not exists public.barber_time_off (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  barber_id  uuid not null references public.barbers(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz default now(),
  check (ends_at > starts_at)
);
create index if not exists barber_time_off_barber_idx on public.barber_time_off (barber_id, starts_at);
create index if not exists barber_time_off_tenant_idx on public.barber_time_off (tenant_id);

-- ── Turnos ─────────────────────────────────────────────────
create table if not exists public.appointments (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  barber_id      uuid not null references public.barbers(id) on delete cascade,
  service_id     uuid references public.services(id) on delete set null,
  service_name   text not null,
  service_price  numeric(10,2) not null default 0,
  duration_min   int not null default 30,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'confirmed'
                   check (status in ('pending','confirmed','cancelled','completed','no_show')),
  customer_name  text not null,
  customer_phone text not null,
  customer_email text,
  notes          text,
  admin_notes    text,
  source         text not null default 'online' check (source in ('online','admin')),
  cancel_token   uuid not null default uuid_generate_v4(),
  sale_id        uuid references public.sales(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists appointments_tenant_start_idx on public.appointments (tenant_id, starts_at);
create index if not exists appointments_barber_start_idx on public.appointments (barber_id, starts_at);
create index if not exists appointments_tenant_status_idx on public.appointments (tenant_id, status);

-- ============================================================
-- RLS — solo root y el propio tenant. El público NO toca estas
-- tablas: entra por las funciones security definer de más abajo.
-- ============================================================
alter table public.barber_hours    enable row level security;
alter table public.barber_time_off enable row level security;
alter table public.appointments    enable row level security;

drop policy if exists "barber_hours_root"      on public.barber_hours;
drop policy if exists "barber_hours_tenant"    on public.barber_hours;
drop policy if exists "barber_time_off_root"   on public.barber_time_off;
drop policy if exists "barber_time_off_tenant" on public.barber_time_off;
drop policy if exists "appointments_root"      on public.appointments;
drop policy if exists "appointments_tenant"    on public.appointments;

create policy "barber_hours_root"      on public.barber_hours    for all using (public.my_role() = 'root');
create policy "barber_hours_tenant"    on public.barber_hours    for all using (tenant_id = public.my_tenant_id());
create policy "barber_time_off_root"   on public.barber_time_off for all using (public.my_role() = 'root');
create policy "barber_time_off_tenant" on public.barber_time_off for all using (tenant_id = public.my_tenant_id());
create policy "appointments_root"      on public.appointments    for all using (public.my_role() = 'root');
create policy "appointments_tenant"    on public.appointments    for all using (tenant_id = public.my_tenant_id());

-- ============================================================
-- FUNCIONES PÚBLICAS (security definer) — las llama el cliente
-- anónimo desde la página /reservar/<slug>
-- ============================================================
-- Zona horaria fija: Argentina (UTC-3, sin horario de verano)

-- Datos públicos del local + servicios y barberos reservables
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
        select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'photo_url', b.photo_url)
               order by b.name)
        from public.barbers b
        where b.tenant_id = t.id and b.is_active and coalesce(b.bookable, true)
      ), '[]'::jsonb)
    )
  end
  from public.tenants t
  left join public.tenant_config c on c.tenant_id = t.id
  where t.slug = lower(p_slug) and t.is_active;
$$;

-- Bloques de trabajo de un barbero para un día de la semana, con las franjas
-- contiguas o superpuestas ya fusionadas (así 09:00-13:00 + 13:00-18:00 cargadas
-- por separado cuentan como jornada corrida y no dejan un hueco en el medio).
create or replace function public.barber_blocks(p_barber uuid, p_weekday int)
returns table (start_time time, end_time time)
language sql stable set search_path = public as $$
  select min(h.start_time), max(h.end_time)
  from (
    select start_time, end_time,
           sum(is_new) over (order by start_time, end_time) as island
    from (
      select start_time, end_time,
             case when start_time <= max(end_time) over (
                    order by start_time, end_time
                    rows between unbounded preceding and 1 preceding)
                  then 0 else 1 end as is_new
      from public.barber_hours
      where barber_id = p_barber and weekday = p_weekday and end_time > start_time
    ) a
  ) h
  group by h.island;
$$;

-- ¿El barbero atiende en toda la ventana [p_start, p_end)?
create or replace function public.barber_open_between(
  p_barber uuid, p_start timestamptz, p_end timestamptz
) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from public.barber_blocks(
      p_barber,
      extract(dow from (p_start at time zone 'America/Argentina/Buenos_Aires'))::int
    ) blk
    where (p_start at time zone 'America/Argentina/Buenos_Aires')::time >= blk.start_time
      and (p_end   at time zone 'America/Argentina/Buenos_Aires')::time <= blk.end_time
  );
$$;

-- Horarios disponibles para un servicio (y opcionalmente un barbero)
create or replace function public.booking_slots(
  p_slug text, p_service_id uuid, p_barber_id uuid, p_days int default 21
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz       text := 'America/Argentina/Buenos_Aires';
  v_tenant   uuid;
  v_cfg      record;
  v_duration int;
  v_slot     int;
  v_lead     int;
  v_horizon  int;
  v_now      timestamptz := now();
  v_today    date := (v_now at time zone v_tz)::date;
  v_result   jsonb := '[]'::jsonb;
  v_off      int;
  v_date     date;
  v_dow      int;
  v_slot_map jsonb;
  v_day_slots jsonb;
  r_barber   record;
  r_block    record;
  v_cursor   timestamp;
  v_block_end timestamp;
  v_start    timestamptz;
  v_end      timestamptz;
  v_key      text;
begin
  select id into v_tenant from public.tenants where slug = lower(p_slug) and is_active;
  if v_tenant is null then raise exception 'Barbería no encontrada'; end if;

  select * into v_cfg from public.tenant_config where tenant_id = v_tenant;
  if v_cfg is null or not coalesce(v_cfg.booking_enabled, false) then
    raise exception 'Las reservas online no están habilitadas';
  end if;

  select coalesce(duration_min, 30) into v_duration from public.services
   where id = p_service_id and tenant_id = v_tenant and is_active and coalesce(bookable, true);
  if v_duration is null then raise exception 'Servicio no disponible'; end if;

  v_slot    := greatest(5, coalesce(v_cfg.booking_slot_min, 15));
  v_lead    := greatest(0, coalesce(v_cfg.booking_lead_hours, 2));
  v_horizon := least(coalesce(p_days, 21), coalesce(v_cfg.booking_horizon_days, 21));

  for v_off in 0..v_horizon loop
    v_date := v_today + v_off;
    v_dow  := extract(dow from v_date)::int;
    v_slot_map := '{}'::jsonb;

    for r_barber in
      select b.id from public.barbers b
      where b.tenant_id = v_tenant and b.is_active and coalesce(b.bookable, true)
        and (p_barber_id is null or b.id = p_barber_id)
        and not exists (
          select 1 from public.barber_services bs
          where bs.barber_id = b.id and bs.service_id = p_service_id and bs.is_enabled = false
        )
    loop
      for r_block in
        select start_time, end_time from public.barber_blocks(r_barber.id, v_dow)
      loop
        v_cursor    := v_date + r_block.start_time;
        v_block_end := v_date + r_block.end_time;
        while v_cursor + make_interval(mins => v_duration) <= v_block_end loop
          v_start := v_cursor at time zone v_tz;
          v_end   := v_start + make_interval(mins => v_duration);
          if v_start >= v_now + make_interval(hours => v_lead)
             and not exists (
               select 1 from public.barber_time_off t
               where t.barber_id = r_barber.id and t.starts_at < v_end and t.ends_at > v_start
             )
             and not exists (
               select 1 from public.appointments a
               where a.barber_id = r_barber.id and a.status in ('pending','confirmed')
                 and a.starts_at < v_end and a.ends_at > v_start
             )
          then
            v_key := to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z';
            v_slot_map := jsonb_set(
              v_slot_map, array[v_key],
              coalesce(v_slot_map -> v_key, '[]'::jsonb) || to_jsonb(r_barber.id),
              true
            );
          end if;
          v_cursor := v_cursor + make_interval(mins => v_slot);
        end loop;
      end loop;
    end loop;

    if v_slot_map <> '{}'::jsonb then
      select jsonb_agg(jsonb_build_object('start', key, 'barber_ids', value) order by key)
        into v_day_slots
        from jsonb_each(v_slot_map);
      v_result := v_result || jsonb_build_object(
        'date', to_char(v_date, 'YYYY-MM-DD'), 'slots', v_day_slots
      );
    end if;
  end loop;

  return v_result;
end;
$$;

-- Crear un turno (re-valida el horario, asigna barbero si vino "cualquiera")
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
    and public.barber_open_between(b.id, p_starts_at, v_end)
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

  insert into public.appointments (
    tenant_id, barber_id, service_id, service_name, service_price, duration_min,
    starts_at, ends_at, status, customer_name, customer_phone, customer_email, notes, source
  ) values (
    v_tenant, v_barber, p_service_id, v_name, v_price, v_duration,
    p_starts_at, v_end, 'confirmed', trim(p_name), trim(p_phone),
    nullif(trim(p_email), ''), nullif(trim(p_notes), ''), 'online'
  ) returning * into v_appt;

  return jsonb_build_object(
    'id', v_appt.id, 'cancel_token', v_appt.cancel_token, 'barber_name', v_barber_name,
    'starts_at', v_appt.starts_at, 'ends_at', v_appt.ends_at,
    'service_name', v_appt.service_name, 'service_price', v_appt.service_price
  );
end;
$$;

-- Ver un turno propio (para la página de autogestión del cliente)
create or replace function public.booking_appointment(p_id uuid, p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'status', a.status, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'service_name', a.service_name, 'service_price', a.service_price, 'duration_min', a.duration_min,
    'customer_name', a.customer_name, 'customer_phone', a.customer_phone,
    'barber_id', a.barber_id, 'barber_name', b.name, 'service_id', a.service_id,
    'tenant_name', t.name, 'tenant_slug', t.slug, 'tenant_phone', t.phone,
    'cancel_token', a.cancel_token
  )
  from public.appointments a
  join public.barbers b on b.id = a.barber_id
  join public.tenants t on t.id = a.tenant_id
  where a.id = p_id and a.cancel_token = p_token;
$$;

-- Cancelar un turno propio
create or replace function public.booking_cancel(p_id uuid, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_appt public.appointments;
begin
  select * into v_appt from public.appointments where id = p_id and cancel_token = p_token;
  if v_appt is null then raise exception 'Turno no encontrado'; end if;
  if v_appt.status in ('completed', 'cancelled') then
    raise exception 'Este turno no se puede cancelar';
  end if;
  update public.appointments set status = 'cancelled', updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Reprogramar un turno propio (mismo barbero y servicio)
create or replace function public.booking_reschedule(p_id uuid, p_token uuid, p_new_starts_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tz text := 'America/Argentina/Buenos_Aires';
  v_appt public.appointments;
  v_cfg  record;
  v_end  timestamptz;
  v_local timestamp;
begin
  select * into v_appt from public.appointments where id = p_id and cancel_token = p_token;
  if v_appt is null then raise exception 'Turno no encontrado'; end if;
  if v_appt.status in ('completed', 'cancelled', 'no_show') then
    raise exception 'Este turno no se puede reprogramar';
  end if;

  select * into v_cfg from public.tenant_config where tenant_id = v_appt.tenant_id;
  v_end   := p_new_starts_at + make_interval(mins => v_appt.duration_min);
  v_local := p_new_starts_at at time zone v_tz;

  if p_new_starts_at < now() + make_interval(hours => greatest(0, coalesce(v_cfg.booking_lead_hours, 2))) then
    raise exception 'Ese horario ya no está disponible';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_appt.tenant_id::text || p_new_starts_at::text));

  if not public.barber_open_between(v_appt.barber_id, p_new_starts_at, v_end) then
    raise exception 'Ese horario ya no está disponible';
  end if;

  if exists (
      select 1 from public.barber_time_off t
      where t.barber_id = v_appt.barber_id and t.starts_at < v_end and t.ends_at > p_new_starts_at
    ) or exists (
      select 1 from public.appointments a
      where a.barber_id = v_appt.barber_id and a.id <> p_id and a.status in ('pending','confirmed')
        and a.starts_at < v_end and a.ends_at > p_new_starts_at
    )
  then
    raise exception 'Ese horario ya no está disponible';
  end if;

  update public.appointments
     set starts_at = p_new_starts_at, ends_at = v_end, updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'starts_at', p_new_starts_at, 'ends_at', v_end);
end;
$$;

grant execute on function public.booking_shop(text)                           to anon, authenticated;
grant execute on function public.booking_slots(text, uuid, uuid, int)         to anon, authenticated;
grant execute on function public.booking_create(text, uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public.booking_appointment(uuid, uuid)              to anon, authenticated;
grant execute on function public.booking_cancel(uuid, uuid)                   to anon, authenticated;
grant execute on function public.booking_reschedule(uuid, uuid, timestamptz)  to anon, authenticated;
