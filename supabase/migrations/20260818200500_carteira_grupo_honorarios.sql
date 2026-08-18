alter table public.portfolio_assignment
  add column if not exists group_name text,
  add column if not exists fee_in_group boolean not null default false;

comment on column public.portfolio_assignment.group_name is 'Grupo econômico/operacional informado na planilha de clientes e honorários.';
comment on column public.portfolio_assignment.fee_in_group is 'Indica cliente sem honorário individual porque o valor está contemplado no grupo informado.';
