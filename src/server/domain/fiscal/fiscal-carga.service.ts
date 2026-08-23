import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { listarMeses, proximaCompetencia } from "../gestao/carga.service";
import { selecionarParaCarga } from "../gestao/status-pier";
import { departamentosFiscais, mapaDepartamentoUsuarios, responsavelHumano } from "./fiscal-gestao.service";

const FORMATO = /^\d{4}-\d{2}$/;
const LOTE = 250;

export interface ResumoCompetenciaFiscal {
  competencia: string;
  encontradas: number;
  novas: number;
  existentes: number;
  comAnexo: number;
  semAnexo: number;
  /** Solicitações sem competência interpretável — vão para "Revisão de competência". */
  semCompetencia: number;
  /** Fora dos departamentos Tributário Legacy/BPO, ou de conta automática. */
  ignoradasForaDoEscopo: number;
  /** Finalizadas novas ignoradas na carga operacional para reduzir volume. */
  finalizadasIgnoradas: number;
  erro: string | null;
}

export interface PreviewCargaFiscal {
  inicio: string;
  fim: string;
  totalMeses: number;
  meses: ResumoCompetenciaFiscal[];
  totalEncontradas: number;
  totalNovas: number;
  totalExistentes: number;
  totalComAnexo: number;
  totalSemAnexo: number;
  totalSemCompetencia: number;
  totalFinalizadasIgnoradas: number;
  totalErros: number;
}

async function contexto(ctx: AppContext) {
  const departamentos = new Set(await departamentosFiscais(ctx));
  const deptoPorUsuario = await mapaDepartamentoUsuarios(ctx);
  return { departamentos, deptoPorUsuario };
}

type Ambiente = Awaited<ReturnType<typeof contexto>>;

/**
 * Diferente do Contábil, o PIER não tem um tipo de solicitação exclusivo
 * para fiscal: quem define o escopo é o departamento do responsável
 * (Tributário Legacy/BPO). O tipo/descrição real de cada solicitação é
 * preservado e serve só para classificação posterior, nunca para filtrar.
 */
async function buscarDoMes(competencia: string, amb: Ambiente) {
  const [ano, mes] = competencia.split("-");
  const termoBusca = `${mes}/${ano}`;
  const solicitacoes = await pierAdapter.listRequests({
    status: "Todas",
    maxPages: 200,
    busca: termoBusca,
  });

  const fiscais: typeof solicitacoes = [];
  let ignoradasForaDoEscopo = 0;
  for (const s of solicitacoes) {
    const depto = s.responsibleExternalId
      ? (amb.deptoPorUsuario.get(s.responsibleExternalId) ?? null)
      : null;
    const doEscopo =
      Boolean(depto && amb.departamentos.has(depto)) && responsavelHumano(s.responsibleName);
    if (!doEscopo) {
      ignoradasForaDoEscopo += 1;
      continue;
    }
    if (s.referenceMonth && s.referenceMonth !== competencia) continue;
    fiscais.push(s.referenceMonth === competencia ? s : { ...s, referenceMonth: competencia });
  }
  return { fiscais, ignoradasForaDoEscopo };
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
      throw new AppError("INESPERADO", "Não foi possível conferir as solicitações.", error.message);
    for (const linha of data ?? []) existentes.add(linha.external_id);
  }
  return existentes;
}

