-- ============================================================
-- MIGRACIÓN — Precio especial de barbero + consumo de barberos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Precio especial para cuando el barbero compra el producto/bebida para sí mismo.
-- null → usa el precio normal.
alter table public.products
  add column if not exists barber_price numeric(10,2);

alter table public.drinks
  add column if not exists barber_price numeric(10,2);

-- ============================================================
-- BARBER_PURCHASES — consumo personal de un barbero (a precio especial)
-- No es una venta a un cliente: se registra aparte y se descuenta
-- de lo que se le paga al barbero en el cierre.
-- ============================================================
create table if not exists public.barber_purchases (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  barber_id      uuid not null references public.barbers(id) on delete cascade,
  item_type      text not null check (item_type in ('product', 'drink')),
  item_id        uuid,
  name           text not null,
  price          numeric(10,2) not null default 0,
  quantity       int not null default 1,
  subtotal       numeric(10,2) generated always as (price * quantity) stored,
  purchase_date  date not null default current_date,
  created_at     timestamptz default now()
);

create index if not exists barber_purchases_barber_idx on public.barber_purchases(barber_id);
create index if not exists barber_purchases_tenant_idx on public.barber_purchases(tenant_id);
create index if not exists barber_purchases_date_idx   on public.barber_purchases(purchase_date);

alter table public.barber_purchases enable row level security;

drop policy if exists "barber_purchases_root"   on public.barber_purchases;
drop policy if exists "barber_purchases_tenant" on public.barber_purchases;

create policy "barber_purchases_root"   on public.barber_purchases for all
  using (public.my_role() = 'root');
create policy "barber_purchases_tenant" on public.barber_purchases for all
  using (tenant_id = public.my_tenant_id());
