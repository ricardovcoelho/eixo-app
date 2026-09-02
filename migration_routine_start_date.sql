-- ============================================================
-- EIXO APP — Adiciona data de início (opcional) às rotinas
-- Execute no SQL Editor do Supabase (banco de producao e piloto, se houver)
-- ============================================================

alter table routines add column if not exists start_date date;
