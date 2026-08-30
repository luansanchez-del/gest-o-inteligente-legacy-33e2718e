import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

type EscopoInput = {
  competencia: string;
  competenciaFim?: string | null;
  /**
   * Opcional: chave conhecida (CONTABIL, MOVIMENTO_FINANCEIRO, ...) ou o ID
   * de um tipo real do PIER. Sem tipo, o escopo é decidido pelo
   * departamento e mostra qualquer tipo de solicitação carregado.
   */
  tipo?: string | null;
  departamentoId?: string | null;
  responsavelId?: string | null;
  statusFila?:
    | "AGUARDANDO_DOCUMENTO"
    | "PRONTO_PARA_ANALISE"
    | "ANALISANDO"
    | "ANALISE_CONCLUIDA"
    | "REVISAO_NECESSARIA"
    | "BLOQUEADA"
    | "ERRO"
    | "HISTORICO"
    | null;
  statusPier?: "PENDENTES" | "FINALIZADAS" | "TODOS" | null;
  statusResposta?:
    | "TODAS"
    | "SEM_RESPOSTA"
    | "RESPONDIDAS"
    | "NAO_VERIFICADAS"
    | null;
  revisaoCompetencia?: boolean;
  busca?: string | null;
  anexo?: "COM_ANEXO" | "SEM_ANEXO" | null;
  regime?: string | null;
  incluirFinalizadas?: boolean;
};

const COMPETENCIA = /^\d{4}-\d{2}$/;

function validarEscopo(input: EscopoInput) {
  if (!input?.competencia || !COMPETENCIA.test(input.competencia))
    throw new Error("VALIDACAO::Informe a competência no formato AAAA-MM.");
  if (input.competenciaFim && !COMPETENCIA.test(input.competenciaFim))
    throw new Error("VALIDACAO::Informe a competência final no formato AAAA-MM.");
  if (input.statusPier && !["PENDENTES", "FINALIZADAS", "TODOS"].includes(input.statusPier))
    throw new Error("VALIDACAO::Status PIER inválido.");
  if (
    input.statusResposta &&
    !["TODAS", "SEM_RESPOSTA", "RESPONDIDAS", "NAO_VERIFICADAS"].includes(input.statusResposta)
  )
    throw new Error("VALIDACAO::Status de resposta inválido.");
  return input;
}

function validarIntervalo<T extends { inicio: string; fim: string }>(input: T): T {
  if (!COMPETENCIA.test(input?.inicio ?? "") || !COMPETENCIA.test(input?.fim ?? ""))
    throw new Error("VALIDACAO::Informe as competências no formato AAAA-MM.");
  if (input.inicio > input.fim)
    throw new Error("VALIDACAO::A competência inicial deve ser anterior ou igual à final.");
  return input;
}

export const previsualizarCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      inicio: string;
      fim: string;
      incluirFinalizadas?: boolean;
      departamentoIds?: string[] | null;
    }) => validarIntervalo(input),
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/carga.service");
      return service.previsualizarCarga(ctx, data);
    }),
  );

export const abrirCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { inicio: string; fim: string; tipoCarga: "HISTORICA" | "MENSAL"; incluirFinalizadas?: boolean; departamentoIds?: string[] | null }) => {
    validarIntervalo(input);
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/carga.service");
      return service.abrirCarga(ctx, data);
    }),
  );

export const carregarCompetencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { competencia: string; runId?: string | null; incluirFinalizadas?: boolean; departamentoIds?: string[] | null }) => {
    if (!COMPETENCIA.test(input?.competencia ?? ""))
      throw new Error("VALIDACAO::Informe a competência no formato AAAA-MM.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/carga.service");
      return service.carregarCompetencia(ctx, data);
    }),
  );

export const encerrarCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string; status: "COMPLETED" | "FAILED" | "CANCELLED"; mensagem?: string }) => {
    if (!input?.runId) throw new Error("VALIDACAO::Carga não identificada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/carga.service");
      return service.encerrarCarga(ctx, data);
    }),
  );

export const estadoCarga = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/carga.service");
      return service.estadoCarga(ctx);
    }),
  );

export const listarEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { incluirInativos?: boolean; somenteContabeis?: boolean }) => input ?? {})
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

export const listarTiposSolicitacaoPier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/escopo.service");
      return service.listarTiposSolicitacao(ctx);
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
        // Este mecanismo é específico para um tipo (diferente da Carga
        // histórica, que já é orientada por departamento): sem tipo
        // escolhido na tela, cai no Fechamento Contábil.
        tipo: data.tipo || "CONTABIL",
        incluirFinalizadas:
          data.incluirFinalizadas ??
          (data.statusPier === "FINALIZADAS" || data.statusPier === "TODOS"),
      });
    }),
  );

export const sincronizarRespostasPier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacoes: string[] }) => {
    const solicitacoes = [...new Set((input?.solicitacoes ?? []).map((id) => id.trim()).filter(Boolean))];
    if (!solicitacoes.length) throw new Error("VALIDACAO::Nenhuma solicitação foi informada.");
    if (solicitacoes.length > 100) throw new Error("VALIDACAO::Verifique no máximo 100 solicitações por vez.");
    return { solicitacoes };
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/resposta-pier.service");
      return service.sincronizarRespostasPier(ctx, data);
    }),
  );

export const montarPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarEscopo)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/gestao-preview-resposta.service");
      return service.montarPreviewComRespostas(ctx, data);
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

export const renomearDepartamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { departamentoId: string; nome: string }) => {
    if (!input?.departamentoId) throw new Error("VALIDACAO::Departamento não informado.");
    if (!input?.nome?.trim()) throw new Error("VALIDACAO::Informe o nome do departamento.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/escopo.service");
      return service.renomearDepartamento(ctx, data);
    }),
  );

export const obterDepartamentosContabeis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/escopo.service");
      return service.obterDepartamentosContabeis(ctx);
    }),
  );

export const configurarDepartamentosContabeis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { departamentoIds: string[] }) => {
    if (!Array.isArray(input?.departamentoIds) || !input.departamentoIds.length)
      throw new Error("VALIDACAO::Selecione ao menos um departamento.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/escopo.service");
      return service.configurarDepartamentosContabeis(ctx, data);
    }),
  );
