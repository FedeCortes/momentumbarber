-- ============================================================
-- MIGRACIÓN — Clientes (nombre + celular opcional) y cliente en la venta
-- Ejecutar en el SQL Editor de Supabase ANTES de publicar la versión
-- que lo usa (idempotente: se puede correr más de una vez).
--
-- No cambia nada de lo existente: una venta sin cliente se guarda y se
-- calcula exactamente igual que antes.
-- ============================================================

-- ── Tabla de clientes ────────────────────────────────────────
create table if not exists public.customers (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text,
  phone      text,
  phone_key  text,            -- celular normalizado (solo dígitos, sin 54 ni 0) para no duplicar
  notes      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Por si la tabla ya existía con otra forma: asegurar columnas y que el
-- celular sea opcional (varios clientes sin celular no chocan entre sí).
alter table public.customers
  add column if not exists name       text,
  add column if not exists phone      text,
  add column if not exists phone_key  text,
  add column if not exists notes      text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
alter table public.customers alter column phone_key drop not null;

-- Un mismo celular no se repite dentro de la barbería (sin celular = sin restricción)
create unique index if not exists customers_tenant_phone_key_uq
  on public.customers (tenant_id, phone_key) where phone_key is not null;
create index if not exists customers_tenant_name_idx on public.customers (tenant_id, name);

alter table public.customers enable row level security;
drop policy if exists "customers_root"   on public.customers;
drop policy if exists "customers_tenant" on public.customers;
create policy "customers_root"   on public.customers for all using (public.my_role() = 'root');
create policy "customers_tenant" on public.customers for all using (tenant_id = public.my_tenant_id());

-- ── Cliente en la venta oficial (opcional) ───────────────────
-- Si se borra un cliente, sus ventas quedan intactas (solo pierden el vínculo).
alter table public.sales
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists sales_customer_idx on public.sales (tenant_id, customer_id, sale_date);
