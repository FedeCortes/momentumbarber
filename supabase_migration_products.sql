-- ============================================================
-- MIGRACIÓN — Fotos de productos + comisión por barbero en productos
-- Ejecutar en el SQL Editor de Supabase (idempotente)
-- ============================================================

-- ── Foto de cada producto ────────────────────────────────────
alter table public.products
  add column if not exists image_url text;

-- ── Comisión de un barbero en un producto puntual ────────────
-- Sin fila = 0% (100% para el local, el comportamiento de siempre).
-- Con fila y commission_pct > 0 = ese % se lo lleva el barbero al venderlo.
create table if not exists public.barber_products (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  barber_id      uuid not null references public.barbers(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete cascade,
  commission_pct numeric(5,2) check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100)),
  created_at     timestamptz default now(),
  unique (barber_id, product_id)
);
create index if not exists barber_products_barber_idx on public.barber_products (barber_id);
create index if not exists barber_products_tenant_idx on public.barber_products (tenant_id);

alter table public.barber_products enable row level security;
drop policy if exists "barber_products_root"   on public.barber_products;
drop policy if exists "barber_products_tenant" on public.barber_products;
create policy "barber_products_root"   on public.barber_products for all using (public.my_role() = 'root');
create policy "barber_products_tenant" on public.barber_products for all using (tenant_id = public.my_tenant_id());

-- ============================================================
-- STORAGE — bucket público para fotos del catálogo (productos, y a
-- futuro bebidas si se quiere). Mismo esquema que "avatars".
-- ============================================================
insert into storage.buckets (id, name, public)
values ('catalog-photos', 'catalog-photos', true)
on conflict (id) do nothing;

drop policy if exists "catalog_photos_read"  on storage.objects;
drop policy if exists "catalog_photos_write" on storage.objects;

create policy "catalog_photos_read" on storage.objects
  for select using (bucket_id = 'catalog-photos');

create policy "catalog_photos_write" on storage.objects
  for all to authenticated
  using      (bucket_id = 'catalog-photos' and (storage.foldername(name))[1] = public.my_tenant_id()::text)
  with check (bucket_id = 'catalog-photos' and (storage.foldername(name))[1] = public.my_tenant_id()::text);
