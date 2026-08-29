-- ============================================================
-- MIGRACIÓN — Control de stock (inventario de productos y bebidas)
-- Ejecutar en el SQL Editor de Supabase
--
-- Es 100% opcional y arranca APAGADO: hasta que no se active el
-- switch en Configuración, la app funciona exactamente igual que antes.
-- ============================================================

-- Switch global por barbería. false = la app ignora todo el stock.
alter table public.tenant_config
  add column if not exists stock_enabled boolean not null default false;

-- Stock actual + punto de reposición (stock mínimo) por producto y bebida.
alter table public.products
  add column if not exists stock     integer not null default 0,
  add column if not exists min_stock integer not null default 0;

alter table public.drinks
  add column if not exists stock     integer not null default 0,
  add column if not exists min_stock integer not null default 0;

-- ============================================================
-- adjust_stock — suma / resta unidades de forma atómica.
--   p_item_type : 'product' | 'drink'
--   p_delta     : negativo = descuenta (venta) · positivo = repone
-- Nunca deja el stock por debajo de 0.
-- ============================================================
create or replace function public.adjust_stock(p_item_type text, p_item_id uuid, p_delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_item_type = 'product' then
    update public.products
       set stock = greatest(0, coalesce(stock, 0) + p_delta)
     where id = p_item_id
       and tenant_id = public.my_tenant_id();
  elsif p_item_type = 'drink' then
    update public.drinks
       set stock = greatest(0, coalesce(stock, 0) + p_delta)
     where id = p_item_id
       and tenant_id = public.my_tenant_id();
  end if;
end;
$$;

grant execute on function public.adjust_stock(text, uuid, integer) to anon, authenticated;
