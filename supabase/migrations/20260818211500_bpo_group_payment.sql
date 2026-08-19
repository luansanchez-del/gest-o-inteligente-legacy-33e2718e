create table if not exists public.bpo_group_payment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  group_key text not null,
  group_name text not null,
  responsible_external_id text,
  responsible_name text not null,
  monthly_amount numeric(14,2) not null default 0 check (monthly_amount >= 0),
  source text not null default 'PLANILHA',
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, group_key, responsible_name)
);

create index if not exists idx_bpo_group_payment_org_active
  on public.bpo_group_payment (organization_id, active);
create index if not exists idx_bpo_group_payment_group
  on public.bpo_group_payment (organization_id, group_key);

alter table public.bpo_group_payment enable row level security;

drop policy if exists bpo_group_payment_select on public.bpo_group_payment;
create policy bpo_group_payment_select on public.bpo_group_payment
  for select using (is_member(auth.uid(), organization_id));

drop policy if exists bpo_group_payment_write on public.bpo_group_payment;
create policy bpo_group_payment_write on public.bpo_group_payment
  for all using (can_write(auth.uid(), organization_id))
  with check (can_write(auth.uid(), organization_id));

alter table public.portfolio_assignment
  add column if not exists monthly_fee_source text not null default 'PLANILHA';

-- Migra apenas casos inequívocos de repasse por grupo:
-- mais de uma empresa no mesmo grupo/BPO, exatamente um valor positivo e pelo menos uma empresa zerada.
with candidatos as (
  select
    organization_id,
    lower(regexp_replace(trim(group_name), '\s+', ' ', 'g')) as group_key,
    min(group_name) as group_name,
    official_responsible_external_id,
    official_responsible_name,
    sum(coalesce(bpo_budget, 0))::numeric(14,2) as monthly_amount
  from public.portfolio_assignment
  where active = true
    and group_name is not null
    and official_responsible_name is not null
  group by organization_id,
           lower(regexp_replace(trim(group_name), '\s+', ' ', 'g')),
           official_responsible_external_id,
           official_responsible_name
  having count(*) > 1
     and count(*) filter (where coalesce(bpo_budget, 0) > 0) = 1
     and count(*) filter (where coalesce(bpo_budget, 0) = 0) >= 1
)
insert into public.bpo_group_payment (
  organization_id,
  group_key,
  group_name,
  responsible_external_id,
  responsible_name,
  monthly_amount,
  source
)
select
  organization_id,
  group_key,
  group_name,
  official_responsible_external_id,
  official_responsible_name,
  monthly_amount,
  'MIGRADO_REPASSE_GRUPO'
from candidatos
on conflict (organization_id, group_key, responsible_name)
do update set
  monthly_amount = excluded.monthly_amount,
  group_name = excluded.group_name,
  responsible_external_id = excluded.responsible_external_id,
  active = true,
  updated_at = now();

with candidatos as (
  select
    organization_id,
    lower(regexp_replace(trim(group_name), '\s+', ' ', 'g')) as group_key,
    official_responsible_name
  from public.portfolio_assignment
  where active = true
    and group_name is not null
    and official_responsible_name is not null
  group by organization_id,
           lower(regexp_replace(trim(group_name), '\s+', ' ', 'g')),
           official_responsible_name
  having count(*) > 1
     and count(*) filter (where coalesce(bpo_budget, 0) > 0) = 1
     and count(*) filter (where coalesce(bpo_budget, 0) = 0) >= 1
)
update public.portfolio_assignment p
set bpo_budget = null,
    updated_at = now()
from candidatos c
where p.organization_id = c.organization_id
  and lower(regexp_replace(trim(p.group_name), '\s+', ' ', 'g')) = c.group_key
  and p.official_responsible_name = c.official_responsible_name;
