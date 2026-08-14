import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { resolverTipoSolicitacao, type TipoFechamento } from "./escopo.service";
import { carregarTodasAsLinhas, carregarUsuariosPier } from "./pier-user.repo";


export interface EscopoFiltro {
  competencia: string;
  tipo: TipoFechamento;
  /** ID externo do departamento no PIER. Vazio = todos os departamentos. */
  departamentoId?: string | null;
  /** ID externo do usuário responsável no PIER. Vazio = todos do departamento. */
  responsavelId?: string | null;
  /** Seleção manual de empresas internas (reservado para etapas futuras). */
  empresaIds?: string[];
}

export interface EscopoLinha {
  solicitacaoId: string;
  numero: string | null;
  clienteNome: string;
  documento: string | null;
  regime: string | null;
  departamentoId: string | null;
  departamentoNome: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  empresaId: string | null;
  vinculada: boolean;
  statusSolicitacao: string | null;
  jaAberta: boolean;
  competencia: string | null;
  temAnexo: boolean;
  /** Estado da análise interna do balancete desta solicitação. */
  statusAnalise: "NAO_ANALISADA" | "ANALISANDO" | "CONCLUIDA" | "FALHOU";
  resultadoAnalise: string | null;
}

export interface EscopoPreview {
  competencia: string;
  tipo: string;
  departamento: { id: string | null; nome: string };
  responsavel: { id: string | null; nome: string };
  totalEmpresas: number;
  totalComVinculo: number;
  totalSemVinculo: number;
  totalSemResponsavel: number;
  competenciasExistentes: number;
  competenciasNovas: number;
  solicitacoesEmCache: number;
  responsaveis: { id: string | null; nome: string; total: number }[];
  empresas: EscopoLinha[];
}

function normalizarDocumento(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

async function carregarEscopo(ctx: AppContext, filtro: EscopoFiltro) {
  const typeExternalId = await resolverTipoSolicitacao(ctx, filtro.tipo);

  const { data: solicitacoes, error } = await ctx.db
    .from("request")
    .select(
      "id, external_id, number, description, status, client_name, client_document, company_id, responsible_external_id, responsible_name, department_external_id, has_attachment, reference_month",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("reference_month", filtro.competencia)
    .eq("type_external_id", typeExternalId);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível montar o escopo.", error.message);

  const [usuarios, { data: departamentos }, clientes, { data: aberturas }] = await Promise.all([
    carregarUsuariosPier<{
      external_id: string;
      name: string;
      status: string | null;
      department_external_id: string | null;
    }>(ctx, "external_id, name, status, department_external_id"),
    ctx.db
      .from("pier_department")
      .select("external_id, name")
      .eq("organization_id", ctx.organizationId),
    carregarTodasAsLinhas<{ document: string | null; tax_regime: string | null }>(
      ctx,
      "pier_client",
      "document, tax_regime",
    ),
    ctx.db
      .from("closing_period")
      .select("company_id")
      .eq("organization_id", ctx.organizationId)
      .eq("reference_month", filtro.competencia)
      .eq("type", filtro.tipo),
  ]);

  const usuarioPorId = new Map(usuarios.map((u) => [u.external_id, u]));

  const deptoNome = new Map((departamentos ?? []).map((d) => [d.external_id, d.name]));
  const regimePorDoc = new Map(
    (clientes ?? []).map((c) => [normalizarDocumento(c.document), c.tax_regime]),
  );
  const abertas = new Set((aberturas ?? []).map((a) => a.company_id));

  // Estado da análise interna (a última execução por solicitação).
  const idsSolicitacoes = (solicitacoes ?? []).map((s) => s.id);
  const analisePorRequest = new Map<string, { status: string; resultado: string | null }>();
  if (idsSolicitacoes.length) {
    const { data: execucoes } = await ctx.db
      .from("validation_execution")
      .select("request_id, status, result, created_at")
      .eq("organization_id", ctx.organizationId)
      .in("request_id", idsSolicitacoes)
      .order("created_at", { ascending: false });
    for (const e of execucoes ?? []) {
      if (!analisePorRequest.has(e.request_id))
        analisePorRequest.set(e.request_id, { status: e.status, resultado: e.result });
    }
  }

  let linhas: EscopoLinha[] = (solicitacoes ?? []).map((s) => {
    const analise = analisePorRequest.get(s.id) ?? null;
    const statusAnalise: EscopoLinha["statusAnalise"] = !analise
      ? "NAO_ANALISADA"
      : analise.status === "COMPLETED"
        ? "CONCLUIDA"
        : analise.status === "FAILED"
          ? "FALHOU"
          : "ANALISANDO";
    const usuario = s.responsible_external_id
      ? (usuarioPorId.get(s.responsible_external_id) ?? null)
      : null;
    const departamentoId = s.department_external_id ?? usuario?.department_external_id ?? null;
    return {
      solicitacaoId: s.external_id,
      numero: s.number,
      clienteNome: s.client_name ?? "—",
      documento: s.client_document,
      regime: regimePorDoc.get(normalizarDocumento(s.client_document)) ?? null,
      departamentoId,
      departamentoNome: departamentoId ? (deptoNome.get(departamentoId) ?? null) : null,
      responsavelId: s.responsible_external_id,
      responsavelNome: s.responsible_name ?? usuario?.name ?? null,
      empresaId: s.company_id,
      vinculada: Boolean(s.company_id),
      statusSolicitacao: s.status,
      jaAberta: Boolean(s.company_id && abertas.has(s.company_id)),
      competencia: s.reference_month,
      temAnexo: Boolean(s.has_attachment),
      statusAnalise,
      resultadoAnalise: analise?.resultado ?? null,
    };
  });

  if (filtro.responsavelId) {
    const usuario = usuarioPorId.get(filtro.responsavelId);
    if (
      filtro.departamentoId &&
      usuario &&
      usuario.department_external_id !== filtro.departamentoId
    )
      throw new AppError(
        "VALIDACAO",
        "O responsável selecionado não pertence ao departamento escolhido.",
      );
    linhas = linhas.filter((l) => l.responsavelId === filtro.responsavelId);
  } else if (filtro.departamentoId) {
    linhas = linhas.filter((l) => l.departamentoId === filtro.departamentoId);
  }

  if (filtro.empresaIds?.length) {
    const set = new Set(filtro.empresaIds);
    linhas = linhas.filter((l) => l.empresaId && set.has(l.empresaId));
  }

  linhas.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));

  const departamentoNome = filtro.departamentoId
    ? (deptoNome.get(filtro.departamentoId) ?? `Departamento ${filtro.departamentoId}`)
    : "Todos os departamentos";
  const responsavelNome = filtro.responsavelId
    ? (usuarioPorId.get(filtro.responsavelId)?.name ?? filtro.responsavelId)
    : "Todos do departamento";

  return {
    linhas,
    departamentoNome,
    responsavelNome,
    totalSolicitacoes: (solicitacoes ?? []).length,
  };
}

