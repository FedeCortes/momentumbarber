-- ============================================================
-- MIGRACIÓN — Índices de performance
-- Ejecutar en el SQL Editor de Supabase.
--
-- Las tablas que crecen todos los días (ventas, borradores, gastos) no
-- tenían índices sobre las columnas por las que se filtra siempre
-- (tenant_id, fecha, sale_id / draft_id). Con pocos datos no se nota,
-- pero con meses de historial las consultas del cierre y las estadísticas
-- se ponen lentas.
--
-- Es 100% seguro: los índices solo aceleran lecturas, no cambian datos ni
-- código. Conviene correrlo cuanto antes (con las tablas chicas es instantáneo).
-- ============================================================

-- Ventas oficiales
create index if not exists sales_tenant_date_idx on public.sales (tenant_id, sale_date);
create index if not exists sales_barber_idx      on public.sales (barber_id);
create index if not exists sale_items_sale_idx   on public.sale_items (sale_id);

-- Borradores de los barberos
create index if not exists drafts_tenant_date_idx on public.drafts (tenant_id, draft_date);
create index if not exists drafts_barber_date_idx on public.drafts (barber_id, draft_date);
create index if not exists draft_items_draft_idx  on public.draft_items (draft_id);

-- Gastos
create index if not exists expenses_tenant_date_idx on public.expenses (tenant_id, expense_date);
create index if not exists expenses_payer_idx       on public.expenses (payer_id);

-- Catálogo / config (se consultan en cada carga de venta)
create index if not exists services_tenant_idx        on public.services (tenant_id);
create index if not exists products_tenant_idx        on public.products (tenant_id);
create index if not exists drinks_tenant_idx          on public.drinks (tenant_id);
create index if not exists payment_methods_tenant_idx on public.payment_methods (tenant_id);
create index if not exists barbers_tenant_idx         on public.barbers (tenant_id);
create index if not exists barber_services_barber_idx on public.barber_services (barber_id);
