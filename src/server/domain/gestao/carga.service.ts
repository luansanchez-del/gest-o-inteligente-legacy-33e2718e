import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { departamentosContabeis, resolverTipoSolicitacao, responsavelHumano } from "./escopo.service";
import { carregarUsuariosPier } from "./pier-user.repo";
import { selecionarParaCarga } from "./status-pier";

const FORMATO = /^\d{4}-\d{2}$/;
const MAX_MESES = 36;
const LOTE = 250;

export interface ResumoCompetencia {
  competencia: string;
  encontradas: number;
  novas: number;
  existentes: number;
  comAnexo: number;
  semAnexo: number;
  /** Solicitações sem competência interpretável — vão para "Revisão de competência". */
  semCompetencia: number;
  /** Fora dos departamentos CONTABILIDADE LEGACY/BPO. */
  ignoradasNaoContabeis: number;
  /** Finalizadas novas ignoradas na carga operacional para reduzir volume. */
  finalizadasIgnoradas: number;
  erro: string | null;
}

export interface PreviewCarga {
  inicio: string;
  fim: string;
  totalMeses: number;
  meses: ResumoCompetencia[];
  totalEncontradas: number;
  totalNovas: number;
  totalExistentes: number;
  totalComAnexo: number;
  totalSemAnexo: number;
  totalSemCompetencia: number;
  totalFinalizadasIgnoradas: number;
  totalErros: number;
}

/** Valida o intervalo e devolve as competências AAAA-MM, em ordem. */
export function listarMeses(inicio: string, fim: string): string[] {
  if (!FORMATO.test(inicio) || !FORMATO.test(fim))
    throw new AppError("VALIDACAO", "Informe as competências no formato AAAA-MM.");
  if (inicio > fim)
    throw new AppError("VALIDACAO", "A competência inicial deve ser anterior ou igual à final.");

  const meses: string[] = [];
  let [ano, mes] = inicio.split("-").map(Number) as [number, number];
  const [anoFim, mesFim] = fim.split("-").map(Number) as [number, number];

  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    if (meses.length > MAX_MESES)
      throw new AppError(
        "VALIDACAO",
        `A carga aceita no máximo ${MAX_MESES} competências por vez.`,
      );
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

/** Mês seguinte a uma competência AAAA-MM. */
export function proximaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  return mes === 12
    ? `${ano + 1}-01`
    : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

async function contexto(ctx: AppContext, departamentoIds?: string[] | null) {
  const typeExternalId = await resolverTipoSolicitacao(ctx, "CONTABIL");
  // Departamentos escolhidos na tela têm prioridade; sem escolha, mantém o
  // recorte padrão da contabilidade (CONTABILIDADE LEGACY/BPO).
  const selecionados = (departamentoIds ?? []).map(String).filter(Boolean);
  const departamentos = new Set(
    selecionados.length ? selecionados : await departamentosContabeis(ctx),
  );
  const usuarios = await carregarUsuariosPier<{
    external_id: string;
    department_external_id: string | null;
  }>(ctx, "external_id, department_external_id");
  const deptoPorUsuario = new Map(
    usuarios.map((u) => [u.external_id, u.department_external_id]),
  );
  return { typeExternalId, departamentos, deptoPorUsuario };
}

type Ambiente = Awaited<ReturnType<typeof contexto>>;

async function buscarDoMes(competencia: string, amb: Ambiente) {
  type Candidato = Awaited<ReturnType<typeof pierAdapter.listRequestsByType>>[number];
  const porId = new Map<string, Candidato>();

  // 1. Busca tipada: o Fechamento Contábil oficial, como já funcionava.
  const tipadas = await pierAdapter.listRequestsByType({
    typeExternalId: amb.typeExternalId,
    referenceMonth: competencia,
    incluirSemCompetencia: true,
  });
  for (const s of tipadas) porId.set(s.externalId, s);

  // 2. Busca ampla por texto (MM/AAAA): pega solicitações de outros tipos
  // (ex.: DAS, REINF, DCTFWEB) que departamentos como o Tributário também
  // trabalham, e que não têm tipo fixo no código. Complementa a busca
  // tipada; nunca some, o texto pode não bater 100% da competência.
  const [ano, mes] = competencia.split("-");
  const termoBusca = `${mes}/${ano}`;
  const amplas = await pierAdapter.listRequests({ status: "Todas", maxPages: 25, busca: termoBusca });
  for (const s of amplas) if (!porId.has(s.externalId)) porId.set(s.externalId, s);

  const selecionadas: Candidato[] = [];
  let ignoradasNaoContabeis = 0;
  for (const s of porId.values()) {
    const depto = s.responsibleExternalId
      ? (amb.deptoPorUsuario.get(s.responsibleExternalId) ?? null)
      : null;
    if (depto && amb.departamentos.has(depto) && responsavelHumano(s.responsibleName))
      selecionadas.push(s);
    else ignoradasNaoContabeis += 1;
  }
  return { contabeis: selecionadas, ignoradasNaoContabeis };
}


async function externalIdsJaGravados(ctx: AppContext, ids: string[]) {
  const existentes = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await ctx.db
      .from("request")
      .select("external_id")
      .eq("organization_id", ctx.organizationId)
      .in("external_id", ids.slice(i, i + 500));
    if (error)
      throw new AppError(
        "INESPERADO",
        "Não foi possível conferir as solicitações.",
        error.message,
      );
    for (const linha of data ?? []) existentes.add(linha.external_id);
  }
  return existentes;
}

