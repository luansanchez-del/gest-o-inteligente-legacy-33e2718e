create table if not exists public.request_response_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  status text not null check (status in ('RESPONDIDA','NAO_RESPONDIDA')),
  checked_at timestamptz not null default now(),
  post_external_id text,
  author_name text,
  posted_at timestamptz,
  source text not null default 'PIER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_id)
);

create index if not exists idx_request_response_state_org_status
  on public.request_response_state (organization_id, status, checked_at desc);

create index if not exists idx_request_response_state_request
  on public.request_response_state (organization_id, request_id);

alter table public.request_response_state enable row level security;

drop policy if exists request_response_state_select on public.request_response_state;
create policy request_response_state_select on public.request_response_state
  for select using (is_member(auth.uid(), organization_id));

drop policy if exists request_response_state_write on public.request_response_state;
create policy request_response_state_write on public.request_response_state
  for all using (can_write(auth.uid(), organization_id))
  with check (can_write(auth.uid(), organization_id));
