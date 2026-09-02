import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

function validarCompetencia(competencia: unknown) {
  if (typeof competencia !== "string" || !/^\d{4}-\d{2}$/.test(competencia))
    throw new Error("VALIDACAO::Informe uma competência válida (AAAA-MM).");
  return competencia;
}

export const prepararDeclaracaoSemMovimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      linhas: Array<{ cliente: string; documento?: string | null }>;
      competencia: string;
    }) => {
      if (!Array.isArray(input?.linhas) || !input.linhas.length)
        throw new Error(
          "VALIDACAO::A planilha não trouxe nenhuma linha marcada como sem movimento.",
        );
      return { linhas: input.linhas, competencia: validarCompetencia(input.competencia) };
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/declaracao-sem-movimento.service");
      return service.prepararDeclaracaoSemMovimento(ctx, data);
    }),
  );

export const executarDeclaracaoSemMovimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacoes: string[]; competencia: string }) => {
    const solicitacoes = [
      ...new Set((input?.solicitacoes ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    if (!solicitacoes.length) throw new Error("VALIDACAO::Selecione ao menos uma solicitação.");
    if (solicitacoes.length > 100)
      throw new Error("VALIDACAO::Selecione no máximo 100 solicitações por lote.");
    return { solicitacoes, competencia: validarCompetencia(input.competencia) };
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/declaracao-sem-movimento.service");
      return service.executarDeclaracaoSemMovimento(ctx, data);
    }),
  );