/** Pré-visualização somente leitura: nada é gravado no banco nem no PIER. */
export async function previsualizarCarga(
  ctx: AppContext,
  input: { inicio: string; fim: string; incluirFinalizadas?: boolean },
): Promise<PreviewCarga> {
  const meses = listarMeses(input.inicio, input.fim);
  const amb = await contexto(ctx);
  const resumos: ResumoCompetencia[] = [];

  for (const competencia of meses) {
    try {
      const { contabeis, ignoradasNaoContabeis } = await buscarDoMes(
        competencia,
        amb,
      );
      const existentes = await externalIdsJaGravados(
        ctx,
        contabeis.map((s) => s.externalId),
      );
      const { elegiveis, finalizadasIgnoradas } = selecionarParaCarga(
        contabeis,
        existentes,
        Boolean(input.incluirFinalizadas),
      );
      resumos.push({
        competencia,
        encontradas: elegiveis.length,
        novas: elegiveis.filter((s) => !existentes.has(s.externalId)).length,
        existentes: elegiveis.filter((s) => existentes.has(s.externalId)).length,
        comAnexo: elegiveis.filter((s) => s.hasAttachment).length,
        semAnexo: elegiveis.filter((s) => !s.hasAttachment).length,
        semCompetencia: elegiveis.filter((s) => !s.referenceMonth).length,
        ignoradasNaoContabeis,
        finalizadasIgnoradas,
        erro: null,
      });
    } catch (error) {
      // Uma competência com falha não invalida as demais.
      resumos.push({
        competencia,
        encontradas: 0,
        novas: 0,
        existentes: 0,
        comAnexo: 0,
        semAnexo: 0,
        semCompetencia: 0,
        ignoradasNaoContabeis: 0,
        finalizadasIgnoradas: 0,
        erro:
          error instanceof AppError
            ? error.userMessage
            : "Falha ao consultar o PIER.",
      });
    }
  }

  const soma = (campo: keyof ResumoCompetencia) =>
    resumos.reduce(
      (total, m) =>
        total + (typeof m[campo] === "number" ? (m[campo] as number) : 0),
      0,
    );

  return {
    inicio: input.inicio,
    fim: input.fim,
    totalMeses: meses.length,
    meses: resumos,
    totalEncontradas: soma("encontradas"),
    totalNovas: soma("novas"),
    totalExistentes: soma("existentes"),
    totalComAnexo: soma("comAnexo"),
    totalSemAnexo: soma("semAnexo"),
    totalSemCompetencia: soma("semCompetencia"),
    totalFinalizadasIgnoradas: soma("finalizadasIgnoradas"),
    totalErros: resumos.filter((m) => m.erro).length,
  };
}

