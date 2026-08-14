import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import {
  departamentosContabeis,
  resolverTipoSolicitacao,
  type TipoFechamento,
} from "./escopo.service";
import { carregarTodasAsLinhas, carregarUsuariosPier } from "./pier-user.repo";

/** Fila operacional do fechamento contábil, do documento pendente até a finalização interna. */
export type StatusFila =
  | "AGUARDANDO_DOCUMENTO"
  | "PRONTO_PARA_ANALISE"
  | "ANALISANDO"
  | "ANALISE_CONCLUIDA"
  | "REVISAO_NECESSARIA"
  | "BLOQUEADA"
  | "ERRO"
  | "HISTORICO";

export interface EscopoFiltro {
  competencia: string;
  /** Competência final do intervalo. Vazio = apenas a competência inicial. */
  competenciaFim?: string | null;
  tipo: TipoFechamento;
  /** ID externo do departamento no PIER. Vazio = todos os departamentos contábeis. */
  departamentoId?: string | null;
  /** ID externo do usuário responsável no PIER. Vazio = todos do departamento. */
  responsavelId?: string | null;
  /** Filtro opcional pela fila operacional. */
  statusFila?: StatusFila | null;
  /** Lista apenas solicitações sem competência interpretável (revisão de competência). */
  revisaoCompetencia?: boolean;
  /** Busca livre por nome ou CNPJ do cliente. */
  busca?: string | null;
  /** Filtra pela existência de anexo informada pelo PIER. */
  anexo?: "COM_ANEXO" | "SEM_ANEXO" | null;
}

export interface EscopoLinha {
  /** external_id da solicitação no PIER — a chave operacional desta tela. */
  solicitacaoId: string;
  numero: string | null;
  clienteExternalId: string | null;
  clienteNome: string;
  documento: string | null;
  regime: string | null;
  departamentoId: string | null;
  departamentoNome: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  statusSolicitacao: string | null;
  /** Aviso cadastral: a ficha do cliente não tem responsável contábil. Nunca bloqueia. */
  avisoCadastral: string | null;
  competencia: string | null;
  temAnexo: boolean;
  /** true quando o PDF já está armazenado internamente e pode ser analisado. */
  documentoDisponivel: boolean;
  /** Estado da análise interna do balancete desta solicitação. */
  statusAnalise: "NAO_ANALISADA" | "ANALISANDO" | "CONCLUIDA" | "FALHOU";
  resultadoAnalise: string | null;
  statusFila: StatusFila;
}

export interface EscopoPreview {
  competencia: string;
  tipo: string;
  departamento: { id: string | null; nome: string };
  responsavel: { id: string | null; nome: string };
  totalEmpresas: number;
  totalSemResponsavel: number;
  totalComDocumento: number;
  totalSemDocumento: number;
  totalAvisosCadastrais: number;
  solicitacoesEmCache: number;
  responsaveis: { id: string | null; nome: string; total: number }[];
  empresas: EscopoLinha[];
}

