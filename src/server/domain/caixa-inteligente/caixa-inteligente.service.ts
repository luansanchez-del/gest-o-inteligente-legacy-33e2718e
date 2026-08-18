import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import type { PierRequest, PierUser } from "../../integrations/pier/pier.types";
import { carregarUsuariosPier } from "../gestao/pier-user.repo";
import { solicitacaoFinalizadaPier } from "../gestao/status-pier";

export type CategoriaSolicitacao =
  | "BALANCETE"
  | "CONTABIL"
  | "FISCAL"
  | "FOLHA"
  | "FINANCEIRO"
  | "DOCUMENTO"
  | "ADMINISTRATIVO"
  | "OUTRO";

export type AcaoRecomendada =
  | "RESPONDER_FINALIZAR"
  | "RESPONDER_MANTER_ABERTA"
  | "ENCAMINHAR"
  | "REVISAO_HUMANA";

const TIPOS_INTERNOS = new Set(["colaborador", "gestor", "encarregado"]);

function normalizar(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extrairCompetencia(texto: string) {
  const match = texto.match(/(0[1-9]|1[0-2])[/-](20\d{2})/);
  return match ? `${match[2]}-${match[1]}` : null;
}

function classificar(texto: string): {
  categoria: CategoriaSolicitacao;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
} {
  const t = normalizar(texto);
  if (/balancete|balanco|razao|\bdre\b|demonstracao do resultado/.test(t))
    return { categoria: "BALANCETE", confianca: "ALTA" };
  if (/ecac|e-cac|darf|dctf|icms|iss|pis|cofins|irpj|csll|fiscal|tribut/.test(t))
    return { categoria: "FISCAL", confianca: "ALTA" };
  if (/folha|ferias|decimo terceiro|pro.?labore|rescis|admiss|esocial|e-social/.test(t))
    return { categoria: "FOLHA", confianca: "ALTA" };
  if (/pagamento|recebimento|financeiro|boleto|cobranca|extrato bancario|\bbanco\b|\bpix\b/.test(t))
    return { categoria: "FINANCEIRO", confianca: "MEDIA" };
  if (/lancamento|contabil|contabilidade|concili|fechamento/.test(t))
    return { categoria: "CONTABIL", confianca: "MEDIA" };
  if (/documento|arquivo|anexo|comprovante|certidao|relatorio/.test(t))
    return { categoria: "DOCUMENTO", confianca: "MEDIA" };
  if (/cadastro|contrato|assinatura|acesso|usuario|senha/.test(t))
    return { categoria: "ADMINISTRATIVO", confianca: "MEDIA" };
  return { categoria: "OUTRO", confianca: "BAIXA" };
}

function termosDaCategoria(categoria: CategoriaSolicitacao) {
  if (categoria === "FISCAL") return ["fiscal", "tribut", "darf", "ecac"];
  if (categoria === "FOLHA") return ["folha", "pessoal", "esocial", "ferias"];
  if (categoria === "FINANCEIRO") return ["financeiro", "pagamento", "cobranca"];
  if (categoria === "BALANCETE" || categoria === "CONTABIL")
    return ["contabil", "contabilidade", "balancete", "fechamento"];
  return [];
}

function chaveVinculo(ctx: AppContext) {
  return `pier.usuario.${ctx.userId}`;
}

function resumirUsuario(u: PierUser) {
  return {
    id: u.externalId,
    nome: u.name,
    email: u.email,
    login: u.login,
    departamentoId: u.departmentExternalId,
  };
}

async function usuariosAtivos(ctx: AppContext): Promise<PierUser[]> {
  const cache = await carregarUsuariosPier<{
    external_id: string;
    name: string;
    kind: string | null;
    login: string | null;
    email: string | null;
    status: string | null;
    department_external_id: string | null;
    raw: Record<string, unknown> | null;
  }>(
    ctx,
    "external_id, name, kind, login, email, status, department_external_id, raw",
  );

  const internos = cache
    .filter(
      (u) =>
        TIPOS_INTERNOS.has(normalizar(u.kind)) &&
        (!u.status || normalizar(u.status) === "ativo"),
    )
    .map<PierUser>((u) => ({
      externalId: u.external_id,
      name: u.name,
      kind: u.kind,
      login: u.login,
      email: u.email,
      status: u.status,
      departmentExternalId: u.department_external_id,
      raw: (u.raw ?? {}) as Record<string, unknown>,
    }));
  if (internos.length) return internos;

  return (await pierAdapter.listUsers({ status: "Ativo" })).filter((u) =>
    TIPOS_INTERNOS.has(normalizar(u.kind)),
  );
}

export async function obterVinculoPier(ctx: AppContext, input: { email?: string }) {
  const usuarios = await usuariosAtivos(ctx);
  const { data: setting } = await ctx.db
    .from("app_setting")
    .select("value")
    .eq("organization_id", ctx.organizationId)
    .eq("key", chaveVinculo(ctx))
    .maybeSingle();

  const configurado = (setting?.value ?? {}) as Record<string, unknown>;
  const idConfigurado =
    typeof configurado.externalId === "string" ? configurado.externalId : null;
  let usuario = idConfigurado
    ? usuarios.find((u) => u.externalId === idConfigurado) ?? null
    : null;

  if (!usuario && input.email) {
    const email = normalizar(input.email);
    usuario =
      usuarios.find(
        (u) => normalizar(u.email) === email || normalizar(u.login) === email,
      ) ?? null;
  }

  return {
    vinculado: Boolean(usuario),
    usuario: usuario ? resumirUsuario(usuario) : null,
    opcoes: usuarios
      .map(resumirUsuario)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

export async function vincularUsuarioPier(
  ctx: AppContext,
  input: { externalId: string },
) {
  assertCanWrite(ctx);
  const usuarios = await usuariosAtivos(ctx);
  const usuario = usuarios.find((u) => u.externalId === input.externalId);
  if (!usuario)
    throw new AppError("VALIDACAO", "Selecione um usuário ativo do PIER.");

  const key = chaveVinculo(ctx);
  const { data: existente } = await ctx.db
    .from("app_setting")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("key", key)
    .maybeSingle();
  const value = { externalId: usuario.externalId, nome: usuario.name } as never;
  const resultado = existente
    ? await ctx.db
        .from("app_setting")
        .update({ value })
        .eq("organization_id", ctx.organizationId)
        .eq("id", existente.id)
    : await ctx.db.from("app_setting").insert({
        organization_id: ctx.organizationId,
        key,
        value,
      });
  if (resultado.error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível salvar o vínculo com seu usuário do PIER.",
      resultado.error.message,
    );

  await audit(ctx, {
    action: "VINCULAR_USUARIO_PIER",
    entity: "app_setting",
    entityId: usuario.externalId,
    after: { usuarioPier: usuario.externalId, nome: usuario.name },
  });
  return resumirUsuario(usuario);
}

async function resolverUsuarioPier(ctx: AppContext, email?: string) {
  const vinculo = await obterVinculoPier(ctx, { email });
  if (!vinculo.usuario)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Vincule seu usuário do PIER antes de carregar a Caixa de Entrada.",
    );
  return vinculo.usuario;
}

async function gravarSolicitacoes(
  ctx: AppContext,
  solicitacoes: PierRequest[],
  departamentoId: string | null,
) {
  if (!solicitacoes.length) return 0;
  const agora = new Date().toISOString();
  let processados = 0;
  for (let inicio = 0; inicio < solicitacoes.length; inicio += 250) {
    const lote = solicitacoes.slice(inicio, inicio + 250);
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
        department_external_id: departamentoId,
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
        "Não foi possível atualizar sua Caixa de Entrada.",
        error.message,
      );
    processados += lote.length;
  }
  return processados;
}

export async function sincronizarMinhaCaixa(
  ctx: AppContext,
  input: { email?: string },
) {
  assertCanWrite(ctx);
  const usuario = await resolverUsuarioPier(ctx, input.email);

  // A Minha Caixa precisa refletir TODAS as solicitações atribuídas ao usuário,
  // independentemente do tipo (fechamento, e-mail, fiscal, financeiro etc.) e do
  // status operacional. Por isso a varredura usa "Todas" e o teto integral da
  // integração; somente depois filtramos pelo responsável e removemos finalizadas.
  const statusConsultado = "Todas";
  const maxPages = 200;
  const solicitacoes = await pierAdapter.listRequests({
    status: statusConsultado,
    maxPages,
  });

  const minhas = solicitacoes.filter(
    (s) =>
      s.responsibleExternalId === usuario.id &&
      !solicitacaoFinalizadaPier(s.status, s.finishedAt),
  );
  const processadas = await gravarSolicitacoes(
    ctx,
    minhas,
    usuario.departamentoId,
  );
  const possivelmenteParcial = solicitacoes.length >= maxPages * 30;

  await audit(ctx, {
    action: "SINCRONIZAR_CAIXA_INTELIGENTE",
    entity: "request",
    after: {
      usuarioPier: usuario.id,
      consultadas: solicitacoes.length,
      encontradas: minhas.length,
      processadas,
      statusConsultado,
      possivelmenteParcial,
    },
  });

  return {
    usuario: { id: usuario.id, nome: usuario.nome },
    consultadas: solicitacoes.length,
    encontradas: minhas.length,
    processadas,
    possivelmenteParcial,
  };
}

export async function listarMinhaCaixa(
  ctx: AppContext,
  input: { email?: string; busca?: string | null; categoria?: string | null },
) {
  const usuario = await resolverUsuarioPier(ctx, input.email);
  const { data, error } = await ctx.db
    .from("request")
    .select(
      "id, external_id, number, description, type_name, reference_month, status, responsible_name, client_name, client_document, requested_at, deadline_at, finished_at, has_attachment, synced_at",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("responsible_external_id", usuario.id)
    .order("deadline_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível carregar sua Caixa de Entrada.",
      error.message,
    );

  const hoje = new Date().toISOString().slice(0, 10);
  const busca = normalizar(input.busca);
  const linhas = (data ?? [])
    .filter((r) => !solicitacaoFinalizadaPier(r.status, r.finished_at))
    .map((r) => {
      const c = classificar(`${r.type_name ?? ""} ${r.description ?? ""}`);
      const prazo = r.deadline_at?.slice(0, 10) ?? null;
      return {
        id: r.id,
        externalId: r.external_id,
        numero: r.number,
        descricao: r.description,
        tipo: r.type_name,
        categoria: c.categoria,
        confianca: c.confianca,
        competencia: r.reference_month,
        status: r.status,
        clienteNome: r.client_name,
        documento: r.client_document,
        responsavelNome: r.responsible_name,
        solicitadaEm: r.requested_at,
        prazoEm: r.deadline_at,
        vencida: Boolean(prazo && prazo < hoje),
        venceHoje: prazo === hoje,
        possuiAnexo: r.has_attachment,
        sincronizadaEm: r.synced_at,
      };
    })
    .filter((r) => {
      if (input.categoria && input.categoria !== "TODAS" && r.categoria !== input.categoria)
        return false;
      if (!busca) return true;
      return normalizar(
        `${r.numero ?? ""} ${r.clienteNome ?? ""} ${r.documento ?? ""} ${r.descricao ?? ""} ${r.tipo ?? ""}`,
      ).includes(busca);
    });

  return {
    usuario: { id: usuario.id, nome: usuario.nome },
    total: linhas.length,
    vencidas: linhas.filter((l) => l.vencida).length,
    vencemHoje: linhas.filter((l) => l.venceHoje).length,
    comAnexo: linhas.filter((l) => l.possuiAnexo).length,
    linhas,
  };
}

async function localizarResponsavel(
  ctx: AppContext,
  solicitacao: PierRequest,
  categoria: CategoriaSolicitacao,
) {
  if (!solicitacao.clientDocument && !solicitacao.clientExternalId) return null;
  let query = ctx.db
    .from("request")
    .select(
      "type_name, description, responsible_external_id, responsible_name, department_external_id",
    )
    .eq("organization_id", ctx.organizationId)
    .not("responsible_external_id", "is", null)
    .limit(100);
  query = solicitacao.clientDocument
    ? query.eq("client_document", solicitacao.clientDocument)
    : query.eq("client_external_id", solicitacao.clientExternalId!);

  const { data } = await query;
  const termos = termosDaCategoria(categoria);
  const score = new Map<
    string,
    { id: string; nome: string | null; departamentoId: string | null; pontos: number }
  >();
  for (const r of data ?? []) {
    if (!r.responsible_external_id) continue;
    const texto = normalizar(`${r.type_name ?? ""} ${r.description ?? ""}`);
    let pontos = 1 + (termos.some((termo) => texto.includes(termo)) ? 4 : 0);
    if (r.responsible_external_id === solicitacao.responsibleExternalId) pontos -= 2;
    const atual = score.get(r.responsible_external_id);
    if (atual) atual.pontos += pontos;
    else
      score.set(r.responsible_external_id, {
        id: r.responsible_external_id,
        nome: r.responsible_name,
        departamentoId: r.department_external_id,
        pontos,
      });
  }
  const melhor = [...score.values()].sort((a, b) => b.pontos - a.pontos)[0];
  if (!melhor || melhor.pontos < 3) return null;

  let departamentoNome: string | null = null;
  if (melhor.departamentoId) {
    const { data: depto } = await ctx.db
      .from("pier_department")
      .select("name")
      .eq("organization_id", ctx.organizationId)
      .eq("external_id", melhor.departamentoId)
      .maybeSingle();
    departamentoNome = depto?.name ?? null;
  }
  return { ...melhor, departamentoNome };
}

async function localizarFechamento(
  ctx: AppContext,
  solicitacao: PierRequest,
  competencia: string | null,
) {
  if (!competencia || (!solicitacao.clientDocument && !solicitacao.clientExternalId))
    return null;
  let query = ctx.db
    .from("request")
    .select(
      "id, external_id, number, description, status, finished_at, responsible_name",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("reference_month", competencia)
    .eq("purpose", "ACCOUNTING_CLOSING")
    .limit(10);
  query = solicitacao.clientDocument
    ? query.eq("client_document", solicitacao.clientDocument)
    : query.eq("client_external_id", solicitacao.clientExternalId!);
  const { data } = await query;
  const fechamento = (data ?? [])[0];
  if (!fechamento) return null;

  const [processamentoQ, execucaoQ, anexosQ, instrucoesQ] = await Promise.all([
    ctx.db
      .from("request_processing")
      .select("outcome, reason, finalized_at, pier_status")
      .eq("organization_id", ctx.organizationId)
      .eq("request_id", fechamento.id)
      .maybeSingle(),
    ctx.db
      .from("validation_execution")
      .select("status, result, summary, finished_at")
      .eq("organization_id", ctx.organizationId)
      .eq("request_id", fechamento.id)
      .order("created_at", { ascending: false })
      .limit(1),
    ctx.db
      .from("request_attachment")
      .select("filename")
      .eq("organization_id", ctx.organizationId)
      .eq("request_id", fechamento.id),
    ctx.db
      .from("request_instruction")
      .select("text")
      .eq("organization_id", ctx.organizationId)
      .eq("request_id", fechamento.id),
  ]);
  const processamento = processamentoQ.data;
  const execucao = (execucaoQ.data ?? [])[0] ?? null;

  let arquivosPier: string[] = [];
  try {
    arquivosPier = (await pierAdapter.listFiles({ requestExternalId: fechamento.external_id }))
      .map((f) => f.name ?? "")
      .filter(Boolean);
  } catch {
    arquivosPier = [];
  }
  const nomes = [
    ...(anexosQ.data ?? []).map((a) => a.filename),
    ...arquivosPier,
  ].filter(Boolean);
  const balancetes = nomes.filter((n) => /balancete|balanco/i.test(n));

  // A solicitação genérica pode pedir "balancete conciliado". Isso NÃO prova conciliação.
  // Só usamos evidência proveniente do próprio fechamento/análise correspondente.
  const evidenciaFechamento = normalizar(
    `${fechamento.description ?? ""} ${(instrucoesQ.data ?? []).map((i) => i.text).join(" ")} ${JSON.stringify(execucao?.summary ?? {})} ${JSON.stringify(execucao?.result ?? {})}`,
  );
  const conciliacaoConfirmada =
    /conciliad|conciliacao concluida|conciliacao finalizada/.test(evidenciaFechamento);
  const concluido =
    solicitacaoFinalizadaPier(fechamento.status, fechamento.finished_at) ||
    Boolean(processamento?.finalized_at) ||
    /finaliz/.test(normalizar(processamento?.outcome));

  return {
    solicitacaoExternalId: fechamento.external_id,
    numero: fechamento.number,
    responsavelNome: fechamento.responsible_name,
    status: concluido
      ? "CONCLUIDO"
      : execucao?.status === "COMPLETED"
        ? "ANALISADO"
        : "EM_ANDAMENTO",
    balanceteLocalizado: balancetes.length > 0,
    balancetes,
    conciliacao: conciliacaoConfirmada
      ? "CONFIRMADA_POR_EVIDENCIA"
      : "NAO_COMPROVADA",
    processamento: processamento
      ? {
          resultado: processamento.outcome,
          motivo: processamento.reason,
          statusPier: processamento.pier_status,
        }
      : null,
  };
}

export async function analisarSolicitacao(
  ctx: AppContext,
  input: { email?: string; solicitacaoExternalId: string },
) {
  const usuario = await resolverUsuarioPier(ctx, input.email);
  const solicitacao = await pierAdapter.getRequest({
    requestExternalId: input.solicitacaoExternalId,
  });
  if (solicitacao.responsibleExternalId !== usuario.id)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Esta solicitação não está atribuída ao seu usuário no PIER neste momento.",
    );

  const [postagens, arquivos] = await Promise.all([
    pierAdapter.listPosts({ requestExternalId: solicitacao.externalId }).catch(() => []),
    pierAdapter.listFiles({ requestExternalId: solicitacao.externalId }).catch(() => []),
  ]);
  const texto = [
    solicitacao.typeName,
    solicitacao.description,
    ...postagens.map((p) => p.content),
    ...arquivos.map((a) => a.name),
  ]
    .filter(Boolean)
    .join("\n");
  const classificacao = classificar(texto);
  const competencia = solicitacao.referenceMonth ?? extrairCompetencia(texto);
  const [responsavelSugerido, fechamento] = await Promise.all([
    localizarResponsavel(ctx, solicitacao, classificacao.categoria),
    localizarFechamento(ctx, solicitacao, competencia),
  ]);

  const outroResponsavel =
    responsavelSugerido && responsavelSugerido.id !== usuario.id;
  let acao: AcaoRecomendada = "REVISAO_HUMANA";
  let motivo = "A solicitação precisa de revisão humana antes de qualquer ação no PIER.";
  if (
    fechamento?.status === "CONCLUIDO" &&
    fechamento.balanceteLocalizado &&
    fechamento.conciliacao === "CONFIRMADA_POR_EVIDENCIA"
  ) {
    acao = "RESPONDER_FINALIZAR";
    motivo =
      "O fechamento está concluído, o balancete foi localizado e há evidência do próprio fechamento confirmando conciliação.";
  } else if (outroResponsavel) {
    acao = "ENCAMINHAR";
    motivo = `O histórico do cliente indica maior aderência de ${responsavelSugerido.nome ?? "outro responsável"}${responsavelSugerido.departamentoNome ? ` (${responsavelSugerido.departamentoNome})` : ""}.`;
  } else if (classificacao.categoria !== "OUTRO") {
    acao = "RESPONDER_MANTER_ABERTA";
    motivo =
      "O assunto foi identificado, mas ainda não há evidência suficiente para considerar a demanda resolvida.";
  }

  let respostaSugerida = `Olá. Recebemos sua solicitação sobre ${solicitacao.description ?? solicitacao.typeName ?? "o assunto informado"}. Estamos verificando as informações necessárias e manteremos a solicitação em andamento até a conclusão.`;
  if (fechamento?.status === "CONCLUIDO" && fechamento.balanceteLocalizado) {
    respostaSugerida =
      fechamento.conciliacao === "CONFIRMADA_POR_EVIDENCIA"
        ? `Olá. Verificamos que o fechamento da competência ${competencia ?? "solicitada"} está concluído e localizamos o balancete com evidência de conciliação. O documento está disponível para envio. Seguimos à disposição.`
        : `Olá. Localizamos o balancete da competência ${competencia ?? "solicitada"} e o fechamento consta como concluído. Antes do envio, recomendamos confirmar a evidência de conciliação, que não foi localizada automaticamente.`;
  } else if (acao === "ENCAMINHAR") {
    respostaSugerida = `Olá. Recebemos sua solicitação sobre ${solicitacao.description ?? "o assunto informado"}. O tema está sendo direcionado internamente à área responsável para continuidade do atendimento.`;
  }

  return {
    solicitacao: {
      externalId: solicitacao.externalId,
      numero: solicitacao.number,
      clienteNome: solicitacao.clientName,
      documento: solicitacao.clientDocument,
      descricao: solicitacao.description,
      tipo: solicitacao.typeName,
      status: solicitacao.status,
      responsavelNome: solicitacao.responsibleName,
      competencia,
      prazoEm: solicitacao.deadlineAt,
    },
    leitura: {
      categoria: classificacao.categoria,
      confianca: classificacao.confianca,
      postagens: postagens.length,
      arquivos: arquivos.map((a) => a.name).filter(Boolean),
    },
    localizador: {
      responsavelSugerido: responsavelSugerido
        ? {
            id: responsavelSugerido.id,
            nome: responsavelSugerido.nome,
            departamento: responsavelSugerido.departamentoNome,
          }
        : null,
      fechamento,
      encaminhamentoDisponivel: false,
      motivoEncaminhamentoIndisponivel:
        "A API validada atualmente não possui endpoint confirmado para alterar responsável/departamento.",
    },
    recomendacao: { acao, motivo },
    respostaSugerida,
  };
}

export async function executarAcao(
  ctx: AppContext,
  input: {
    email?: string;
    solicitacaoExternalId: string;
    acao: "RESPONDER_MANTER_ABERTA" | "RESPONDER_FINALIZAR";
    mensagem: string;
    privada?: boolean;
  },
) {
  assertCanWrite(ctx);
  const usuario = await resolverUsuarioPier(ctx, input.email);
  const mensagem = input.mensagem.trim();
  if (mensagem.length < 10)
    throw new AppError("VALIDACAO", "Revise a resposta antes de publicar no PIER.");

  const atual = await pierAdapter.getRequest({
    requestExternalId: input.solicitacaoExternalId,
  });
  if (atual.responsibleExternalId !== usuario.id)
    throw new AppError(
      "REGRA_NEGOCIO",
      "A solicitação mudou de responsável no PIER. Atualize a Caixa de Entrada antes de responder.",
    );
  if (solicitacaoFinalizadaPier(atual.status, atual.finishedAt))
    throw new AppError("REGRA_NEGOCIO", "A solicitação já está finalizada no PIER.");

  const postagem = await pierAdapter.createPost({
    requestExternalId: atual.externalId,
    mensagem,
    privada: input.privada ?? false,
  });
  if (!postagem.externalId)
    throw new AppError(
      "INTEGRACAO_FALHA",
      "O PIER não confirmou o identificador da postagem. A solicitação não será finalizada automaticamente.",
    );

  let confirmado = atual;
  if (input.acao === "RESPONDER_FINALIZAR") {
    await pierAdapter.finalizeRequest({ requestExternalId: atual.externalId });
    confirmado = await pierAdapter.getRequest({ requestExternalId: atual.externalId });
    if (!solicitacaoFinalizadaPier(confirmado.status, confirmado.finishedAt))
      throw new AppError(
        "INTEGRACAO_FALHA",
        "A resposta foi publicada, mas o PIER não confirmou a finalização. A solicitação permanece para conferência.",
      );
  }

  await ctx.db
    .from("request")
    .update({
      status: confirmado.status,
      finished_at: confirmado.finishedAt,
      synced_at: new Date().toISOString(),
    })
    .eq("organization_id", ctx.organizationId)
    .eq("external_id", atual.externalId);

  await audit(ctx, {
    action: "CAIXA_INTELIGENTE_PIER",
    entity: "request",
    entityId: atual.externalId,
    correlationId: atual.externalId,
    after: {
      acao: input.acao,
      postagemId: postagem.externalId,
      privada: input.privada ?? false,
      finalizada: input.acao === "RESPONDER_FINALIZAR",
    },
  });

  return {
    postagemId: postagem.externalId,
    finalizada: input.acao === "RESPONDER_FINALIZAR",
    statusPier: confirmado.status,
  };
}
