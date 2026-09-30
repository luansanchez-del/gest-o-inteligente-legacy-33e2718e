-- Pendências de acompanhamento geradas ao aprovar um fechamento com resposta
-- padrão (ex.: adiantamento em aberto com baixa esperada). No fechamento
-- seguinte do mesmo cliente elas são exibidas para o colaborador conferir e,
-- ao finalizar, ficam marcadas como conferidas por aquela solicitação.
CREATE TABLE IF NOT EXISTS public.closing_followup (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.request(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES public.validation_execution(id) ON DELETE SET NULL,
  client_document text,
  client_name text,
  reference_month text,
  finding_code text NOT NULL,
  category text NOT NULL,
  account_code text,
  account_name text,
  amount numeric,
  finding_title text NOT NULL,
  response_key text NOT NULL,
  response_text text NOT NULL,
  status text NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA', 'CONFERIDA')),
  checked_request_id uuid REFERENCES public.request(id) ON DELETE SET NULL,
  checked_at timestamptz,
  checked_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS closing_followup_cliente_idx
  ON public.closing_followup (organization_id, client_document, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closing_followup TO authenticated;
GRANT ALL ON public.closing_followup TO service_role;

ALTER TABLE public.closing_followup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closing_followup_select" ON public.closing_followup
  FOR SELECT TO authenticated USING (is_member(auth.uid(), organization_id));

CREATE POLICY "closing_followup_write" ON public.closing_followup
  FOR ALL TO authenticated USING (can_write(auth.uid(), organization_id))
  WITH CHECK (can_write(auth.uid(), organization_id));
