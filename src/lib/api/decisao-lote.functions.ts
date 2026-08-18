import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

function validarSolicitacoes(input: { solicitacoes: string[] }) {
  const solicitacoes = [...new Set((input?.solicitacoes ?? []).map((id) => id.trim()).filter(Boolean))];
  if (!solicitacoes.length)
    throw new Error("VALIDACAO::Selecione ao menos uma solicitação.");
  if (solicitacoes.length > 100)
    throw new Error("VALIDACAO::Selecione no máximo 100 solicitações por lote.");
  return { solicitacoes };
}

export const prepararDecisaoLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarSolicitacoes)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import(
        "@/server/domain/processamento/decisao-lote.service"
      );
      return service.prepararDecisaoLote(ctx, data);
    }),
  );

export const executarDecisaoLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      itens: Array<{
        solicitacaoExternalId: string;
        execucaoId?: string | null;
        acao: "RESPONDER_MANTER_ABERTA" | "RESPONDER_FINALIZAR";
        mensagem: string;
        justificativa?: string | null;
      }>;
    }) => {
      if (!input?.itens?.length)
        throw new Error("VALIDACAO::Nenhuma ação foi selecionada para execução.");
      if (input.itens.length > 100)
        throw new Error("VALIDACAO::Execute no máximo 100 solicitações por lote.");
      for (const item of input.itens) {
        if (!item.solicitacaoExternalId?.trim())
          throw new Error("VALIDACAO::Há uma solicitação sem identificador.");
        if (!item.acao)
          throw new Error("VALIDACAO::Há uma solicitação sem ação definida.");
        if (!item.mensagem?.trim())
          throw new Error("VALIDACAO::Todas as ações precisam de uma resposta revisada.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import(
        "@/server/domain/processamento/decisao-lote.service"
      );
      return service.executarDecisaoLote(ctx, data);
    }),
  );
