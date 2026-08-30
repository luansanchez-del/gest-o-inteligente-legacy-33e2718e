import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

type Severidade = "INFO" | "WARNING" | "ERROR" | "BLOCKER";

function exigirSolicitacao(id?: string) {
  if (!id?.trim()) throw new Error("VALIDACAO::Solicitação não informada.");
  return id.trim();
}

export const detalharSolicitacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacaoExternalId: string; sincronizarPostagens?: boolean }) => {
    exigirSolicitacao(input?.solicitacaoExternalId);
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/validacao/validacao.service");
      return service.detalharSolicitacao(ctx, data);
    }),
  );

export const enviarAnexo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      solicitacaoExternalId: string;
      filename: string;
      mimeType: string;
      conteudoBase64: string;
    }) => {
      exigirSolicitacao(input?.solicitacaoExternalId);
      if (!input?.conteudoBase64) throw new Error("VALIDACAO::Selecione um arquivo PDF.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/validacao/validacao.service");
      return service.enviarAnexo(ctx, data);
    }),
  );

export const executarValidacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { solicitacaoExternalId: string; anexoId: string; reprocessar?: boolean }) => {
      exigirSolicitacao(input?.solicitacaoExternalId);
      if (!input?.anexoId) throw new Error("VALIDACAO::Documento não informado.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/validacao/validacao.service");
      return service.executarValidacao(ctx, data);
    }),
  );

export const obterResultadoValidacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { execucaoId: string }) => {
    if (!input?.execucaoId) throw new Error("VALIDACAO::Análise não informada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/validacao/validacao.service");
      return service.obterResultadoValidacao(ctx, data);
    }),
  );

export const listarAchados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { execucaoId: string; severidade?: Severidade | null; busca?: string | null }) => {
      if (!input?.execucaoId) throw new Error("VALIDACAO::Análise não informada.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/validacao/validacao.service");
      return service.listarAchados(ctx, data);
    }),
  );

export const registrarDecisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      solicitacaoExternalId: string;
      execucaoId?: string | null;
      decisao: "APPROVED" | "RETURNED" | "NEEDS_REVIEW";
      notas?: string | null;
    }) => {
      exigirSolicitacao(input?.solicitacaoExternalId);
      if (!input?.decisao) throw new Error("VALIDACAO::Informe a decisão.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/validacao/validacao.service");
      return service.registrarDecisao(ctx, data);
    }),
  );

export const excluirDecisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacaoExternalId: string; decisaoId: string }) => {
    exigirSolicitacao(input?.solicitacaoExternalId);
    if (!input?.decisaoId) throw new Error("VALIDACAO::Decisão não informada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/validacao/validacao.service");
      return service.excluirDecisao(ctx, data);
    }),
  );