export async function montarPreview(
  ctx: AppContext,
  filtro: EscopoFiltro,
): Promise<EscopoPreview> {
  const { linhas, departamentoNome, responsavelNome, totalSolicitacoes } = await carregarEscopo(
    ctx,
    filtro,
  );

  const porResponsavel = new Map<string, { id: string | null; nome: string; total: number }>();
  for (const linha of linhas) {
    const chave = linha.responsavelId ?? "sem-responsavel";
    const atual = porResponsavel.get(chave) ?? {
      id: linha.responsavelId,
      nome: linha.responsavelNome ?? "Sem responsável",
      total: 0,
    };
    atual.total += 1;
    porResponsavel.set(chave, atual);
  }

  return {
    competencia: filtro.competencia,
    tipo: filtro.tipo,
    departamento: { id: filtro.departamentoId ?? null, nome: departamentoNome },
    responsavel: { id: filtro.responsavelId ?? null, nome: responsavelNome },
    totalEmpresas: linhas.length,
    totalComVinculo: linhas.filter((l) => l.vinculada).length,
    totalSemVinculo: linhas.filter((l) => !l.vinculada).length,
    totalSemResponsavel: linhas.filter((l) => !l.responsavelId).length,
    competenciasExistentes: linhas.filter((l) => l.jaAberta).length,
    competenciasNovas: linhas.filter((l) => !l.jaAberta).length,
    solicitacoesEmCache: totalSolicitacoes,
    responsaveis: [...porResponsavel.values()].sort((a, b) => b.total - a.total),
    empresas: linhas,
  };
}

