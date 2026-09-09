# Reconstruir correções de leitura de PDF e idempotência da análise

Nada foi alterado no projeto. Abaixo está exatamente o que será feito quando você aprovar — e o diff completo é entregue junto com a implementação.

## Estado atual verificado

- `pdf.server.ts` agrupa linhas com arredondamento fixo de 0,5 pt (`Math.round(v * 2) / 2`) e escolhe o eixo da linha só pela contagem de grupos, sem comparar as duas orientações. `razaoIntegridade(paginasSimples)` é calculada duas vezes no caminho de fallback.
- `validacao.service.ts`: a busca de idempotência filtra por `organization_id + content_hash + validator_version` (sem `request_id`), e o upsert usa `onConflict: "organization_id,content_hash,validator_version"`.
- Índice atual na migração `20260814001501`: `uq_validation_execution_idempotency (organization_id, content_hash, validator_version)`.
- `obterResultadoValidacao(ctx, { execucaoId })` não recebe nem confere `request_id` — o mesmo PDF em duas solicitações pode devolver a análise da outra.
- `package.json` não tem script `test`; `vitest` já está em devDependencies e `vitest.config.ts` existe.

## Mudanças

### 1. `src/server/domain/validacao/pdf.server.ts`
- Tipo dos itens passa a preservar `fontSize`, `height`, `width` e `dir`.
- Agrupamento de linha por tolerância derivada do `fontSize` do item: `35%` do fontSize, limitado entre 0,75 e 4 pt; fallback 1,5 pt sem fontSize. Itens com baselines separados por 0,3 pt (ex.: `1.1.01`, `CAIXA GERAL`, `12.345,67`) passam a formar uma única linha.
- Quando a contagem de grupos apontar X como eixo de linha, montar as duas orientações e escolher a que coloca mais valores monetários dentro de linhas de conta reconhecidas por `parseBalancete`. Página normal (eixo Y) sai direto, sem custo extra; página rotacionada já suportada continua funcionando.
- `razaoIntegridade(paginasSimples)` calculada uma vez e reutilizada.

### 2. `src/server/domain/validacao/validacao.service.ts`
- Busca de execução anterior passa a filtrar também por `request_id`.
- `onConflict` do upsert vira `organization_id,request_id,content_hash,validator_version`.
- `obterResultadoValidacao` aceita `requestId?: string`; quando informado, a execução precisa pertencer àquela solicitação — caso contrário, erro de "Análise não encontrada", nunca a análise de outra solicitação.

### 3. `src/server/domain/processamento/processamento.service.ts`
- `deps.obterResultado(ctx, { execucaoId, requestId: solicitacao.id })`.

### 4. `src/server/domain/processamento/decisao-inteligente.service.ts`
- `obterResultadoValidacao(ctx, { execucaoId, requestId: solicitacao.id })`.

### 5. `package.json`
- `"test": "vitest run"` e `"test:watch": "vitest"`.

### 6. `supabase/migrations/20260909120000_idempotencia_validacao_por_solicitacao.sql`
- `DROP INDEX IF EXISTS` do índice antigo e criação de `uq_validation_execution_idempotency (organization_id, request_id, content_hash, validator_version)`, com `IF NOT EXISTS`, seguro para base existente.

### 7. `src/server/domain/validacao/__tests__/pdf-orientacao.test.ts`
Sete testes de regressão: tolerância por fontSize; fallback sem fontSize; limite mínimo (0,75 pt); limite máximo (4 pt); página normal no eixo Y; página de totais transposta; página rotacionada. Os testes existentes continuam passando.

## Fora do escopo

Fatiamento/retomada do lote não será implementado.

## Entrega

- Diff unificado completo dos 7 arquivos.
- Lista exata dos arquivos alterados/criados.
- `bunx vitest run` executado para confirmar que nada quebrou.
