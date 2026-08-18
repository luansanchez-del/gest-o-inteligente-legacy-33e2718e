import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comContexto, emailDoToken } from "./contexto";

export const sincronizarMinhaCaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        return service.sincronizarMinhaCaixa(ctx, {
          email: emailDoToken(context.claims),
        });
      },
    ),
  );

export const listarMinhaCaixa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: { busca?: string | null; categoria?: string | null }) => input ?? {},
  )
  .handler(async ({ data, context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        return service.listarMinhaCaixa(ctx, {
          email: emailDoToken(context.claims),
          busca: data.busca ?? null,
          categoria: data.categoria ?? null,
        });
      },
    ),
  );

export const analisarSolicitacaoInteligente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacaoExternalId: string }) => {
    if (!input?.solicitacaoExternalId)
      throw new Error("VALIDACAO::Solicitação não informada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        return service.analisarSolicitacao(ctx, {
          email: emailDoToken(context.claims),
          solicitacaoExternalId: data.solicitacaoExternalId,
        });
      },
    ),
  );

export const executarAcaoSolicitacaoInteligente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      solicitacaoExternalId: string;
      acao: "RESPONDER_MANTER_ABERTA" | "RESPONDER_FINALIZAR";
      mensagem: string;
      privada?: boolean;
    }) => {
      if (!input?.solicitacaoExternalId)
        throw new Error("VALIDACAO::Solicitação não informada.");
      if (
        !["RESPONDER_MANTER_ABERTA", "RESPONDER_FINALIZAR"].includes(
          input.acao,
        )
      )
        throw new Error("VALIDACAO::Ação inválida.");
      if (!input.mensagem?.trim())
        throw new Error("VALIDACAO::Informe a resposta antes de publicar.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        return service.executarAcao(ctx, {
          email: emailDoToken(context.claims),
          ...data,
        });
      },
    ),
  );
