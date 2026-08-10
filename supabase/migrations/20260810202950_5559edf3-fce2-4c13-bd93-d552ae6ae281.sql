ALTER TABLE public.closing_period
  ADD COLUMN IF NOT EXISTS responsible_external_id text,
  ADD COLUMN IF NOT EXISTS department_external_id text;