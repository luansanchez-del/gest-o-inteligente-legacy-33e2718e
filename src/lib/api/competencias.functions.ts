import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

export const listarCompetencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      competencia?: string;
      situacao?: string;
      responsavel?: string;
      empresaId?: string;
      tipo?: "CONTABIL" | "FISCAL" | "OUTRO";
    }) => input ?? {},
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/competencia/competencia.service");
      return service.listarCompetencias(ctx, data as never);
    }),
  );

export const obterDossie = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { competenciaId: string }) => {
    if (!input?.competenciaId) throw new Error("VALIDACAO::Competência não informada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/competencia/competencia.service");
      return service.obterDossie(ctx, data.competenciaId);
    }),
  );

export const definirSituacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { competenciaId: string; situacao: string; observacao?: string }) => {
    if (!input?.competenciaId || !input?.situacao)
      throw new Error("VALIDACAO::Informe a competência e a situação.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/competencia/competencia.service");
      return service.definirSituacaoManual(ctx, data as never);
    }),
  );
