import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

function exigirSolicitacao(id?: string) {
  if (!id?.trim()) throw new Error("VALIDACAO::Solicitação não informada.");
  return id.trim();
}

export const obterDecisaoInteligente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { solicitacaoExternalId: string; execucaoId?: string | null }) => {
      exigirSolicitacao(input?.solicitacaoExternalId);
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import(
        "@/server/domain/processamento/decisao-inteligente.service"
      );
      return service.obterDecisaoInteligente(ctx, data);
    }),
  );

export const executarDecisaoInteligente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      solicitacaoExternalId: string;
      execucaoId?: string | null;
      acao: "RESPONDER_MANTER_ABERTA" | "RESPONDER_FINALIZAR";
      mensagem: string;
      justificativa?: string | null;
      privada?: boolean;
    }) => {
      exigirSolicitacao(input?.solicitacaoExternalId);
      if (!input?.acao) throw new Error("VALIDACAO::Informe a ação desejada.");
      if (!input?.mensagem?.trim())
        throw new Error("VALIDACAO::Revise a resposta antes de enviar.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import(
        "@/server/domain/processamento/decisao-inteligente.action"
      );
      return service.executarDecisaoInteligente(ctx, data);
    }),
  );