/** Abre o registro da carga (histórica ou mensal) para acompanhar o progresso. */
export async function abrirCarga(
  ctx: AppContext,
  input: {
    inicio: string;
    fim: string;
    tipoCarga: "HISTORICA" | "MENSAL";
    incluirFinalizadas?: boolean;
  },
) {
  assertCanWrite(ctx);
  const meses = listarMeses(input.inicio, input.fim);

  const { data: run, error } = await ctx.db
    .from("sync_run")
    .insert({
      organization_id: ctx.organizationId,
      kind:
        input.tipoCarga === "HISTORICA" ? "CARGA_HISTORICA" : "CARGA_MENSAL",
      scope: {
        inicio: input.inicio,
        fim: input.fim,
        meses,
        incluirFinalizadas: Boolean(input.incluirFinalizadas),
      } as never,
      status: "RUNNING",
      total_items: meses.length,
      started_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !run)
    throw new AppError(
      "INESPERADO",
      "Não foi possível iniciar a carga.",
      error?.message,
    );

  await audit(ctx, {
    action: "ABRIR_CARGA_COMPETENCIAS",
    entity: "sync_run",
    entityId: run.id,
    after: {
      inicio: input.inicio,
      fim: input.fim,
      tipoCarga: input.tipoCarga,
      incluirFinalizadas: Boolean(input.incluirFinalizadas),
    },
  });

  return { runId: run.id, meses };
}

/**
 * Carrega uma única competência. É idempotente por organization_id + external_id:
 * repetir o mesmo mês atualiza status/anexos sem duplicar linhas. Por padrão,
 * finalizadas novas são ignoradas; finalizadas já existentes continuam atualizadas.
 */
export async function carregarCompetencia(
  ctx: AppContext,
  input: {
    competencia: string;
    runId?: string | null;
    incluirFinalizadas?: boolean;
  },
): Promise<ResumoCompetencia> {
  assertCanWrite(ctx);
  if (!FORMATO.test(input.competencia))
    throw new AppError(
      "VALIDACAO",
      "Informe a competência no formato AAAA-MM.",
    );

  const amb = await contexto(ctx);
  const agora = new Date().toISOString();

  try {
    const { contabeis, ignoradasNaoContabeis } = await buscarDoMes(
      input.competencia,
      amb,
    );
    const existentes = await externalIdsJaGravados(
      ctx,
      contabeis.map((s) => s.externalId),
    );
    const { elegiveis, finalizadasIgnoradas } = selecionarParaCarga(
      contabeis,
      existentes,
      Boolean(input.incluirFinalizadas),
    );

    for (let inicio = 0; inicio < elegiveis.length; inicio += LOTE) {
      const lote = elegiveis.slice(inicio, inicio + LOTE);
      const { error } = await ctx.db.from("request").upsert(
        lote.map((s) => ({
          organization_id: ctx.organizationId,
          external_id: s.externalId,
          number: s.number,
          description: s.description,
          type_name: s.typeName,
          type_external_id: amb.typeExternalId,
          purpose: s.purpose,
          // Sem competência interpretável a solicitação fica em revisão, nunca descartada.
          reference_month: s.referenceMonth,
          status: s.status,
          responsible_name: s.responsibleName,
          responsible_external_id: s.responsibleExternalId,
          department_external_id: s.responsibleExternalId
            ? (amb.deptoPorUsuario.get(s.responsibleExternalId) ?? null)
            : null,
          client_external_id: s.clientExternalId,
          client_name: s.clientName,
          client_document: s.clientDocument,
          requested_at: s.requestedAt,
          finished_at: s.finishedAt,
          deadline_at: s.deadlineAt,
          has_attachment: s.hasAttachment,
          raw: s.raw as never,
          synced_at: agora,
        })),
        { onConflict: "organization_id,external_id" },
      );
      if (error)
        throw new AppError(
          "INESPERADO",
          `Não foi possível gravar a competência ${input.competencia}.`,
          error.message,
        );
    }

    const resumo: ResumoCompetencia = {
      competencia: input.competencia,
      encontradas: elegiveis.length,
      novas: elegiveis.filter((s) => !existentes.has(s.externalId)).length,
      existentes: elegiveis.filter((s) => existentes.has(s.externalId)).length,
      comAnexo: elegiveis.filter((s) => s.hasAttachment).length,
      semAnexo: elegiveis.filter((s) => !s.hasAttachment).length,
      semCompetencia: elegiveis.filter((s) => !s.referenceMonth).length,
      ignoradasNaoContabeis,
      finalizadasIgnoradas,
      erro: null,
    };

    await registrarEvento(ctx, input.runId, "INFO", input.competencia, {
      ...resumo,
    });
    return resumo;
  } catch (error) {
    const mensagem =
      error instanceof AppError
        ? error.userMessage
        : "Falha inesperada ao carregar a competência.";
    // Falha isolada: os meses já carregados permanecem intactos e a carga pode ser retomada.
    await registrarEvento(ctx, input.runId, "CRITICAL", input.competencia, {
      erro: mensagem,
    });
    throw error;
  }
}

async function registrarEvento(
  ctx: AppContext,
  runId: string | null | undefined,
  level: "INFO" | "CRITICAL",
  competencia: string,
  detalhe: Record<string, unknown>,
) {
  if (!runId) return;
  await ctx.db.from("sync_event").insert({
    organization_id: ctx.organizationId,
    sync_run_id: runId,
    level,
    external_id: competencia,
    message: JSON.stringify({ competencia, ...detalhe }),
  });

  const { data: eventos } = await ctx.db
    .from("sync_event")
    .select("level")
    .eq("organization_id", ctx.organizationId)
    .eq("sync_run_id", runId);

  await ctx.db
    .from("sync_run")
    .update({
      processed_items: (eventos ?? []).filter((e) => e.level === "INFO").length,
      failed_items: (eventos ?? []).filter((e) => e.level === "CRITICAL").length,
    })
    .eq("id", runId);
}

/** Fecha a carga, mantendo o histórico de cada competência processada. */
export async function encerrarCarga(
  ctx: AppContext,
  input: {
    runId: string;
    status: "COMPLETED" | "FAILED" | "CANCELLED";
    mensagem?: string | null;
  },
) {
  assertCanWrite(ctx);
  const { error } = await ctx.db
    .from("sync_run")
    .update({
      status: input.status,
      message: input.mensagem ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("organization_id", ctx.organizationId)
    .eq("id", input.runId);

  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível encerrar a carga.",
      error.message,
    );
  return { runId: input.runId, status: input.status };
}

export interface EstadoCarga {
  possuiCarga: boolean;
  competenciasCarregadas: { competencia: string; total: number }[];
  primeiraCompetencia: string | null;
  ultimaCompetencia: string | null;
  ultimaSincronizacao: string | null;
  proximaSugerida: string;
  emRevisaoCompetencia: number;
  cargaEmAndamento: { id: string; kind: string; iniciadaEm: string } | null;
}

/** Situação atual da base: o que já foi carregado e qual o próximo mês sugerido. */
export async function estadoCarga(ctx: AppContext): Promise<EstadoCarga> {
  const typeExternalId = await resolverTipoSolicitacao(ctx, "CONTABIL");

  const { data: linhas, error } = await ctx.db
    .from("request")
    .select("reference_month, synced_at")
    .eq("organization_id", ctx.organizationId)
    .eq("type_external_id", typeExternalId);

  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível ler o estado da carga.",
      error.message,
    );

  const porCompetencia = new Map<string, number>();
  let emRevisaoCompetencia = 0;
  let ultimaSincronizacao: string | null = null;

  for (const linha of linhas ?? []) {
    if (linha.reference_month)
      porCompetencia.set(
        linha.reference_month,
        (porCompetencia.get(linha.reference_month) ?? 0) + 1,
      );
    else emRevisaoCompetencia += 1;
    if (
      linha.synced_at &&
      (!ultimaSincronizacao || linha.synced_at > ultimaSincronizacao)
    )
      ultimaSincronizacao = linha.synced_at;
  }

  const competenciasCarregadas = [...porCompetencia.entries()]
    .map(([competencia, total]) => ({ competencia, total }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));

  const primeira = competenciasCarregadas[0]?.competencia ?? null;
  const ultima = competenciasCarregadas.at(-1)?.competencia ?? null;

  const { data: emAndamento } = await ctx.db
    .from("sync_run")
    .select("id, kind, started_at, status")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "RUNNING")
    .in("kind", ["CARGA_HISTORICA", "CARGA_MENSAL"])
    .order("started_at", { ascending: false })
    .limit(1);

  const run = (emAndamento ?? [])[0] ?? null;
  const hoje = new Date();
  const mesAtual = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;

  return {
    possuiCarga: competenciasCarregadas.length > 0,
    competenciasCarregadas,
    primeiraCompetencia: primeira,
    ultimaCompetencia: ultima,
    ultimaSincronizacao,
    proximaSugerida: ultima ? proximaCompetencia(ultima) : mesAtual,
    emRevisaoCompetencia,
    cargaEmAndamento: run
      ? { id: run.id, kind: run.kind, iniciadaEm: run.started_at as string }
      : null,
  };
}