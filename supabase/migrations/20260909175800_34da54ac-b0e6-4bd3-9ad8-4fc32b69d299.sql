DROP INDEX IF EXISTS public.uq_validation_execution_idempotency;

CREATE UNIQUE INDEX IF NOT EXISTS uq_validation_execution_idempotency
  ON public.validation_execution (organization_id, request_id, content_hash, validator_version);