function normalizarDocumento(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

async function carregarEscopo(ctx: AppContext, filtro: EscopoFiltro) {
  const typeExternalId = await resolverTipoSolicitacao(ctx, filtro.tipo);

  let consulta = ctx.db
    .from("request")
    .select(
      "id, external_id, number, description, status, client_external_id, client_name, client_document, responsible_external_id, responsible_name, department_external_id, has_attachment, reference_month, finished_at",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("type_external_id", typeExternalId);

  if (filtro.revisaoCompetencia) {
    // Sem competência interpretável: fila de revisão, nunca descarte.
    consulta = consulta.is("reference_month", null);
  } else if (
    filtro.competenciaFim &&
    filtro.competenciaFim !== filtro.competencia
  ) {
    consulta = consulta
      .gte("reference_month", filtro.competencia)
      .lte("reference_month", filtro.competenciaFim);
  } else {
    consulta = consulta.eq("reference_month", filtro.competencia);
  }

  if (filtro.anexo === "COM_ANEXO")
    consulta = consulta.eq("has_attachment", true);
  if (filtro.anexo === "SEM_ANEXO")
    consulta = consulta.eq("has_attachment", false);

  const { data: solicitacoes, error } = await consulta;

  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível montar o escopo.",
      error.message,
    );

  const [usuarios, { data: departamentos }, clientes] = await Promise.all([
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
    carregarTodasAsLinhas<{
      document: string | null;
      tax_regime: string | null;
      responsible_name: string | null;
    }>(ctx, "pier_client", "document, tax_regime, responsible_name"),
  ]);

  const usuarioPorId = new Map(usuarios.map((u) => [u.external_id, u]));

  const deptoNome = new Map(
    (departamentos ?? []).map((d) => [d.external_id, d.name]),
  );
  // Ficha do cliente é complementar: usada só para regime e aviso cadastral.
  const fichaPorDoc = new Map(
    (clientes ?? []).map((c) => [normalizarDocumento(c.document), c]),
  );

  // Estado da análise interna (a última execução por solicitação).
  const idsSolicitacoes = (solicitacoes ?? []).map((s) => s.id);
  const analisePorRequest = new Map<
    string,
    { status: string; resultado: string | null }
  >();
  const comAnexoInterno = new Set<string>();
  if (idsSolicitacoes.length) {
    const [{ data: execucoes }, { data: anexos }] = await Promise.all([
      ctx.db
        .from("validation_execution")
        .select("request_id, status, result, created_at")
        .eq("organization_id", ctx.organizationId)
        .in("request_id", idsSolicitacoes)
        .order("created_at", { ascending: false }),
      ctx.db
        .from("request_attachment")
        .select("request_id")
        .eq("organization_id", ctx.organizationId)
        .in("request_id", idsSolicitacoes),
    ]);
    for (const e of execucoes ?? []) {
      if (!analisePorRequest.has(e.request_id))
        analisePorRequest.set(e.request_id, {
          status: e.status,
          resultado: e.result,
        });
    }
    for (const a of anexos ?? []) comAnexoInterno.add(a.request_id);
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
    const departamentoId =
      s.department_external_id ?? usuario?.department_external_id ?? null;
    const documentoDisponivel = comAnexoInterno.has(s.id);

    const statusFila: StatusFila = Boolean(s.finished_at)
      ? "HISTORICO"
      : statusAnalise === "FALHOU"
        ? "ERRO"
        : statusAnalise === "ANALISANDO"
          ? "ANALISANDO"
          : statusAnalise === "CONCLUIDA"
            ? analise?.resultado === "REPROVADO"
              ? "BLOQUEADA"
              : analise?.resultado === "REVISAO_HUMANA" ||
                  analise?.resultado === "COM_ALERTAS"
                ? "REVISAO_NECESSARIA"
                : "ANALISE_CONCLUIDA"
            : documentoDisponivel
              ? "PRONTO_PARA_ANALISE"
              : "AGUARDANDO_DOCUMENTO";

    const ficha =
      fichaPorDoc.get(normalizarDocumento(s.client_document)) ?? null;

    return {
      solicitacaoId: s.external_id,
      numero: s.number,
      clienteExternalId: s.client_external_id,
      clienteNome: s.client_name ?? "—",
      documento: s.client_document,
      regime: ficha?.tax_regime ?? null,
      departamentoId,
      departamentoNome: departamentoId
        ? (deptoNome.get(departamentoId) ?? null)
        : null,
      responsavelId: s.responsible_external_id,
      responsavelNome: s.responsible_name ?? usuario?.name ?? null,
      statusSolicitacao: s.status,
      // Apenas aviso: a ficha do cliente pode estar incompleta e isso nunca bloqueia a análise.
      avisoCadastral: !ficha
        ? "Cliente não encontrado no catálogo do PIER."
        : !ficha.responsible_name
          ? "Ficha do cliente sem responsável contábil."
          : null,
      competencia: s.reference_month,
      temAnexo: Boolean(s.has_attachment),
      documentoDisponivel,
      statusAnalise,
      resultadoAnalise: analise?.resultado ?? null,
      statusFila,
    };
  });

  // Escopo contábil restrito: só entram responsáveis dos departamentos de contabilidade.
  const contabeis = new Set(await departamentosContabeis(ctx));
  linhas = linhas.filter(
    (l) => l.departamentoId && contabeis.has(l.departamentoId),
  );

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

  if (filtro.statusFila)
    linhas = linhas.filter((l) => l.statusFila === filtro.statusFila);

  const busca = (filtro.busca ?? "").trim().toLowerCase();
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    linhas = linhas.filter(
      (l) =>
        l.clienteNome.toLowerCase().includes(busca) ||
        (digitos.length >= 3 &&
          normalizarDocumento(l.documento).includes(digitos)),
    );
  }

  linhas.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));

  const departamentoNome = filtro.departamentoId
    ? (deptoNome.get(filtro.departamentoId) ??
      `Departamento ${filtro.departamentoId}`)
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
  const { linhas, departamentoNome, responsavelNome, totalSolicitacoes } =
    await carregarEscopo(ctx, filtro);

  const porResponsavel = new Map<
    string,
    { id: string | null; nome: string; total: number }
  >();
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
    totalSemResponsavel: linhas.filter((l) => !l.responsavelId).length,
    totalComDocumento: linhas.filter((l) => l.documentoDisponivel).length,
    totalSemDocumento: linhas.filter((l) => !l.documentoDisponivel).length,
    totalAvisosCadastrais: linhas.filter((l) => Boolean(l.avisoCadastral))
      .length,
    solicitacoesEmCache: totalSolicitacoes,
    responsaveis: [...porResponsavel.values()].sort(
      (a, b) => b.total - a.total,
    ),
    empresas: linhas,
  };
}

