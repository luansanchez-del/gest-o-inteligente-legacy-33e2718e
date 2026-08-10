CREATE TABLE public.pier_department (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  user_count integer NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

GRANT SELECT ON public.pier_department TO authenticated;
GRANT ALL ON public.pier_department TO service_role;
ALTER TABLE public.pier_department ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem departamentos" ON public.pier_department
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE TRIGGER t_pier_department_u BEFORE UPDATE ON public.pier_department
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.pier_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  kind text,
  login text,
  email text,
  status text,
  department_external_id text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

GRANT SELECT ON public.pier_user TO authenticated;
GRANT ALL ON public.pier_user TO service_role;
ALTER TABLE public.pier_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem usuarios do PIER" ON public.pier_user
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE TRIGGER t_pier_user_u BEFORE UPDATE ON public.pier_user
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pier_user_dept ON public.pier_user (organization_id, department_external_id);

ALTER TABLE public.request
  ADD COLUMN IF NOT EXISTS reference_month text,
  ADD COLUMN IF NOT EXISTS type_external_id text,
  ADD COLUMN IF NOT EXISTS client_external_id text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_document text,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.company(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsible_external_id text,
  ADD COLUMN IF NOT EXISTS department_external_id text,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_request_org_external ON public.request (organization_id, external_id);
CREATE INDEX IF NOT EXISTS idx_request_escopo ON public.request (organization_id, reference_month, type_external_id);