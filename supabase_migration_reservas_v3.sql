-- ============================================================
-- MIGRACIÓN — Reservas v3 (ajustes finos)
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de reservas_v2.
-- ORDEN: reservas → logo → reservas_v2 → reservas_v3. No volver a correr
-- las anteriores después de esta (pisarían funciones con versiones viejas).
-- Idempotente. No toca turnos, ventas ni precios existentes.
--
--   1) «No vino» queda como venta «Solo local» (sin barbero).
--   2) Comprobantes: máx. 10 MB, solo imagen o PDF; tiene que existir y no
--      puede usarse en dos turnos; freno anti-spam de reservas pendientes.
--   3) El cliente solo puede cancelar desde la web un turno PENDIENTE.
--      Uno confirmado (ya pagado) se cancela hablando con la barbería.
-- ============================================================

-- 1) Venta sin barbero (la app ya las usa para «Solo local»)
alter table public.sales alter column barber_id drop not null;

-- 2) Límites del bucket de comprobantes
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id = 'booking-receipts';

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
  -- El comprobante tiene que existir de verdad y no estar usado en otro turno
  if not exists (select 1 from storage.objects o where o.bucket_id = 'booking-receipts' and o.name = p_receipt_path) then
    raise exception 'No se pudo leer el comprobante. Subilo de nuevo.';
  end if;
  if exists (select 1 from bookings b where b.receipt_path = p_receipt_path) then
    raise exception 'Ese comprobante ya se usó en otro turno.';
  end if;
  -- Freno anti-spam: demasiados turnos sin confirmar creados en la última hora
  if (select count(*) from bookings b where b.tenant_id = v_t and b.status = 'pending'
        and b.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Hay muchas reservas pendientes. Probá en un rato o escribile a la barbería.';
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

-- 3) Cancelar desde la web: solo pendientes
create or replace function public.rsv_cancel(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k record;
begin
  select b.* into k from bookings b join customers c on c.id = b.customer_id
   where b.id = p_id and c.booking_token = p_token;
  if not found then raise exception 'Turno no encontrado'; end if;
  if k.status = 'confirmed' then
    raise exception 'Tu turno ya está confirmado y pagado: para cancelarlo o cambiarlo escribile a la barbería.';
  end if;
  if k.status <> 'pending' then raise exception 'Ese turno ya no está activo'; end if;
  update bookings set status = 'cancelled', cancelled_by = 'customer', decided_at = now() where id = p_id;
end $$;

grant execute on function public.rsv_book(uuid, text, uuid, uuid, timestamptz, text) to anon, authenticated;
grant execute on function public.rsv_cancel(uuid, uuid)                            to anon, authenticated;
