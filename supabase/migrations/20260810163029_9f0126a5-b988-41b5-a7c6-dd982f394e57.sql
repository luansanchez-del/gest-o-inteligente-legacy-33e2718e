-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','gestor','colaborador','leitura');
CREATE TYPE public.closing_type AS ENUM ('CONTABIL','FISCAL','OUTRO');
CREATE TYPE public.closing_situation AS ENUM (
  'CONCLUIDA_NO_PRAZO','CONCLUIDA_FORA_PRAZO','EM_ANDAMENTO_NO_PRAZO','ATRASADA',
  'AGUARDANDO_CLIENTE','SEM_EVIDENCIA','PRECISA_REVISAO','NAO_ANALISADA');
CREATE TYPE public.severity AS ENUM ('INFO','WARNING','CRITICAL');
CREATE TYPE public.pendency_status AS ENUM ('OPEN','RESOLVED','IGNORED');
CREATE TYPE public.review_status AS ENUM ('PENDING','APPROVED','RETURNED','IGNORED');
CREATE TYPE public.run_status AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE public.item_status AS ENUM ('PENDING','PROCESSING','COMPLETED','WARNING','ERROR','SKIPPED');

-- ============ FUNÇÕES BASE ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ ORGANIZAÇÃO E ACESSO ============
CREATE TABLE public.organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX membership_user_idx ON public.membership(user_id);

CREATE TABLE public.user_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, role)
);
CREATE INDEX user_role_user_idx ON public.user_role(user_id);

CREATE OR REPLACE FUNCTION public.is_member(_user_id uuid, _organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.membership m
    WHERE m.user_id = _user_id AND m.organization_id = _organization_id);
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _organization_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_role r
    WHERE r.user_id = _user_id AND r.organization_id = _organization_id AND r.role = _role);
$$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid, _organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_role r
    WHERE r.user_id = _user_id AND r.organization_id = _organization_id
      AND r.role IN ('admin','gestor','colaborador'));
$$;

-- ============ CARTEIRA ============
CREATE TABLE public.pier_client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  document text,
  status text,
  tax_regime text,
  responsible_name text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);
CREATE INDEX pier_client_doc_idx ON public.pier_client(organization_id, document);

CREATE TABLE public.company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  name text NOT NULL,
  document text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_org_idx ON public.company(organization_id);

CREATE TABLE public.company_pier_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  pier_client_id uuid NOT NULL REFERENCES public.pier_client(id) ON DELETE CASCADE,
  linked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pier_client_id),
  UNIQUE (organization_id, company_id)
);

-- ============ FECHAMENTOS ============
CREATE TABLE public.closing_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  reference_month text NOT NULL,
  type public.closing_type NOT NULL DEFAULT 'CONTABIL',
  situation public.closing_situation NOT NULL DEFAULT 'NAO_ANALISADA',
  responsible_name text,
  responsible_external_id text,
  deadline_at timestamptz,
  delivered_at timestamptz,
  last_analysis_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference_month, type)
);
CREATE INDEX closing_period_org_month_idx ON public.closing_period(organization_id, reference_month);

CREATE TABLE public.request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  closing_period_id uuid REFERENCES public.closing_period(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  number text,
  description text,
  type_name text,
  purpose text NOT NULL DEFAULT 'UNMAPPED',
  status text,
  responsible_name text,
  requested_at timestamptz,
  finished_at timestamptz,
  deadline_at timestamptz,
  has_attachment boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);
CREATE INDEX request_period_idx ON public.request(closing_period_id);

CREATE TABLE public.post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.request(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  author_name text,
  content text,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);
CREATE INDEX post_request_idx ON public.post(request_id);

