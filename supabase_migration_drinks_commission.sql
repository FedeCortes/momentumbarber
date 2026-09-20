-- ============================================================
-- MIGRACIÓN — Comisión por barbero en bebidas
-- Ejecutar en el SQL Editor de Supabase (idempotente)
-- ============================================================

-- ── Comisión de un barbero en una bebida puntual ─────────────
-- Sin fila = 0% (100% para el local, el comportamiento de siempre).
-- Con fila y commission_pct > 0 = ese % se lo lleva el barbero al venderla.
create table if not exists public.barber_drinks (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  barber_id      uuid not null references public.barbers(id) on delete cascade,
  drink_id       uuid not null references public.drinks(id) on delete cascade,
  commission_pct numeric(5,2) check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100)),
  created_at     timestamptz default now(),
  unique (barber_id, drink_id)
);
create index if not exists barber_drinks_barber_idx on public.barber_drinks (barber_id);
create index if not exists barber_drinks_tenant_idx on public.barber_drinks (tenant_id);

alter table public.barber_drinks enable row level security;
drop policy if exists "barber_drinks_root"   on public.barber_drinks;
drop policy if exists "barber_drinks_tenant" on public.barber_drinks;
create policy "barber_drinks_root"   on public.barber_drinks for all using (public.my_role() = 'root');
create policy "barber_drinks_tenant" on public.barber_drinks for all using (tenant_id = public.my_tenant_id());
