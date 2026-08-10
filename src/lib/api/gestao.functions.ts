import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

type EscopoInput = {
  competencia: string;
  tipo: "CONTABIL" | "FISCAL" | "OUTRO";
  departamentoId?: string | null;
  responsavelId?: string | null;
  empresaIds?: string[];
};

function validarEscopo(input: EscopoInput) {
  if (!input?.competencia || !/^\d{4}-\d{2}$/.test(input.competencia))
    throw new Error("VALIDACAO::Informe a competência no formato AAAA-MM.");
  if (!input.tipo) throw new Error("VALIDACAO::Informe o tipo de fechamento.");
  return input;
}

export const listarEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { incluirInativos?: boolean }) => input ?? {})
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/escopo.service");
      return service.listarEquipe(ctx, data);
    }),
  );

export const sincronizarEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/escopo.service");
      return service.sincronizarEquipe(ctx);
    }),
  );

export const sincronizarSolicitacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarEscopo)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/escopo.service");
      return service.sincronizarSolicitacoes(ctx, {
        competencia: data.competencia,
        tipo: data.tipo,
      });
    }),
  );

export const montarPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarEscopo)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/gestao.service");
      return service.montarPreview(ctx, data);
    }),
  );

export const iniciarGestao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: EscopoInput & { idempotencyKey: string }) => {
    validarEscopo(input);
    if (!input.idempotencyKey) throw new Error("VALIDACAO::Chave de execução ausente.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/gestao.service");
      return service.iniciarGestao(ctx, data);
    }),
  );

export const listarExecucoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/gestao.service");
      return service.listarExecucoes(ctx);
    }),
  );

export const detalharExecucao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { execucaoId: string }) => {
    if (!input?.execucaoId) throw new Error("VALIDACAO::Execução não informada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/gestao.service");
      return service.detalharExecucao(ctx, data.execucaoId);
    }),
  );