CREATE TABLE public.file_ref (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.post(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.request(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  filename text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

-- ============ ANÁLISE E REVISÃO ============
CREATE TABLE public.analysis_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  closing_period_id uuid NOT NULL REFERENCES public.closing_period(id) ON DELETE CASCADE,
  situation public.closing_situation NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  rule_code text,
  rule_description text,
  requires_human_review boolean NOT NULL DEFAULT true,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_period_idx ON public.analysis_result(closing_period_id, computed_at DESC);

CREATE TABLE public.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  analysis_result_id uuid NOT NULL REFERENCES public.analysis_result(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_ref text,
  excerpt text,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pendency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  closing_period_id uuid NOT NULL REFERENCES public.closing_period(id) ON DELETE CASCADE,
  category text NOT NULL,
  rule_code text,
  severity public.severity NOT NULL DEFAULT 'INFO',
  found_value text,
  expected_value text,
  difference text,
  guidance text,
  status public.pendency_status NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.review_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  closing_period_id uuid NOT NULL REFERENCES public.closing_period(id) ON DELETE CASCADE,
  status public.review_status NOT NULL DEFAULT 'PENDING',
  reason text,
  assigned_to uuid,
  decided_by uuid,
  decided_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_task_status_idx ON public.review_task(organization_id, status);

-- ============ EXECUÇÃO EM LOTE ============
CREATE TABLE public.batch_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  reference_month text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.run_status NOT NULL DEFAULT 'PENDING',
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  warning_items integer NOT NULL DEFAULT 0,
  error_items integer NOT NULL DEFAULT 0,
  skipped_items integer NOT NULL DEFAULT 0,
  idempotency_key text,
  started_by uuid,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE public.batch_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  batch_execution_id uuid NOT NULL REFERENCES public.batch_execution(id) ON DELETE CASCADE,
  closing_period_id uuid REFERENCES public.closing_period(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.company(id) ON DELETE SET NULL,
  status public.item_status NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_execution_id, closing_period_id)
);

-- ============ ÍNDICE DE ENTREGA ============
CREATE TABLE public.delivery_metric (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  reference_month text NOT NULL,
  scope_type text NOT NULL,
  scope_key text NOT NULL DEFAULT 'ALL',
  metric_code text NOT NULL,
  numerator integer NOT NULL DEFAULT 0,
  denominator integer NOT NULL DEFAULT 0,
  rule_description text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reference_month, scope_type, scope_key, metric_code)
);

-- ============ OPERAÇÃO ============
CREATE TABLE public.sync_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  kind text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.run_status NOT NULL DEFAULT 'PENDING',
  total_items integer NOT NULL DEFAULT 0,
  processed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  message text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_run_org_idx ON public.sync_run(organization_id, started_at DESC);

CREATE TABLE public.sync_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  sync_run_id uuid NOT NULL REFERENCES public.sync_run(id) ON DELETE CASCADE,
  level public.severity NOT NULL DEFAULT 'INFO',
  external_id text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_kind text NOT NULL DEFAULT 'user',
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_org_idx ON public.audit_log(organization_id, created_at DESC);

CREATE TABLE public.app_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE TABLE public.integration_credential_ref (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  integration text NOT NULL,
  secret_name text NOT NULL,
  configured boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration)
);

-- ============ TRIGGERS updated_at ============
CREATE TRIGGER t_organization_u BEFORE UPDATE ON public.organization FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_membership_u BEFORE UPDATE ON public.membership FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_pier_client_u BEFORE UPDATE ON public.pier_client FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_company_u BEFORE UPDATE ON public.company FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_company_pier_link_u BEFORE UPDATE ON public.company_pier_link FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_closing_period_u BEFORE UPDATE ON public.closing_period FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_request_u BEFORE UPDATE ON public.request FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_pendency_u BEFORE UPDATE ON public.pendency FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_review_task_u BEFORE UPDATE ON public.review_task FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_batch_execution_u BEFORE UPDATE ON public.batch_execution FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_batch_item_u BEFORE UPDATE ON public.batch_item FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_sync_run_u BEFORE UPDATE ON public.sync_run FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_app_setting_u BEFORE UPDATE ON public.app_setting FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_integration_credential_ref_u BEFORE UPDATE ON public.integration_credential_ref FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ GRANTS ============
GRANT SELECT ON public.organization, public.membership, public.user_role, public.pier_client,
  public.company, public.company_pier_link, public.closing_period, public.request, public.post,
  public.file_ref, public.analysis_result, public.evidence, public.pendency, public.review_task,
  public.batch_execution, public.batch_item, public.delivery_metric, public.sync_run,
  public.sync_event, public.audit_log, public.app_setting, public.integration_credential_ref
  TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.company, public.company_pier_link, public.closing_period,
  public.pendency, public.review_task, public.app_setting TO authenticated;

GRANT ALL ON public.organization, public.membership, public.user_role, public.pier_client,
  public.company, public.company_pier_link, public.closing_period, public.request, public.post,
  public.file_ref, public.analysis_result, public.evidence, public.pendency, public.review_task,
  public.batch_execution, public.batch_item, public.delivery_metric, public.sync_run,
  public.sync_event, public.audit_log, public.app_setting, public.integration_credential_ref
  TO service_role;

-- ============ RLS ============
ALTER TABLE public.organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pier_client ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_pier_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_ref ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credential_ref ENABLE ROW LEVEL SECURITY;

-- Leitura por membros
CREATE POLICY org_read ON public.organization FOR SELECT TO authenticated USING (public.is_member(auth.uid(), id));
CREATE POLICY membership_read ON public.membership FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY user_role_read ON public.user_role FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY pier_client_read ON public.pier_client FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY company_read ON public.company FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY link_read ON public.company_pier_link FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY closing_read ON public.closing_period FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY request_read ON public.request FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY post_read ON public.post FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY file_read ON public.file_ref FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY analysis_read ON public.analysis_result FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY evidence_read ON public.evidence FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY pendency_read ON public.pendency FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY review_read ON public.review_task FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY batch_read ON public.batch_execution FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY batch_item_read ON public.batch_item FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY metric_read ON public.delivery_metric FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY sync_run_read ON public.sync_run FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY sync_event_read ON public.sync_event FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY audit_read ON public.audit_log FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY setting_read ON public.app_setting FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY credential_ref_read ON public.integration_credential_ref FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));

-- Escrita de gestão (admin, gestor, colaborador)
CREATE POLICY company_write ON public.company FOR ALL TO authenticated
  USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE POLICY link_write ON public.company_pier_link FOR ALL TO authenticated
  USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE POLICY closing_write ON public.closing_period FOR ALL TO authenticated
  USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE POLICY pendency_write ON public.pendency FOR ALL TO authenticated
  USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE POLICY review_write ON public.review_task FOR ALL TO authenticated
  USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));

-- Configurações apenas para administradores
CREATE POLICY setting_write ON public.app_setting FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), organization_id, 'admin'))
  WITH CHECK (public.has_role(auth.uid(), organization_id, 'admin'));