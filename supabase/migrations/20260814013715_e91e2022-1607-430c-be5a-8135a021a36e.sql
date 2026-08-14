CREATE TABLE public.request_processing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.request(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES public.validation_execution(id) ON DELETE SET NULL,
  attachment_id uuid REFERENCES public.request_attachment(id) ON DELETE SET NULL,
  content_hash text,
  outcome text NOT NULL DEFAULT 'PENDENTE',
  reason text,
  pier_post_external_id text,
  posted_at timestamptz,
  finalized_at timestamptz,
  pier_status text,
  processed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, request_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_processing TO authenticated;
GRANT ALL ON public.request_processing TO service_role;

ALTER TABLE public.request_processing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "request_processing_select" ON public.request_processing
  FOR SELECT TO authenticated USING (is_member(auth.uid(), organization_id));

CREATE POLICY "request_processing_write" ON public.request_processing
  FOR ALL TO authenticated USING (can_write(auth.uid(), organization_id))
  WITH CHECK (can_write(auth.uid(), organization_id));