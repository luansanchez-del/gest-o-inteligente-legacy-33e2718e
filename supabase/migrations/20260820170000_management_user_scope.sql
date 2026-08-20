create table if not exists public.management_user_scope (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  area text not null check (area in ('CONTABIL','FISCAL')),
  role text not null default 'GESTOR' check (role in ('GESTOR','ANALISTA','LEITURA')),
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, area)
);

create index if not exists idx_management_user_scope_user
  on public.management_user_scope (organization_id, user_id, active);

alter table public.management_user_scope enable row level security;

drop policy if exists management_user_scope_select on public.management_user_scope;
create policy management_user_scope_select on public.management_user_scope
  for select using (is_member(auth.uid(), organization_id));

drop policy if exists management_user_scope_write on public.management_user_scope;
create policy management_user_scope_write on public.management_user_scope
  for all using (can_write(auth.uid(), organization_id))
  with check (can_write(auth.uid(), organization_id));

comment on table public.management_user_scope is
  'Escopo de acesso por usuário e módulo de gestão. Preparado para RBAC futuro; ainda não bloqueia rotas automaticamente.';
