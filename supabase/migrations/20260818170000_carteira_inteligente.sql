-- Carteira Inteligente: camada gerencial separada do catálogo PIER.
-- Não altera o responsável no PIER; guarda a distribuição oficial aprovada pelo gestor.

CREATE TABLE public.portfolio_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  client_key text NOT NULL,
  client_external_id text,
  client_document text,
  client_name text NOT NULL,
  official_responsible_external_id text,
  official_responsible_name text,
  tax_regime text,
  segment text,
  monthly_fee numeric(14,2),
  bpo_budget numeric(14,2),
  complexity_points numeric(8,2) NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'PLANILHA',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_assignment_complexity_positive CHECK (complexity_points > 0),
  CONSTRAINT portfolio_assignment_values_nonnegative CHECK (
    (monthly_fee IS NULL OR monthly_fee >= 0) AND
    (bpo_budget IS NULL OR bpo_budget >= 0)
  )
);

CREATE UNIQUE INDEX uq_portfolio_assignment_client
  ON public.portfolio_assignment (organization_id, client_key);
CREATE INDEX idx_portfolio_assignment_responsible
  ON public.portfolio_assignment (organization_id, official_responsible_external_id);
CREATE INDEX idx_portfolio_assignment_document
  ON public.portfolio_assignment (organization_id, client_document);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_assignment TO authenticated;
GRANT ALL ON public.portfolio_assignment TO service_role;
ALTER TABLE public.portfolio_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_assignment_select" ON public.portfolio_assignment
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY "portfolio_assignment_write" ON public.portfolio_assignment
  FOR ALL TO authenticated
  USING (public.can_write(auth.uid(), organization_id))
  WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE TRIGGER t_portfolio_assignment_u
  BEFORE UPDATE ON public.portfolio_assignment
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bpo_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  profile_key text NOT NULL,
  pier_user_external_id text,
  name text NOT NULL,
  email text,
  seniority text,
  max_capacity_points numeric(10,2) NOT NULL DEFAULT 60,
  target_monthly_value numeric(14,2),
  tax_regimes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sectors jsonb NOT NULL DEFAULT '[]'::jsonb,
  systems jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  curriculum_text text,
  curriculum_summary text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bpo_profile_capacity_positive CHECK (max_capacity_points > 0),
  CONSTRAINT bpo_profile_target_nonnegative CHECK (
    target_monthly_value IS NULL OR target_monthly_value >= 0
  )
);

CREATE UNIQUE INDEX uq_bpo_profile_key
  ON public.bpo_profile (organization_id, profile_key);
CREATE INDEX idx_bpo_profile_pier_user
  ON public.bpo_profile (organization_id, pier_user_external_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bpo_profile TO authenticated;
GRANT ALL ON public.bpo_profile TO service_role;
ALTER TABLE public.bpo_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bpo_profile_select" ON public.bpo_profile
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), organization_id));
CREATE POLICY "bpo_profile_write" ON public.bpo_profile
  FOR ALL TO authenticated
  USING (public.can_write(auth.uid(), organization_id))
  WITH CHECK (public.can_write(auth.uid(), organization_id));
CREATE TRIGGER t_bpo_profile_u
  BEFORE UPDATE ON public.bpo_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