/** Pré-visualização somente leitura: nada é gravado no banco nem no PIER. */
export async function previsualizarCargaFiscal(
  ctx: AppContext,
  input: { inicio: string; fim: string; incluirFinalizadas?: boolean },
): Promise<PreviewCargaFiscal> {
  const meses = listarMeses(input.inicio, input.fim);
  const amb = await contexto(ctx);
  const resumos: ResumoCompetenciaFiscal[] = [];

  for (const competencia of meses) {
    try {
      const { fiscais, ignoradasForaDoEscopo } = await buscarDoMes(competencia, amb);
      const existentes = await externalIdsJaGravados(ctx, fiscais.map((s) => s.externalId));
      const { elegiveis, finalizadasIgnoradas } = selecionarParaCarga(
        fiscais,
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
        ignoradasForaDoEscopo,
        finalizadasIgnoradas,
        erro: null,
      });
    } catch (error) {
      resumos.push({
        competencia,
        encontradas: 0,
        novas: 0,
        existentes: 0,
        comAnexo: 0,
        semAnexo: 0,
        semCompetencia: 0,
        ignoradasForaDoEscopo: 0,
        finalizadasIgnoradas: 0,
        erro: error instanceof AppError ? error.userMessage : "Falha ao consultar o PIER.",
      });
    }
  }

  const soma = (campo: keyof ResumoCompetenciaFiscal) =>
    resumos.reduce(
      (total, m) => total + (typeof m[campo] === "number" ? (m[campo] as number) : 0),
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
export async function abrirCargaFiscal(
  ctx: AppContext,
  input: { inicio: string; fim: string; tipoCarga: "HISTORICA" | "MENSAL"; incluirFinalizadas?: boolean },
) {
  assertCanWrite(ctx);
  const meses = listarMeses(input.inicio, input.fim);

  const { data: run, error } = await ctx.db
    .from("sync_run")
    .insert({
      organization_id: ctx.organizationId,
      kind: input.tipoCarga === "HISTORICA" ? "CARGA_HISTORICA_FISCAL" : "CARGA_MENSAL_FISCAL",
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
    throw new AppError("INESPERADO", "Não foi possível iniciar a carga fiscal.", error?.message);

  await audit(ctx, {
    action: "ABRIR_CARGA_COMPETENCIAS_FISCAL",
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
 * Carrega uma única competência. Idempotente por organization_id + external_id:
 * repetir o mesmo mês atualiza status/anexos sem duplicar linhas.
 */
export async function carregarCompetenciaFiscal(
  ctx: AppContext,
  input: { competencia: string; runId?: string | null; incluirFinalizadas?: boolean },
): Promise<ResumoCompetenciaFiscal> {
  assertCanWrite(ctx);
  if (!FORMATO.test(input.competencia))
    throw new AppError("VALIDACAO", "Informe a competência no formato AAAA-MM.");

  const amb = await contexto(ctx);
  const agora = new Date().toISOString();

  try {
    const { fiscais, ignoradasForaDoEscopo } = await buscarDoMes(input.competencia, amb);
    const existentes = await externalIdsJaGravados(ctx, fiscais.map((s) => s.externalId));
    const { elegiveis, finalizadasIgnoradas } = selecionarParaCarga(
      fiscais,
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
          type_external_id: s.typeExternalId,
          purpose: s.purpose,
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
          `Não foi possível gravar a competência fiscal ${input.competencia}.`,
          error.message,
        );
    }

    const resumo: ResumoCompetenciaFiscal = {
      competencia: input.competencia,
      encontradas: elegiveis.length,
      novas: elegiveis.filter((s) => !existentes.has(s.externalId)).length,
      existentes: elegiveis.filter((s) => existentes.has(s.externalId)).length,
      comAnexo: elegiveis.filter((s) => s.hasAttachment).length,
      semAnexo: elegiveis.filter((s) => !s.hasAttachment).length,
      semCompetencia: elegiveis.filter((s) => !s.referenceMonth).length,
      ignoradasForaDoEscopo,
      finalizadasIgnoradas,
      erro: null,
    };

    await registrarEvento(ctx, input.runId, "INFO", input.competencia, { ...resumo });
    return resumo;
  } catch (error) {
    const mensagem =
      error instanceof AppError ? error.userMessage : "Falha inesperada ao carregar a competência.";
    await registrarEvento(ctx, input.runId, "CRITICAL", input.competencia, { erro: mensagem });
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

export interface EstadoCargaFiscal {
  possuiCarga: boolean;
  competenciasCarregadas: { competencia: string; total: number }[];
  primeiraCompetencia: string | null;
  ultimaCompetencia: string | null;
  ultimaSincronizacao: string | null;
  proximaSugerida: string;
  emRevisaoCompetencia: number;
  cargaEmAndamento: { id: string; kind: string; iniciadaEm: string } | null;
}

/** Situação atual da base fiscal: o que já foi carregado e qual o próximo mês sugerido. */
export async function estadoCargaFiscal(ctx: AppContext): Promise<EstadoCargaFiscal> {
  const departamentos = await departamentosFiscais(ctx);

  const { data: linhas, error } = await ctx.db
    .from("request")
    .select("reference_month, synced_at, responsible_name")
    .eq("organization_id", ctx.organizationId)
    .in("department_external_id", departamentos);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível ler o estado da carga fiscal.", error.message);

  const porCompetencia = new Map<string, number>();
  let emRevisaoCompetencia = 0;
  let ultimaSincronizacao: string | null = null;

  for (const linha of linhas ?? []) {
    if (!responsavelHumano(linha.responsible_name)) continue;
    if (linha.reference_month)
      porCompetencia.set(linha.reference_month, (porCompetencia.get(linha.reference_month) ?? 0) + 1);
    else emRevisaoCompetencia += 1;
    if (linha.synced_at && (!ultimaSincronizacao || linha.synced_at > ultimaSincronizacao))
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
    .in("kind", ["CARGA_HISTORICA_FISCAL", "CARGA_MENSAL_FISCAL"])
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
    cargaEmAndamento: run ? { id: run.id, kind: run.kind, iniciadaEm: run.started_at as string } : null,
  };
}
