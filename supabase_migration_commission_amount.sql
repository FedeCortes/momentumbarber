-- ============================================================
-- MIGRACIÓN — Comisión del barbero en vitrina y bebidas ($ o %),
--             configurada en Configuración e igual para todos los barberos
-- Ejecutar en el SQL Editor de Supabase ANTES de publicar la versión
-- que lo usa (idempotente).
--
--   · General de la barbería (tenant_config): la usan todos los productos /
--     bebidas sin comisión propia, también los nuevos. Vacío = 100% local.
--   · Propia de cada producto / bebida: pisa la general. 0 = no deja comisión.
--   · En $ es por unidad vendida.
-- Lo ya vendido no cambia: cada ítem guarda lo aplicado.
-- La comisión por barbero en productos (barber_products / barber_drinks y
-- barbers.product/drink_commission_pct) deja de usarse.
-- ============================================================
alter table public.tenant_config
  add column if not exists product_commission_amt numeric(10,2) check (product_commission_amt is null or product_commission_amt >= 0),
  add column if not exists product_commission_pct numeric(5,2)  check (product_commission_pct is null or (product_commission_pct >= 0 and product_commission_pct <= 100)),
  add column if not exists drink_commission_amt   numeric(10,2) check (drink_commission_amt   is null or drink_commission_amt   >= 0),
  add column if not exists drink_commission_pct   numeric(5,2)  check (drink_commission_pct   is null or (drink_commission_pct   >= 0 and drink_commission_pct   <= 100));

alter table public.products
  add column if not exists barber_commission_amt numeric(10,2) check (barber_commission_amt is null or barber_commission_amt >= 0),
  add column if not exists barber_commission_pct numeric(5,2)  check (barber_commission_pct is null or (barber_commission_pct >= 0 and barber_commission_pct <= 100));
alter table public.drinks
  add column if not exists barber_commission_amt numeric(10,2) check (barber_commission_amt is null or barber_commission_amt >= 0),
  add column if not exists barber_commission_pct numeric(5,2)  check (barber_commission_pct is null or (barber_commission_pct >= 0 and barber_commission_pct <= 100));

-- Monto aplicado al momento de la venta, por unidad (congela el reparto histórico)
alter table public.sale_items  add column if not exists commission_amt numeric(10,2);
alter table public.draft_items add column if not exists commission_amt numeric(10,2);
