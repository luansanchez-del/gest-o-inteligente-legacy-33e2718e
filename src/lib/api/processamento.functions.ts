import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

export const processarSolicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      solicitacaoExternalId: string;
      permitirFinalizar?: boolean;
      reprocessar?: boolean;
    }) => {
      if (!input?.solicitacaoExternalId?.trim())
        throw new Error("VALIDACAO::Solicitação não informada.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/processamento/processamento.service");
      return service.processarSolicitacao(ctx, data);
    }),
  );

export const processarEscopo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacoes: string[]; permitirFinalizar?: boolean }) => {
    if (!Array.isArray(input?.solicitacoes) || !input.solicitacoes.length)
      throw new Error("VALIDACAO::Nenhuma solicitação no escopo filtrado.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/processamento/processamento.service");
      return service.processarEscopo(ctx, data);
    }),
  );


export const notificarRevisaoPier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacaoExternalId: string }) => {
    if (!input?.solicitacaoExternalId?.trim())
      throw new Error("VALIDACAO::Solicitação não informada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/processamento/processamento.service");
      return service.notificarRevisaoPier(ctx, data);
    }),
  );
