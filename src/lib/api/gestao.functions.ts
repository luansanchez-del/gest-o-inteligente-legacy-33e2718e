import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

type EscopoInput = {
  competencia: string;
  competenciaFim?: string | null;
  tipo: "CONTABIL" | "FISCAL" | "OUTRO";
  departamentoId?: string | null;
  responsavelId?: string | null;
  statusFila?:
    | "AGUARDANDO_DOCUMENTO"
    | "PRONTO_PARA_ANALISE"
    | "ANALISANDO"
    | "ANALISE_CONCLUIDA"
    | "REVISAO_NECESSARIA"
    | "ERRO"
    | "HISTORICO"
    | null;
  revisaoCompetencia?: boolean;
  busca?: string | null;
};

const COMPETENCIA = /^\d{4}-\d{2}$/;

function validarEscopo(input: EscopoInput) {
  if (!input?.competencia || !COMPETENCIA.test(input.competencia))
    throw new Error("VALIDACAO::Informe a competência no formato AAAA-MM.");
  if (input.competenciaFim && !COMPETENCIA.test(input.competenciaFim))
    throw new Error("VALIDACAO::Informe a competência final no formato AAAA-MM.");
  if (!input.tipo) throw new Error("VALIDACAO::Informe o tipo de fechamento.");
  return input;
}

function validarIntervalo(input: { inicio: string; fim: string }) {
  if (!COMPETENCIA.test(input?.inicio ?? "") || !COMPETENCIA.test(input?.fim ?? ""))
    throw new Error("VALIDACAO::Informe as competências no formato AAAA-MM.");
  if (input.inicio > input.fim)
    throw new Error("VALIDACAO::A competência inicial deve ser anterior ou igual à final.");
  return input;
}

export const previsualizarCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarIntervalo)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/carga.service");
      return service.previsualizarCarga(ctx, data);
    }),
  );

export const abrirCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { inicio: string; fim: string; tipoCarga: "HISTORICA" | "MENSAL" }) => {
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
  .inputValidator((input: { competencia: string; runId?: string | null }) => {
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
  .inputValidator(
    (input: { runId: string; status: "COMPLETED" | "FAILED" | "CANCELLED"; mensagem?: string }) => {
      if (!input?.runId) throw new Error("VALIDACAO::Carga não identificada.");
      return input;
    },
  )
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
