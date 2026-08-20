create table if not exists public.fiscal_validation_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  status text not null check (
    status in ('DOCUMENTOS_OK_REVISAR','BLOQUEADA','REVISAO_HUMANA','ERRO')
  ),
  category text not null,
  tax_regime text,
  summary text,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  checked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_id)
);

create index if not exists idx_fiscal_validation_org_status
  on public.fiscal_validation_state (organization_id, status, checked_at desc);

create index if not exists idx_fiscal_validation_request
  on public.fiscal_validation_state (organization_id, request_id);

alter table public.fiscal_validation_state enable row level security;

drop policy if exists fiscal_validation_state_select on public.fiscal_validation_state;
create policy fiscal_validation_state_select on public.fiscal_validation_state
  for select using (is_member(auth.uid(), organization_id));

drop policy if exists fiscal_validation_state_write on public.fiscal_validation_state;
create policy fiscal_validation_state_write on public.fiscal_validation_state
  for all using (can_write(auth.uid(), organization_id))
  with check (can_write(auth.uid(), organization_id));
