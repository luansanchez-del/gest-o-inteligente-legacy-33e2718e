import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";

export interface EscopoFiltro {
  competencia: string;
  tipo: "CONTABIL" | "FISCAL" | "OUTRO";
  empresaIds?: string[];
  responsavel?: string | null;
  incluirSemResponsavel?: boolean;
}

export interface EscopoPreview {
  competencia: string;
  tipo: string;
  totalEmpresas: number;
  totalComVinculo: number;
  totalSemVinculo: number;
  totalSemResponsavel: number;
  competenciasExistentes: number;
  competenciasNovas: number;
  responsaveis: { nome: string; total: number }[];
  empresas: {
    id: string;
    nome: string;
    documento: string | null;
    vinculada: boolean;
    responsavel: string | null;
    jaAberta: boolean;
  }[];
}

async function carregarEmpresasDoEscopo(ctx: AppContext, filtro: EscopoFiltro) {
  const { data: empresas, error } = await ctx.db
    .from("company")
    .select("id, name, document, active")
    .eq("organization_id", ctx.organizationId)
    .eq("active", true)
    .order("name");

  if (error)
    throw new AppError("INESPERADO", "Não foi possível montar o escopo.", error.message);

  const { data: vinculos } = await ctx.db
    .from("company_pier_link")
    .select("company_id, pier_client:pier_client_id(responsible_name)")
    .eq("organization_id", ctx.organizationId);

  const mapaVinculo = new Map(
    (vinculos ?? []).map((v) => [
      v.company_id,
      (v.pier_client as unknown as { responsible_name: string | null } | null)?.responsible_name ??
        null,
    ]),
  );

  const { data: existentes } = await ctx.db
    .from("closing_period")
    .select("id, company_id")
    .eq("organization_id", ctx.organizationId)
    .eq("reference_month", filtro.competencia)
    .eq("type", filtro.tipo);

  const abertos = new Map((existentes ?? []).map((e) => [e.company_id, e.id]));

  let lista = (empresas ?? []).map((e) => ({
    id: e.id,
    nome: e.name,
    documento: e.document,
    vinculada: mapaVinculo.has(e.id),
    responsavel: mapaVinculo.get(e.id) ?? null,
    jaAberta: abertos.has(e.id),
    competenciaId: abertos.get(e.id) ?? null,
  }));

  if (filtro.empresaIds?.length) {
    const set = new Set(filtro.empresaIds);
    lista = lista.filter((e) => set.has(e.id));
  }
  if (filtro.responsavel) {
    lista = lista.filter(
      (e) =>
        e.responsavel === filtro.responsavel ||
        (filtro.incluirSemResponsavel && e.responsavel === null),
    );
  }

  return lista;
}

export async function montarPreview(
  ctx: AppContext,
  filtro: EscopoFiltro,
): Promise<EscopoPreview> {
  const lista = await carregarEmpresasDoEscopo(ctx, filtro);

  const responsaveisMap = new Map<string, number>();
  for (const empresa of lista) {
    const chave = empresa.responsavel ?? "Sem responsável";
    responsaveisMap.set(chave, (responsaveisMap.get(chave) ?? 0) + 1);
  }

  return {
    competencia: filtro.competencia,
    tipo: filtro.tipo,
    totalEmpresas: lista.length,
    totalComVinculo: lista.filter((e) => e.vinculada).length,
    totalSemVinculo: lista.filter((e) => !e.vinculada).length,
    totalSemResponsavel: lista.filter((e) => !e.responsavel).length,
    competenciasExistentes: lista.filter((e) => e.jaAberta).length,
    competenciasNovas: lista.filter((e) => !e.jaAberta).length,
    responsaveis: [...responsaveisMap.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total),
    empresas: lista.map(({ competenciaId: _ignored, ...rest }) => rest),
  };
}

export async function iniciarGestao(
  ctx: AppContext,
  filtro: EscopoFiltro & { idempotencyKey: string },
) {
  assertCanWrite(ctx);
  const lista = await carregarEmpresasDoEscopo(ctx, filtro);
  if (!lista.length)
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
        empresas: lista.length,
        responsavel: filtro.responsavel ?? null,
      } as never,
      status: "RUNNING",
      total_items: lista.length,
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

  for (const empresa of lista) {
    const { data: periodo, error: periodoError } = await ctx.db
      .from("closing_period")
      .upsert(
        {
          organization_id: ctx.organizationId,
          company_id: empresa.id,
          reference_month: filtro.competencia,
          type: filtro.tipo,
          responsible_name: empresa.responsavel,
        },
        { onConflict: "company_id,reference_month,type" },
      )
      .select("id")
      .single();

    const semVinculo = !empresa.vinculada;
    const status = periodoError ? "ERROR" : semVinculo ? "WARNING" : "COMPLETED";
    if (periodoError) erros += 1;
    else if (semVinculo) alertas += 1;
    else concluidos += 1;

    await ctx.db.from("batch_item").upsert(
      {
        organization_id: ctx.organizationId,
        batch_execution_id: execucao.id,
        closing_period_id: periodo?.id ?? null,
        company_id: empresa.id,
        status,
        attempts: 1,
        message: periodoError
          ? periodoError.message
          : semVinculo
            ? "Empresa sem vínculo com a carteira: acompanhamento sem origem de evidências."
            : null,
      },
      { onConflict: "batch_execution_id,closing_period_id" },
    );
  }

  await ctx.db
    .from("batch_execution")
    .update({
      status: erros ? "FAILED" : "COMPLETED",
      completed_items: concluidos,
      warning_items: alertas,
      error_items: erros,
      finished_at: new Date().toISOString(),
    })
    .eq("id", execucao.id);

  await audit(ctx, {
    action: "INICIAR_GESTAO",
    entity: "batch_execution",
    entityId: execucao.id,
    after: { competencia: filtro.competencia, empresas: lista.length, alertas, erros },
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
    escopo: (e.scope ?? {}) as { tipo?: string; empresas?: number; responsavel?: string | null },
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
