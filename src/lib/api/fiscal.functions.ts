import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comContexto, emailDoToken } from "./contexto";

const COMPETENCIA = /^\d{4}-\d{2}$/;

function validarIntervalo(input: { competenciaInicio: string; competenciaFim: string }) {
  if (!COMPETENCIA.test(input?.competenciaInicio ?? "") || !COMPETENCIA.test(input?.competenciaFim ?? ""))
    throw new Error("VALIDACAO::Informe as competências no formato AAAA-MM.");
  if (input.competenciaInicio > input.competenciaFim)
    throw new Error("VALIDACAO::A competência inicial deve ser anterior ou igual à final.");
  return input;
}

export const listarEquipeFiscal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { incluirInativos?: boolean }) => input ?? {})
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal-gestao.service");
      return service.listarEquipeFiscal(ctx, data);
    }),
  );

export const sincronizarEquipeFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal-equipe-sync.service");
      return service.sincronizarEquipeFiscal(ctx);
    }),
  );

export const sincronizarSolicitacoesFiscais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { competenciaInicio: string; competenciaFim: string; incluirFinalizadas?: boolean }) => {
      validarIntervalo(input);
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal-gestao.service");
      return service.sincronizarSolicitacoesFiscais(ctx, data);
    }),
  );

export const listarGestaoFiscal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      competenciaInicio: string;
      competenciaFim: string;
      responsavelId?: string | null;
      busca?: string | null;
      anexo?: "COM_ANEXO" | "SEM_ANEXO" | null;
      statusPier?: "PENDENTES" | "FINALIZADAS" | "TODOS" | null;
      statusResposta?: "TODAS" | "SEM_RESPOSTA" | "RESPONDIDAS" | "NAO_VERIFICADAS" | null;
    }) => {
      validarIntervalo(input);
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal-gestao.service");
      return service.listarGestaoFiscal(ctx, data);
    }),
  );

export const validarSolicitacaoFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacaoExternalId: string }) => {
    if (!input?.solicitacaoExternalId?.trim())
      throw new Error("VALIDACAO::Solicitação não informada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal-gestao.service");
      return service.validarSolicitacaoFiscal(ctx, data);
    }),
  );

export const validarLoteFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacoes: string[] }) => {
    const solicitacoes = [...new Set((input?.solicitacoes ?? []).map((id) => id.trim()).filter(Boolean))];
    if (!solicitacoes.length)
      throw new Error("VALIDACAO::Selecione ao menos uma solicitação.");
    if (solicitacoes.length > 100)
      throw new Error("VALIDACAO::Valide no máximo 100 solicitações por lote.");
    return { solicitacoes };
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal-gestao.service");
      return service.validarLoteFiscal(ctx, data);
    }),
  );

export const executarDecisaoFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      solicitacaoExternalId: string;
      mensagem: string;
      finalizar: boolean;
      justificativa?: string | null;
    }) => {
      if (!input?.solicitacaoExternalId?.trim())
        throw new Error("VALIDACAO::Solicitação não informada.");
      if (!input?.mensagem?.trim())
        throw new Error("VALIDACAO::Revise a resposta antes de executar.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal-gestao.service");
      return service.executarDecisaoFiscal(ctx, data);
    }),
  );
