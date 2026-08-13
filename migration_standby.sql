-- ============================================================
-- EIXO APP — Adiciona status "standby" (pausado) aos projetos
-- Execute no SQL Editor do Supabase (banco de produção e piloto, se houver)
-- ============================================================

alter table dreams add column if not exists standby boolean not null default false;
