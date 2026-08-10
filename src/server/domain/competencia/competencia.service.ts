import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { audit } from "../../lib/audit";

export const SITUACOES = [
  "CONCLUIDA_NO_PRAZO",
  "CONCLUIDA_FORA_PRAZO",
  "EM_ANDAMENTO_NO_PRAZO",
  "ATRASADA",
  "AGUARDANDO_CLIENTE",
  "SEM_EVIDENCIA",
  "PRECISA_REVISAO",
  "NAO_ANALISADA",
] as const;

export type Situacao = (typeof SITUACOES)[number];

export interface CompetenciaFiltro {
  competencia?: string;
  situacao?: Situacao;
  responsavel?: string | "SEM_RESPONSAVEL";
  empresaId?: string;
  tipo?: "CONTABIL" | "FISCAL" | "OUTRO";
}

export interface CompetenciaLinha {
  id: string;
  empresaId: string;
  empresaNome: string;
  documento: string | null;
  competencia: string;
  tipo: string;
  situacao: Situacao;
  responsavel: string | null;
  prazo: string | null;
  entregueEm: string | null;
  ultimaAnalise: string | null;
}

export async function listarCompetencias(
  ctx: AppContext,
  filtro: CompetenciaFiltro,
): Promise<CompetenciaLinha[]> {
  let query = ctx.db
    .from("closing_period")
    .select(
      "id, reference_month, type, situation, responsible_name, deadline_at, delivered_at, last_analysis_at, company:company_id(id, name, document)",
    )
    .eq("organization_id", ctx.organizationId)
    .order("reference_month", { ascending: false });

  if (filtro.competencia) query = query.eq("reference_month", filtro.competencia);
  if (filtro.situacao) query = query.eq("situation", filtro.situacao);
  if (filtro.tipo) query = query.eq("type", filtro.tipo);
  if (filtro.empresaId) query = query.eq("company_id", filtro.empresaId);
  if (filtro.responsavel === "SEM_RESPONSAVEL") query = query.is("responsible_name", null);
  else if (filtro.responsavel) query = query.eq("responsible_name", filtro.responsavel);

  const { data, error } = await query.limit(500);
  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar as competências.", error.message);

  return (data ?? []).map((row) => {
    const empresa = row.company as unknown as {
      id: string;
      name: string;
      document: string | null;
    };
    return {
      id: row.id,
      empresaId: empresa?.id ?? "",
      empresaNome: empresa?.name ?? "Empresa removida",
      documento: empresa?.document ?? null,
      competencia: row.reference_month,
      tipo: row.type,
      situacao: row.situation as Situacao,
      responsavel: row.responsible_name,
      prazo: row.deadline_at,
      entregueEm: row.delivered_at,
      ultimaAnalise: row.last_analysis_at,
    };
  });
}

export interface Dossie {
  competencia: CompetenciaLinha;
  analise: {
    id: string;
    situacao: Situacao;
    confianca: number;
    regra: string | null;
    descricaoRegra: string | null;
    exigeRevisao: boolean;
    calculadoEm: string;
    evidencias: {
      id: string;
      origem: string;
      referencia: string | null;
      trecho: string | null;
      ocorridoEm: string | null;
    }[];
  } | null;
  solicitacoes: {
    id: string;
    numero: string | null;
    descricao: string | null;
    tipo: string | null;
    finalidade: string;
    status: string | null;
    responsavel: string | null;
    solicitadoEm: string | null;
    concluidoEm: string | null;
    prazo: string | null;
    temAnexo: boolean;
  }[];
  pendencias: {
    id: string;
    categoria: string;
    regra: string | null;
    severidade: string;
    encontrado: string | null;
    esperado: string | null;
    diferenca: string | null;
    orientacao: string | null;
    status: string;
  }[];
}

export async function obterDossie(ctx: AppContext, competenciaId: string): Promise<Dossie> {
  const linhas = await listarCompetencias(ctx, {});
  const competencia = linhas.find((l) => l.id === competenciaId);
  if (!competencia) throw new AppError("VALIDACAO", "Competência não encontrada.");

  const { data: analise } = await ctx.db
    .from("analysis_result")
    .select("id, situation, confidence, rule_code, rule_description, requires_human_review, computed_at")
    .eq("organization_id", ctx.organizationId)
    .eq("closing_period_id", competenciaId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let evidencias: Dossie["analise"] extends null ? never : NonNullable<Dossie["analise"]>["evidencias"] = [];
  if (analise) {
    const { data } = await ctx.db
      .from("evidence")
      .select("id, source_type, source_ref, excerpt, occurred_at")
      .eq("analysis_result_id", analise.id)
      .order("occurred_at", { ascending: false });
    evidencias = (data ?? []).map((e) => ({
      id: e.id,
      origem: e.source_type,
      referencia: e.source_ref,
      trecho: e.excerpt,
      ocorridoEm: e.occurred_at,
    }));
  }

  const { data: solicitacoes } = await ctx.db
    .from("request")
    .select(
      "id, number, description, type_name, purpose, status, responsible_name, requested_at, finished_at, deadline_at, has_attachment",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("closing_period_id", competenciaId)
    .order("requested_at", { ascending: false });

  const { data: pendencias } = await ctx.db
    .from("pendency")
    .select(
      "id, category, rule_code, severity, found_value, expected_value, difference, guidance, status",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("closing_period_id", competenciaId);

  return {
    competencia,
    analise: analise
      ? {
          id: analise.id,
          situacao: analise.situation as Situacao,
          confianca: Number(analise.confidence),
          regra: analise.rule_code,
          descricaoRegra: analise.rule_description,
          exigeRevisao: analise.requires_human_review,
          calculadoEm: analise.computed_at,
          evidencias,
        }
      : null,
    solicitacoes: (solicitacoes ?? []).map((s) => ({
      id: s.id,
      numero: s.number,
      descricao: s.description,
      tipo: s.type_name,
      finalidade: s.purpose,
      status: s.status,
      responsavel: s.responsible_name,
      solicitadoEm: s.requested_at,
      concluidoEm: s.finished_at,
      prazo: s.deadline_at,
      temAnexo: s.has_attachment,
    })),
    pendencias: (pendencias ?? []).map((p) => ({
      id: p.id,
      categoria: p.category,
      regra: p.rule_code,
      severidade: p.severity,
      encontrado: p.found_value,
      esperado: p.expected_value,
      diferenca: p.difference,
      orientacao: p.guidance,
      status: p.status,
    })),
  };
}

export async function definirSituacaoManual(
  ctx: AppContext,
  input: { competenciaId: string; situacao: Situacao; observacao?: string },
) {
  assertCanWrite(ctx);
  const { error } = await ctx.db
    .from("closing_period")
    .update({
      situation: input.situacao,
      last_analysis_at: new Date().toISOString(),
      delivered_at: input.situacao.startsWith("CONCLUIDA") ? new Date().toISOString() : null,
    })
    .eq("organization_id", ctx.organizationId)
    .eq("id", input.competenciaId);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível atualizar a situação.", error.message);

  await audit(ctx, {
    action: "DEFINIR_SITUACAO",
    entity: "closing_period",
    entityId: input.competenciaId,
    after: { situacao: input.situacao, observacao: input.observacao ?? null },
  });
  return { ok: true };
}
