-- Enums
CREATE TYPE public.instruction_source AS ENUM ('TITLE','POST','USER');
CREATE TYPE public.attachment_status AS ENUM ('UPLOADED','PARSED','FAILED');
CREATE TYPE public.validation_status AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED');
CREATE TYPE public.validation_result AS ENUM ('APROVADO','COM_ALERTAS','REPROVADO','REVISAO_HUMANA');
CREATE TYPE public.finding_severity AS ENUM ('INFO','WARNING','ERROR','BLOCKER');
CREATE TYPE public.decision_kind AS ENUM ('APPROVED','RETURNED','NEEDS_REVIEW');
CREATE TYPE public.pier_action_status AS ENUM ('NOT_SENT','PENDING','SENT','FAILED');

-- request_instruction
CREATE TABLE public.request_instruction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.request(id) ON DELETE CASCADE,
  source public.instruction_source NOT NULL,
  source_external_id text,
  occurred_at timestamptz,
  text text NOT NULL,
  interpreted jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_instruction TO authenticated;
GRANT ALL ON public.request_instruction TO service_role;
ALTER TABLE public.request_instruction ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instruction_select" ON public.request_instruction FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY "instruction_write" ON public.request_instruction FOR ALL TO authenticated USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE INDEX idx_request_instruction_request ON public.request_instruction (organization_id, request_id, created_at DESC);

-- request_attachment
CREATE TABLE public.request_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.request(id) ON DELETE CASCADE,
  external_id text,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  storage_path text NOT NULL,
  sha256 text NOT NULL,
  status public.attachment_status NOT NULL DEFAULT 'UPLOADED',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_attachment TO authenticated;
GRANT ALL ON public.request_attachment TO service_role;
ALTER TABLE public.request_attachment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachment_select" ON public.request_attachment FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY "attachment_write" ON public.request_attachment FOR ALL TO authenticated USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE INDEX idx_request_attachment_request ON public.request_attachment (organization_id, request_id, created_at DESC);
CREATE TRIGGER t_request_attachment_u BEFORE UPDATE ON public.request_attachment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- validation_execution
CREATE TABLE public.validation_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.request(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES public.request_attachment(id) ON DELETE CASCADE,
  status public.validation_status NOT NULL DEFAULT 'PENDING',
  validator_version text NOT NULL,
  content_hash text NOT NULL,
  instruction_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result public.validation_result,
  summary text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_execution TO authenticated;
GRANT ALL ON public.validation_execution TO service_role;
ALTER TABLE public.validation_execution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "validation_execution_select" ON public.validation_execution FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY "validation_execution_write" ON public.validation_execution FOR ALL TO authenticated USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE UNIQUE INDEX uq_validation_execution_idempotency ON public.validation_execution (organization_id, content_hash, validator_version);
CREATE INDEX idx_validation_execution_request ON public.validation_execution (organization_id, request_id, created_at DESC);
CREATE TRIGGER t_validation_execution_u BEFORE UPDATE ON public.validation_execution FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- validation_finding
CREATE TABLE public.validation_finding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.validation_execution(id) ON DELETE CASCADE,
  code text NOT NULL,
  severity public.finding_severity NOT NULL,
  title text NOT NULL,
  detail text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  account_code text,
  account_name text,
  page integer,
  requires_human boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_finding TO authenticated;
GRANT ALL ON public.validation_finding TO service_role;
ALTER TABLE public.validation_finding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "validation_finding_select" ON public.validation_finding FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY "validation_finding_write" ON public.validation_finding FOR ALL TO authenticated USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE INDEX idx_validation_finding_execution ON public.validation_finding (organization_id, execution_id, severity);

-- request_decision
CREATE TABLE public.request_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.request(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES public.validation_execution(id) ON DELETE SET NULL,
  decision public.decision_kind NOT NULL,
  notes text,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  pier_action_status public.pier_action_status NOT NULL DEFAULT 'NOT_SENT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_decision TO authenticated;
GRANT ALL ON public.request_decision TO service_role;
ALTER TABLE public.request_decision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "request_decision_select" ON public.request_decision FOR SELECT TO authenticated USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY "request_decision_write" ON public.request_decision FOR ALL TO authenticated USING (public.can_write(auth.uid(), organization_id)) WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE INDEX idx_request_decision_request ON public.request_decision (organization_id, request_id, decided_at DESC);
CREATE TRIGGER t_request_decision_u BEFORE UPDATE ON public.request_decision FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();