export async function iniciarGestao(
  ctx: AppContext,
  filtro: EscopoFiltro & { idempotencyKey: string },
) {
  assertCanWrite(ctx);
  const { linhas, departamentoNome, responsavelNome } = await carregarEscopo(ctx, filtro);
  if (!linhas.length)
    throw new AppError("REGRA_NEGOCIO", "Nenhuma empresa entra neste escopo. Ajuste os filtros.");

  const { data: existente } = await ctx.db
    .from("batch_execution")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("idempotency_key", filtro.idempotencyKey)
    .maybeSingle();
  if (existente) return { execucaoId: existente.id, reaproveitada: true };

  const { data: execucao, error } = await ctx.db
    .from("batch_execution")
    .insert({
      organization_id: ctx.organizationId,
      reference_month: filtro.competencia,
      scope: {
        tipo: filtro.tipo,
        empresas: linhas.length,
        departamentoId: filtro.departamentoId ?? null,
        departamentoNome,
        responsavelId: filtro.responsavelId ?? null,
        responsavelNome,
      } as never,
      status: "RUNNING",
      total_items: linhas.length,
      idempotency_key: filtro.idempotencyKey,
      started_by: ctx.userId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !execucao)
    throw new AppError("INESPERADO", "Não foi possível iniciar a gestão.", error?.message);

  let concluidos = 0;
  let alertas = 0;
  let erros = 0;
  let ignorados = 0;

  for (const linha of linhas) {
    if (!linha.empresaId) {
      ignorados += 1;
      await ctx.db.from("batch_item").insert({
        organization_id: ctx.organizationId,
        batch_execution_id: execucao.id,
        company_id: null,
        status: "SKIPPED",
        attempts: 1,
        message: `${linha.clienteNome}: cliente do PIER ainda sem vínculo com empresa interna.`,
      });
      continue;
    }

    const { data: periodo, error: periodoError } = await ctx.db
      .from("closing_period")
      .upsert(
        {
          organization_id: ctx.organizationId,
          company_id: linha.empresaId,
          reference_month: filtro.competencia,
          type: filtro.tipo,
          responsible_name: linha.responsavelNome,
          responsible_external_id: linha.responsavelId,
        },
        { onConflict: "company_id,reference_month,type" },
      )
      .select("id")
      .single();

    const semResponsavel = !linha.responsavelId;
    const status = periodoError ? "ERROR" : semResponsavel ? "WARNING" : "COMPLETED";
    if (periodoError) erros += 1;
    else if (semResponsavel) alertas += 1;
    else concluidos += 1;

    await ctx.db.from("batch_item").upsert(
      {
        organization_id: ctx.organizationId,
        batch_execution_id: execucao.id,
        closing_period_id: periodo?.id ?? null,
        company_id: linha.empresaId,
        status,
        attempts: 1,
        message: periodoError
          ? periodoError.message
          : semResponsavel
            ? "Solicitação sem responsável definido no PIER."
            : null,
      },
      { onConflict: "batch_execution_id,closing_period_id" },
    );

    if (periodo?.id) {
      await ctx.db
        .from("request")
        .update({ closing_period_id: periodo.id })
        .eq("organization_id", ctx.organizationId)
        .eq("external_id", linha.solicitacaoId);
    }
  }

  await ctx.db
    .from("batch_execution")
    .update({
      status: erros ? "FAILED" : "COMPLETED",
      completed_items: concluidos,
      warning_items: alertas,
      error_items: erros,
      skipped_items: ignorados,
      finished_at: new Date().toISOString(),
    })
    .eq("id", execucao.id);

  await audit(ctx, {
    action: "INICIAR_GESTAO",
    entity: "batch_execution",
    entityId: execucao.id,
    after: {
      competencia: filtro.competencia,
      departamentoId: filtro.departamentoId ?? null,
      responsavelId: filtro.responsavelId ?? null,
      empresas: linhas.length,
      alertas,
      erros,
      ignorados,
    },
  });

  return { execucaoId: execucao.id, reaproveitada: false };
}

export async function listarExecucoes(ctx: AppContext) {
  const { data, error } = await ctx.db
    .from("batch_execution")
    .select(
      "id, reference_month, scope, status, total_items, completed_items, warning_items, error_items, skipped_items, started_at, finished_at",
    )
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar as execuções.", error.message);

  return (data ?? []).map((e) => ({
    id: e.id,
    competencia: e.reference_month,
    escopo: (e.scope ?? {}) as {
      tipo?: string;
      empresas?: number;
      departamentoNome?: string;
      responsavelNome?: string;
    },
    status: e.status,
    total: e.total_items,
    concluidos: e.completed_items,
    alertas: e.warning_items,
    erros: e.error_items,
    ignorados: e.skipped_items,
    iniciadaEm: e.started_at,
    finalizadaEm: e.finished_at,
  }));
}

export async function detalharExecucao(ctx: AppContext, execucaoId: string) {
  const { data: itens, error } = await ctx.db
    .from("batch_item")
    .select("id, status, attempts, message, closing_period_id, company:company_id(id, name, document)")
    .eq("organization_id", ctx.organizationId)
    .eq("batch_execution_id", execucaoId);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar a execução.", error.message);

  return (itens ?? []).map((i) => {
    const empresa = i.company as unknown as { id: string; name: string; document: string | null };
    return {
      id: i.id,
      status: i.status,
      tentativas: i.attempts,
      mensagem: i.message,
      competenciaId: i.closing_period_id,
      empresaNome: empresa?.name ?? "—",
      documento: empresa?.document ?? null,
    };
  });
}