export async function iniciarGestao(
  ctx: AppContext,
  filtro: EscopoFiltro & { idempotencyKey: string },
) {
  assertCanWrite(ctx);
  const { linhas, departamentoNome, responsavelNome } = await carregarEscopo(
    ctx,
    filtro,
  );
  if (!linhas.length)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Nenhuma empresa entra neste escopo. Ajuste os filtros.",
    );

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
    throw new AppError(
      "INESPERADO",
      "Não foi possível iniciar a gestão.",
      error?.message,
    );

  let concluidos = 0;
  let alertas = 0;
  let erros = 0;
  let ignorados = 0;

  // Nesta fase a gestão apenas REGISTRA o escopo operacional.
  // Nenhuma empresa é criada e nenhum closing_period é aberto: a solicitação do PIER
  // é a fonte operacional e a análise não depende de cadastro interno.
  for (const linha of linhas) {
    const semResponsavel = !linha.responsavelId;
    if (semResponsavel) alertas += 1;
    else concluidos += 1;

    const { error: itemError } = await ctx.db.from("batch_item").insert({
      organization_id: ctx.organizationId,
      batch_execution_id: execucao.id,
      company_id: null,
      status: semResponsavel ? "WARNING" : "COMPLETED",
      attempts: 1,
      message: semResponsavel
        ? `${linha.clienteNome}: solicitação sem responsável definido no PIER.`
        : `${linha.clienteNome}: solicitação ${linha.solicitacaoId}.`,
    });
    if (itemError) {
      erros += 1;
      if (semResponsavel) alertas -= 1;
      else concluidos -= 1;
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
    throw new AppError(
      "INESPERADO",
      "Não foi possível carregar as execuções.",
      error.message,
    );

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
    .select(
      "id, status, attempts, message, closing_period_id, company:company_id(id, name, document)",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("batch_execution_id", execucaoId);

  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível carregar a execução.",
      error.message,
    );

  return (itens ?? []).map((i) => {
    const empresa = i.company as unknown as {
      id: string;
      name: string;
      document: string | null;
    };
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
