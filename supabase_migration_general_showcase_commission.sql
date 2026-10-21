-- ============================================================
-- MIGRACIÓN — % general de vitrina y bebidas por barbero
-- Ejecutar en el SQL Editor de Supabase ANTES de publicar la versión
-- que lo usa (idempotente).
--
-- Arranca en 0 = 100% para el local: hasta que el dueño ponga un %,
-- todo se calcula exactamente igual que antes.
--
-- Cómo se aplica a cada producto/bebida:
--   · Con fila en barber_products / barber_drinks → ese % puntual.
--   · Sin fila → el % general del barbero (también para ítems nuevos).
-- Lo ya vendido no cambia: cada sale_item guarda el % con que se cobró.
-- ============================================================
alter table public.barbers
  add column if not exists product_commission_pct numeric(5,2) not null default 0
    check (product_commission_pct >= 0 and product_commission_pct <= 100),
  add column if not exists drink_commission_pct   numeric(5,2) not null default 0
    check (drink_commission_pct >= 0 and drink_commission_pct <= 100);
