ALTER TABLE public.company
  ADD COLUMN IF NOT EXISTS document_digits text
  GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(document, ''), '[^0-9]', '', 'g'), '')) STORED;

CREATE INDEX IF NOT EXISTS company_org_document_digits_idx
  ON public.company (organization_id, document_digits);