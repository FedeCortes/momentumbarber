-- ============================================================
-- MIGRACIÓN — Fotos de bebidas
-- Ejecutar en el SQL Editor de Supabase (idempotente)
-- Usa el mismo bucket "catalog-photos" que los productos
-- (carpeta <tenant>/drinks/), que ya existe y tiene sus políticas.
-- ============================================================
alter table public.drinks
  add column if not exists image_url text;
