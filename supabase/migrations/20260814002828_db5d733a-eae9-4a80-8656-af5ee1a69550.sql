ALTER TABLE public.request_attachment
  ADD CONSTRAINT request_attachment_unico
  UNIQUE (organization_id, request_id, sha256);

ALTER TABLE public.validation_execution
  ADD CONSTRAINT validation_execution_unico
  UNIQUE (organization_id, content_hash, validator_version);

CREATE INDEX IF NOT EXISTS idx_validation_finding_execution
  ON public.validation_finding (execution_id, severity);

CREATE INDEX IF NOT EXISTS idx_request_instruction_request
  ON public.request_instruction (organization_id, request_id);