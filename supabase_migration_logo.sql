-- ============================================================
-- MIGRACIÓN — Logo propio de cada barbería
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- La barbería sube su logo en Configuración: se ve en el encabezado de la
-- app, en la pestaña del navegador y en su página de reservas.
-- El archivo va al bucket público catalog-photos (<tenant>/branding/logo.png),
-- que ya existe y ya deja escribir a cada barbería en su carpeta.
-- ============================================================

alter table public.tenant_config
  add column if not exists logo_url text;

-- La página de reservas también muestra el logo
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

grant execute on function public.rsv_shop(text) to anon, authenticated;
