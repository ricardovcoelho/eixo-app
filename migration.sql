-- ============================================================
-- EIXO APP — Migração do banco com user_id e RLS por usuário
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar coluna user_id em todas as tabelas
alter table dreams     add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table objectives add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table krs        add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table tasks      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table routines   add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Remover policies antigas (allow all)
drop policy if exists "allow all" on dreams;
drop policy if exists "allow all" on objectives;
drop policy if exists "allow all" on krs;
drop policy if exists "allow all" on tasks;
drop policy if exists "allow all" on routines;

-- 3. Criar policies seguras — cada usuário vê APENAS seus dados
create policy "user_own_dreams"     on dreams     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_own_objectives" on objectives for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_own_krs"        on krs        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_own_tasks"      on tasks      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_own_routines"   on routines   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Índices para performance
create index if not exists idx_dreams_user     on dreams(user_id);
create index if not exists idx_objectives_user on objectives(user_id);
create index if not exists idx_krs_user        on krs(user_id);
create index if not exists idx_tasks_user      on tasks(user_id);
create index if not exists idx_routines_user   on routines(user_id);

-- 5. Habilitar RLS (caso não esteja)
alter table dreams     enable row level security;
alter table objectives enable row level security;
alter table krs        enable row level security;
alter table tasks      enable row level security;
alter table routines   enable row level security;

-- ============================================================
-- Para o banco PILOTO, execute o mesmo script no projeto piloto
-- ============================================================
