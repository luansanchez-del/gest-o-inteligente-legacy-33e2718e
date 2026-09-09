-- A mesma organização pode receber o mesmo PDF em solicitações diferentes.
-- A idempotência precisa ser por solicitação para impedir reaproveitamento
-- de uma execução pertencente a outra empresa/fechamento.

DROP INDEX IF EXISTS public.uq_validation_execution_idempotency;

CREATE UNIQUE INDEX IF NOT EXISTS uq_validation_execution_idempotency
  ON public.validation_execution (
    organization_id,
    request_id,
    content_hash,
    validator_version
  );
