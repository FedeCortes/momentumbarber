-- ============================================================
-- MOMENTUM BARBER — Schema SQL para Supabase
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Extensiones
create extension if not exists "uuid-ossp";

-- ============================================================
-- TENANTS (barberías)
-- ============================================================
create table public.tenants (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text unique not null,
  email       text unique not null,
  phone       text,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ============================================================
-- USERS (root / admin vinculado a tenant)
-- ============================================================
-- Usamos auth.users de Supabase + esta tabla de perfil
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('root', 'admin')),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  full_name   text,
  created_at  timestamptz default now()
);

-- ============================================================
-- BARBERS (barberos de cada tenant)
-- ============================================================
create table public.barbers (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null,
  photo_url       text,
  commission_pct  numeric(5,2) not null default 50.00,
  password_hash   text,        -- bcrypt hash, opcional
  is_active       boolean default true,
  created_at      timestamptz default now()
);

-- ============================================================
-- SERVICES (catálogo de servicios por tenant)
-- ============================================================
create table public.services (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  price       numeric(10,2) not null default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ============================================================
-- PRODUCTS (vitrina — 100% para el local)
-- ============================================================
create table public.products (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  price       numeric(10,2) not null default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ============================================================
-- DRINKS (bebidas — 100% para el local)
-- ============================================================
create table public.drinks (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  price       numeric(10,2) not null default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ============================================================
-- PAYMENT METHODS
-- ============================================================
create table public.payment_methods (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  is_active   boolean default true,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

-- ============================================================
-- SALES (ventas oficiales — registradas por admin)
-- ============================================================
create table public.sales (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  barber_id         uuid not null references public.barbers(id),
  payment_method_id uuid references public.payment_methods(id),
  tip               numeric(10,2) default 0,
  total_services    numeric(10,2) default 0,
  total_products    numeric(10,2) default 0,
  total_drinks      numeric(10,2) default 0,
  total             numeric(10,2) generated always as (total_services + total_products + total_drinks + tip) stored,
  barber_earnings   numeric(10,2) default 0,  -- calculado al guardar
  shop_earnings     numeric(10,2) default 0,  -- calculado al guardar
  notes             text,
  sale_date         date not null default current_date,
  created_at        timestamptz default now()
);

-- ============================================================
-- SALE ITEMS
-- ============================================================
create table public.sale_items (
  id          uuid primary key default uuid_generate_v4(),
  sale_id     uuid not null references public.sales(id) on delete cascade,
  item_type   text not null check (item_type in ('service', 'product', 'drink')),
  item_id     uuid not null,
  name        text not null,
  price       numeric(10,2) not null,
  quantity    int not null default 1,
  subtotal    numeric(10,2) generated always as (price * quantity) stored
);

-- ============================================================
-- DRAFTS (borradores — registrados por barbero, no impactan stats)
-- ============================================================
create table public.drafts (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  barber_id         uuid not null references public.barbers(id),
  payment_method_id uuid references public.payment_methods(id),
  tip               numeric(10,2) default 0,
  total_services    numeric(10,2) default 0,
  total_products    numeric(10,2) default 0,
  total_drinks      numeric(10,2) default 0,
  total             numeric(10,2) generated always as (total_services + total_products + total_drinks + tip) stored,
  status            text default 'pending' check (status in ('pending', 'approved', 'discarded')),
  notes             text,
  draft_date        date not null default current_date,
  created_at        timestamptz default now()
);

-- ============================================================
-- DRAFT ITEMS
-- ============================================================
create table public.draft_items (
  id          uuid primary key default uuid_generate_v4(),
  draft_id    uuid not null references public.drafts(id) on delete cascade,
  item_type   text not null check (item_type in ('service', 'product', 'drink')),
  item_id     uuid not null,
  name        text not null,
  price       numeric(10,2) not null,
  quantity    int not null default 1,
  subtotal    numeric(10,2) generated always as (price * quantity) stored
);

-- ============================================================
-- TENANT CONFIG (contraseña admin, etc.)
-- ============================================================
create table public.tenant_config (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  admin_password  text not null default 'admin123',
  updated_at      timestamptz default now()
);

-- ============================================================
-- RLS — Row Level Security
-- ============================================================

alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.barbers          enable row level security;
alter table public.services         enable row level security;
alter table public.products         enable row level security;
alter table public.drinks           enable row level security;
alter table public.payment_methods  enable row level security;
alter table public.sales            enable row level security;
alter table public.sale_items       enable row level security;
alter table public.drafts           enable row level security;
alter table public.draft_items      enable row level security;
alter table public.tenant_config    enable row level security;

-- Helper: obtener tenant_id del usuario autenticado
create or replace function public.my_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

-- Helper: obtener rol del usuario autenticado
create or replace function public.my_role()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

-- TENANTS: root ve todo, admin solo el suyo
create policy "tenants_root_all"    on public.tenants for all using (public.my_role() = 'root');
create policy "tenants_admin_own"   on public.tenants for select using (id = public.my_tenant_id());

-- PROFILES: root ve todos, admin/barber solo el suyo
create policy "profiles_root_all"   on public.profiles for all using (public.my_role() = 'root');
create policy "profiles_own"        on public.profiles for select using (id = auth.uid());

-- Tablas de tenant: root acceso total; admin solo su tenant
create policy "barbers_root"    on public.barbers for all using (public.my_role() = 'root');
create policy "barbers_tenant"  on public.barbers for all using (tenant_id = public.my_tenant_id());

create policy "services_root"   on public.services for all using (public.my_role() = 'root');
create policy "services_tenant" on public.services for all using (tenant_id = public.my_tenant_id());

create policy "products_root"   on public.products for all using (public.my_role() = 'root');
create policy "products_tenant" on public.products for all using (tenant_id = public.my_tenant_id());

create policy "drinks_root"     on public.drinks for all using (public.my_role() = 'root');
create policy "drinks_tenant"   on public.drinks for all using (tenant_id = public.my_tenant_id());

create policy "pm_root"         on public.payment_methods for all using (public.my_role() = 'root');
create policy "pm_tenant"       on public.payment_methods for all using (tenant_id = public.my_tenant_id());

create policy "sales_root"      on public.sales for all using (public.my_role() = 'root');
create policy "sales_tenant"    on public.sales for all using (tenant_id = public.my_tenant_id());

create policy "sale_items_root"   on public.sale_items for all using (public.my_role() = 'root');
create policy "sale_items_tenant" on public.sale_items for all
  using (exists (select 1 from public.sales s where s.id = sale_id and s.tenant_id = public.my_tenant_id()));

create policy "drafts_root"     on public.drafts for all using (public.my_role() = 'root');
create policy "drafts_tenant"   on public.drafts for all using (tenant_id = public.my_tenant_id());

create policy "draft_items_root"   on public.draft_items for all using (public.my_role() = 'root');
create policy "draft_items_tenant" on public.draft_items for all
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.tenant_id = public.my_tenant_id()));

create policy "config_root"     on public.tenant_config for all using (public.my_role() = 'root');
create policy "config_tenant"   on public.tenant_config for all using (tenant_id = public.my_tenant_id());

-- ============================================================
-- DATOS SEMILLA — servicios y métodos de pago por defecto
-- (se insertan al crear un tenant desde el código de la app)
-- ============================================================
