-- ============================================================
-- MIGRACIÓN — Comisión y servicios habilitados por barbero
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Configuración de cada barbero para cada servicio.
-- Si NO hay fila para (barbero, servicio): el servicio le aparece y cobra su % general.
--   is_enabled = false  → ese servicio no le aparece al barbero
--   commission_pct null → usa el % general del barbero
create table if not exists public.barber_services (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  barber_id      uuid not null references public.barbers(id) on delete cascade,
  service_id     uuid not null references public.services(id) on delete cascade,
  is_enabled     boolean not null default true,
  commission_pct numeric(5,2) check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100)),
  created_at     timestamptz default now(),
  unique (barber_id, service_id)
);

create index if not exists barber_services_barber_idx on public.barber_services(barber_id);
create index if not exists barber_services_tenant_idx on public.barber_services(tenant_id);

alter table public.barber_services enable row level security;

drop policy if exists "barber_services_root"   on public.barber_services;
drop policy if exists "barber_services_tenant" on public.barber_services;

create policy "barber_services_root"   on public.barber_services for all
  using (public.my_role() = 'root');
create policy "barber_services_tenant" on public.barber_services for all
  using (tenant_id = public.my_tenant_id());

-- % efectivamente aplicado al momento de la venta (solo servicios).
-- Congela el reparto histórico: si mañana cambia la comisión, lo ya cobrado no se mueve.
alter table public.sale_items
  add column if not exists commission_pct numeric(5,2);

alter table public.draft_items
  add column if not exists commission_pct numeric(5,2);
