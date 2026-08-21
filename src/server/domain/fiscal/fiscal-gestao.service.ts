import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { erroSeguro, mascararTexto } from "../../lib/mascara";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { carregarUsuariosPier } from "../gestao/pier-user.repo";
import { verificarRespostaPierPorExternalId } from "../gestao/resposta-pier.service";
import { solicitacaoFinalizadaPier } from "../gestao/status-pier";
import { validarManualFiscal } from "./fiscal-manual.service";

const TIPOS_INTERNOS = new Set(["colaborador", "gestor", "encarregado"]);
const DEPARTAMENTO_FISCAL_PADRAO = "16103";

function normalizar(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function finalizada(status: string | null, finishedAt?: string | null) {
  return solicitacaoFinalizadaPier(status, finishedAt ?? null);
}

export async function departamentosFiscais(ctx: AppContext): Promise<string[]> {
  const { data: setting } = await ctx.db
    .from("app_setting")
    .select("value")
    .eq("organization_id", ctx.organizationId)
    .eq("key", "pier.departamentos_fiscal")
    .maybeSingle();

  const valor = setting?.value as unknown;
  if (Array.isArray(valor)) {
    const ids = valor.map(String).map((v) => v.trim()).filter(Boolean);
    if (ids.length) return [...new Set(ids)];
  }

  const usuarios = await carregarUsuariosPier<{
    name: string;
    kind: string | null;
    department_external_id: string | null;
  }>(ctx, "name, kind, department_external_id");

  const encontrados = usuarios
    .filter(
      (u) =>
        TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase()) &&
        normalizar(u.name).includes("fiscal") &&
        Boolean(u.department_external_id),
    )
    .map((u) => u.department_external_id!)
    .filter(Boolean);

  return encontrados.length
    ? [...new Set(encontrados)]
    : [DEPARTAMENTO_FISCAL_PADRAO];
}

export async function listarEquipeFiscal(
  ctx: AppContext,
  input?: { incluirInativos?: boolean },
) {
  const departamentosIds = new Set(await departamentosFiscais(ctx));
  const [usuarios, { data: departamentos }] = await Promise.all([
    carregarUsuariosPier<{
      external_id: string;
      name: string;
      kind: string | null;
      status: string | null;
      department_external_id: string | null;
    }>(ctx, "external_id, name, kind, status, department_external_id"),
    ctx.db
      .from("pier_department")
      .select("external_id, name")
      .eq("organization_id", ctx.organizationId),
  ]);

  const equipe = usuarios
    .filter(
      (u) =>
        TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase()) &&
        Boolean(u.department_external_id && departamentosIds.has(u.department_external_id)) &&
        (input?.incluirInativos || normalizar(u.status) === "ativo"),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const nomePorId = new Map((departamentos ?? []).map((d) => [d.external_id, d.name]));
  const contagem = new Map<string, number>();
  for (const u of equipe) {
    if (!u.department_external_id) continue;
    contagem.set(u.department_external_id, (contagem.get(u.department_external_id) ?? 0) + 1);
  }

  return {
    departamentos: [...departamentosIds].map((id) => ({
      id,
      nome: nomePorId.get(id) ?? `Departamento Fiscal ${id}`,
      totalUsuarios: contagem.get(id) ?? 0,
    })),
    usuarios: equipe.map((u) => ({
      id: u.external_id,
      nome: u.name,
      status: u.status,
      departamentoId: u.department_external_id,
    })),
    integracao: await pierAdapter.status(),
  };
}

async function mapaDepartamentoUsuarios(ctx: AppContext) {
  const usuarios = await carregarUsuariosPier<{
    external_id: string;
    department_external_id: string | null;
  }>(ctx, "external_id, department_external_id");
  return new Map(usuarios.map((u) => [u.external_id, u.department_external_id]));
}

const COMPETENCIA = /^\d{4}-\d{2}$/;

/** Lista todas as competências AAAA-MM entre início e fim (inclusive). */
export function competenciasDoIntervalo(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = inicio.split("-").map(Number) as [number, number];
  const [anoFim, mesFim] = fim.split("-").map(Number) as [number, number];
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

export async function sincronizarSolicitacoesFiscais(
  ctx: AppContext,
  input: { competenciaInicio: string; competenciaFim: string; incluirFinalizadas?: boolean },
) {
  assertCanWrite(ctx);
  if (!COMPETENCIA.test(input.competenciaInicio) || !COMPETENCIA.test(input.competenciaFim))
    throw new AppError("VALIDACAO", "Informe as competências no formato AAAA-MM.");
  if (input.competenciaInicio > input.competenciaFim)
    throw new AppError("VALIDACAO", "A competência inicial deve ser anterior ou igual à final.");

  const meses = competenciasDoIntervalo(input.competenciaInicio, input.competenciaFim);
  if (meses.length > 24)
    throw new AppError("VALIDACAO", "Selecione um intervalo de no máximo 24 meses.");

  const departamentos = new Set(await departamentosFiscais(ctx));
  const deptoPorUsuario = await mapaDepartamentoUsuarios(ctx);
  const agora = new Date().toISOString();

  await audit(ctx, {
    action: "INICIAR_SINCRONIZACAO_FISCAL",
    entity: "request",
    after: {
      competenciaInicio: input.competenciaInicio,
      competenciaFim: input.competenciaFim,
      meses,
      departamentos: [...departamentos],
      incluirFinalizadas: Boolean(input.incluirFinalizadas),
    },
  });

  let recebidasDaBusca = 0;
  let doDepartamentoFiscal = 0;
  let competenciaInterpretada = 0;
  let competenciaAssumida = 0;
  let foraDoIntervalo = 0;
  type Candidato = Awaited<ReturnType<typeof pierAdapter.listRequests>>[number];
  const selecionadas = new Map<string, Candidato>();


  const doDepartamento = (s: Candidato) => {
    const departamento = s.responsibleExternalId
      ? deptoPorUsuario.get(s.responsibleExternalId) ?? null
      : null;
    return Boolean(departamento && departamentos.has(departamento));
  };

  try {
    for (const competencia of meses) {
      const [ano, mes] = competencia.split("-");
      const termoBusca = `${mes}/${ano}`;
      const lote = await pierAdapter.listRequests({
        status: "Todas",
        maxPages: 200,
        busca: termoBusca,
      });
      recebidasDaBusca += lote.length;

      for (const s of lote) {
        if (!doDepartamento(s)) continue;
        doDepartamentoFiscal += 1;
        if (s.referenceMonth && s.referenceMonth !== competencia) continue;
        if (!input.incluirFinalizadas && finalizada(s.status, s.finishedAt)) continue;
        if (selecionadas.has(s.externalId)) continue;

        if (s.referenceMonth === competencia) {
          competenciaInterpretada += 1;
          selecionadas.set(s.externalId, s);
        } else {
          competenciaAssumida += 1;
          selecionadas.set(s.externalId, {
            ...s,
            referenceMonth: competencia,
            raw: {
              ...s.raw,
              competenciaAssumidaDaBusca: true,
              termoBuscaCompetencia: termoBusca,
            },
          });
        }
      }
    }

    // Complemento: busca genérica. Só entra quem já tem competência dentro do intervalo.
    const genericas = await pierAdapter.listRequests({ status: "Todas", maxPages: 200 });
    recebidasDaBusca += genericas.length;
    for (const s of genericas) {
      if (selecionadas.has(s.externalId)) continue;
      if (!doDepartamento(s)) continue;
      doDepartamentoFiscal += 1;
      if (
        !s.referenceMonth ||
        s.referenceMonth < input.competenciaInicio ||
        s.referenceMonth > input.competenciaFim
      ) {
        foraDoIntervalo += 1;
        continue;
      }
      if (!input.incluirFinalizadas && finalizada(s.status, s.finishedAt)) continue;
      competenciaInterpretada += 1;
      selecionadas.set(s.externalId, s);
    }
  } catch (error) {
    await audit(ctx, {
      action: "FALHA_SINCRONIZACAO_FISCAL",
      entity: "request",
      after: {
        competenciaInicio: input.competenciaInicio,
        competenciaFim: input.competenciaFim,
        erro: mascararTexto(erroSeguro(error)),
      },
    });
    throw new AppError(
      "INTEGRACAO_FALHA",
      "Não foi possível carregar as solicitações do departamento fiscal no PIER.",
      erroSeguro(error),
    );
  }

  const fiscais = [...selecionadas.values()];

  for (let inicio = 0; inicio < fiscais.length; inicio += 250) {
    const lote = fiscais.slice(inicio, inicio + 250);
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
          ? deptoPorUsuario.get(s.responsibleExternalId) ?? null
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
        "Não foi possível guardar as solicitações fiscais.",
        error.message,
      );
  }

  const porTipo = new Map<string, number>();
  for (const s of fiscais) {
    const tipo = s.typeName ?? s.description ?? "Outras solicitações fiscais";
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
  }

  const diagnostico = {
    meses,
    recebidasDaBusca,
    doDepartamentoFiscal,
    competenciaInterpretada,
    competenciaAssumida,
    foraDoIntervalo,
    totalGravado: fiscais.length,
  };

  await audit(ctx, {
    action: "SINCRONIZAR_SOLICITACOES_FISCAIS",
    entity: "request",
    after: {
      competenciaInicio: input.competenciaInicio,
      competenciaFim: input.competenciaFim,
      departamentos: [...departamentos],
      total: fiscais.length,
      ...diagnostico,
      tipos: [...porTipo.entries()].map(([tipo, total]) => ({ tipo, total })),
    },
  });

  return {
    total: fiscais.length,
    competenciaInicio: input.competenciaInicio,
    competenciaFim: input.competenciaFim,
    departamentos: [...departamentos],
    ...diagnostico,
    tipos: [...porTipo.entries()]
      .map(([tipo, total]) => ({ tipo, total }))
      .sort((a, b) => b.total - a.total),
  };
}


export type StatusRespostaFiscal = "TODAS" | "SEM_RESPOSTA" | "RESPONDIDAS" | "NAO_VERIFICADAS";
export type StatusPierFiscal = "PENDENTES" | "FINALIZADAS" | "TODOS";

export async function listarGestaoFiscal(
  ctx: AppContext,
  input: {
    competenciaInicio: string;
    competenciaFim: string;
    responsavelId?: string | null;
    busca?: string | null;
    anexo?: "COM_ANEXO" | "SEM_ANEXO" | null;
    statusPier?: StatusPierFiscal | null;
    statusResposta?: StatusRespostaFiscal | null;
  },
) {
  const inicio = input.competenciaInicio;
  const fim = input.competenciaFim < inicio ? inicio : input.competenciaFim;
  const departamentos = await departamentosFiscais(ctx);
  let consulta = ctx.db
    .from("request")
    .select(
      "id,external_id,number,description,type_name,status,reference_month,responsible_external_id,responsible_name,department_external_id,client_name,client_document,has_attachment,deadline_at,finished_at",
    )
    .eq("organization_id", ctx.organizationId)
    .gte("reference_month", inicio)
    .lte("reference_month", fim)
    .in("department_external_id", departamentos);


  if (input.responsavelId) consulta = consulta.eq("responsible_external_id", input.responsavelId);
  if (input.anexo === "COM_ANEXO") consulta = consulta.eq("has_attachment", true);
  if (input.anexo === "SEM_ANEXO") consulta = consulta.eq("has_attachment", false);

  const { data: requests, error } = await consulta;
  if (error)
    throw new AppError("INESPERADO", "Não foi possível montar a Gestão Fiscal.", error.message);

  const ids = (requests ?? []).map((r) => r.id);
  const [processamentos, respostas] = await Promise.all([
    ids.length
      ? ctx.db
          .from("request_processing")
          .select("request_id,outcome,reason,updated_at")
          .eq("organization_id", ctx.organizationId)
          .in("request_id", ids)
      : Promise.resolve({ data: [], error: null } as any),
    ids.length
      ? (ctx.db as any)
          .from("request_response_state")
          .select("request_id,status,author_name,posted_at,checked_at")
          .eq("organization_id", ctx.organizationId)
          .in("request_id", ids)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const procPorId = new Map((processamentos.data ?? []).map((p: any) => [p.request_id, p]));
  const respostaPorId = new Map((respostas.data ?? []).map((r: any) => [r.request_id, r]));
  const busca = normalizar(input.busca);

  let linhas = (requests ?? []).map((r) => {
    const proc = procPorId.get(r.id) as any;
    const resposta = respostaPorId.get(r.id) as any;
    const encerrada = finalizada(r.status, r.finished_at);
    const situacao = encerrada
      ? "FINALIZADA"
      : proc?.outcome === "EM_REVISAO"
        ? "REVISAO_NECESSARIA"
        : proc?.outcome === "ERRO"
          ? "ERRO"
          : proc?.outcome === "PENDENTE"
            ? "ANALISADA"
            : "A_VALIDAR";
    return {
      solicitacaoId: r.external_id,
      numero: r.number,
      clienteNome: r.client_name ?? "—",
      documento: r.client_document,
      assunto: r.type_name ?? r.description ?? "Solicitação fiscal",
      descricao: r.description,
      competencia: r.reference_month,
      responsavelId: r.responsible_external_id,
      responsavelNome: r.responsible_name,
      statusPier: r.status,
      temAnexo: Boolean(r.has_attachment),
      prazoEm: r.deadline_at,
      situacao,
      motivo: proc?.reason ?? null,
      statusResposta: resposta?.status ?? "NAO_VERIFICADA",
      respostaAutor: resposta?.author_name ?? null,
      respostaEm: resposta?.posted_at ?? null,
      respostaVerificadaEm: resposta?.checked_at ?? null,
      finalizadaEm: r.finished_at,
    };
  });

  if (input.statusPier === "PENDENTES") linhas = linhas.filter((l) => l.situacao !== "FINALIZADA");
  if (input.statusPier === "FINALIZADAS") linhas = linhas.filter((l) => l.situacao === "FINALIZADA");
  if (input.statusResposta === "SEM_RESPOSTA") linhas = linhas.filter((l) => l.statusResposta === "NAO_RESPONDIDA");
  if (input.statusResposta === "RESPONDIDAS") linhas = linhas.filter((l) => l.statusResposta === "RESPONDIDA");
  if (input.statusResposta === "NAO_VERIFICADAS") linhas = linhas.filter((l) => l.statusResposta === "NAO_VERIFICADA");
  if (busca)
    linhas = linhas.filter((l) => normalizar(`${l.clienteNome} ${l.documento ?? ""} ${l.assunto}`).includes(busca));

  linhas.sort(
    (a, b) =>
      (b.competencia ?? "").localeCompare(a.competencia ?? "") ||
      a.clienteNome.localeCompare(b.clienteNome, "pt-BR"),
  );
  return {
    competenciaInicio: inicio,
    competenciaFim: fim,

    total: linhas.length,
    abertas: linhas.filter((l) => l.situacao !== "FINALIZADA").length,
    comAnexo: linhas.filter((l) => l.temAnexo).length,
    semAnexo: linhas.filter((l) => !l.temAnexo).length,
    respondidas: linhas.filter((l) => l.statusResposta === "RESPONDIDA").length,
    naoVerificadas: linhas.filter((l) => l.statusResposta === "NAO_VERIFICADA").length,
    revisao: linhas.filter((l) => l.situacao === "REVISAO_NECESSARIA").length,
    analisadas: linhas.filter((l) => l.situacao === "ANALISADA").length,
    linhas,
  };
}

async function carregarRegime(ctx: AppContext, documento: string | null) {
  if (!documento) return null;
  const { data } = await ctx.db
    .from("pier_client")
    .select("tax_regime")
    .eq("organization_id", ctx.organizationId)
    .eq("document", documento)
    .limit(1)
    .maybeSingle();
  return data?.tax_regime ?? null;
}

export async function validarSolicitacaoFiscal(
  ctx: AppContext,
  input: { solicitacaoExternalId: string },
) {
  assertCanWrite(ctx);
  const departamentos = new Set(await departamentosFiscais(ctx));
  const { data: request, error } = await ctx.db
    .from("request")
    .select(
      "id,external_id,number,description,type_name,status,reference_month,department_external_id,client_name,client_document,finished_at",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("external_id", input.solicitacaoExternalId)
    .maybeSingle();
  if (error || !request)
    throw new AppError("VALIDACAO", "Solicitação fiscal não encontrada.", error?.message);
  if (!request.department_external_id || !departamentos.has(request.department_external_id))
    throw new AppError("REGRA_NEGOCIO", "A solicitação não pertence ao departamento fiscal configurado.");

  let detalhe;
  try {
    detalhe = await pierAdapter.getRequest({ requestExternalId: request.external_id });
  } catch (e) {
    throw new AppError("INTEGRACAO_FALHA", "Não foi possível conferir o estado atual no PIER.", erroSeguro(e));
  }
  if (finalizada(detalhe.status, detalhe.finishedAt))
    return {
      solicitacaoExternalId: request.external_id,
      numero: request.number,
      clienteNome: request.client_name,
      statusPier: detalhe.status,
      finalizadaEm: detalhe.finishedAt,
      grupo: "—",
      grupoRotulo: "Finalizada no PIER",
      situacao: "FINALIZADA" as const,
      regime: await carregarRegime(ctx, request.client_document),
      evidenciasEncontradas: [],
      achados: [],
      totalImpedimentos: 0,
      totalAlertas: 0,
      respostaSugerida: "A solicitação já está finalizada no PIER. Nenhuma nova ação é necessária.",
    };

  const [arquivos, postagens, regime] = await Promise.all([
    pierAdapter.listFiles({ requestExternalId: request.external_id }),
    pierAdapter.listPosts({ requestExternalId: request.external_id }).catch(() => []),
    carregarRegime(ctx, request.client_document),
  ]);

  const resultado = validarManualFiscal({
    tipoNome: request.type_name,
    descricao: request.description,
    regime,
    competencia: detalhe.referenceMonth ?? request.reference_month,
    evidencias: arquivos.map((a) => ({ nome: a.name ?? a.externalId, categoria: a.category })),
    textoPostagens: postagens.map((p) => p.content ?? "").join("\n"),
  });

  const outcome = resultado.situacao === "APROVADA" ? "PENDENTE" : "EM_REVISAO";
  const motivo =
    resultado.situacao === "APROVADA"
      ? `Fiscal ${resultado.grupoRotulo}: checklist documental atendido; aguardando decisão humana.`
      : `Fiscal ${resultado.grupoRotulo}: ${resultado.totalImpedimentos} impedimento(s) e ${resultado.totalAlertas} alerta(s).`;

  await ctx.db.from("request_processing").upsert(
    {
      organization_id: ctx.organizationId,
      request_id: request.id,
      outcome,
      reason: motivo,
      pier_status: detalhe.status,
      processed_by: ctx.userId,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "organization_id,request_id" },
  );

  await audit(ctx, {
    action: "VALIDAR_FISCAL_MANUAL",
    entity: "request",
    entityId: request.id,
    correlationId: request.external_id,
    after: {
      grupo: resultado.grupo,
      situacao: resultado.situacao,
      regime,
      competencia: detalhe.referenceMonth ?? request.reference_month,
      totalImpedimentos: resultado.totalImpedimentos,
      totalAlertas: resultado.totalAlertas,
      evidencias: resultado.evidenciasEncontradas,
      achados: resultado.achados,
    },
  });

  return {
    solicitacaoExternalId: request.external_id,
    numero: request.number,
    clienteNome: request.client_name,
    statusPier: detalhe.status,
    finalizadaEm: null,
    ...resultado,
  };
}

export async function validarLoteFiscal(
  ctx: AppContext,
  input: { solicitacoes: string[] },
) {
  const ids = [...new Set(input.solicitacoes.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
  const resultados: Array<any> = [];
  for (const id of ids) {
    try {
      resultados.push({ status: "SUCESSO", resultado: await validarSolicitacaoFiscal(ctx, { solicitacaoExternalId: id }) });
    } catch (error) {
      resultados.push({ status: "ERRO", solicitacaoExternalId: id, erro: erroSeguro(error) });
    }
  }
  return {
    total: resultados.length,
    aprovadas: resultados.filter((r) => r.status === "SUCESSO" && r.resultado.situacao === "APROVADA").length,
    ressalvas: resultados.filter((r) => r.status === "SUCESSO" && r.resultado.situacao === "COM_RESSALVAS").length,
    bloqueadas: resultados.filter((r) => r.status === "SUCESSO" && r.resultado.situacao === "BLOQUEADA").length,
    naoMapeadas: resultados.filter((r) => r.status === "SUCESSO" && r.resultado.situacao === "NAO_MAPEADA").length,
    erros: resultados.filter((r) => r.status === "ERRO").length,
    resultados,
  };
}

export async function executarDecisaoFiscal(
  ctx: AppContext,
  input: {
    solicitacaoExternalId: string;
    mensagem: string;
    finalizar: boolean;
    justificativa?: string | null;
  },
) {
  assertCanWrite(ctx);
  const analise = await validarSolicitacaoFiscal(ctx, {
    solicitacaoExternalId: input.solicitacaoExternalId,
  });
  if (analise.situacao === "FINALIZADA")
    return { situacao: "JA_FINALIZADA" as const, mensagem: analise.respostaSugerida, postagemId: null, finalizadaEm: analise.finalizadaEm };
  if (input.finalizar && ["BLOQUEADA", "NAO_MAPEADA"].includes(analise.situacao))
    throw new AppError("REGRA_NEGOCIO", "A solicitação fiscal possui impedimento ou assunto não mapeado e não pode ser finalizada.");

  const justificativa = mascararTexto(input.justificativa ?? "").trim().slice(0, 2000);
  if (input.finalizar && analise.situacao === "COM_RESSALVAS" && justificativa.length < 10)
    throw new AppError("VALIDACAO", "A aprovação com ressalvas exige justificativa técnica.");

  const respostaExistente = await verificarRespostaPierPorExternalId(ctx, input.solicitacaoExternalId);
  if (respostaExistente.status === "RESPONDIDA")
    return {
      situacao: "JA_RESPONDIDA" as const,
      mensagem: respostaExistente.authorName
        ? `A solicitação já foi respondida no PIER por ${respostaExistente.authorName}. Nenhuma nova postagem foi criada.`
        : "A solicitação já foi respondida no PIER. Nenhuma nova postagem foi criada.",
      postagemId: respostaExistente.postExternalId,
      finalizadaEm: null,
    };

  const mensagem = mascararTexto(input.mensagem || analise.respostaSugerida).trim().slice(0, 8000);
  if (mensagem.length < 10)
    throw new AppError("VALIDACAO", "Revise a resposta antes de publicar no PIER.");
  const mensagemFinal = justificativa
    ? `${mensagem}\n\nJustificativa técnica:\n${justificativa}`.slice(0, 9000)
    : mensagem;

  let postagem;
  try {
    postagem = await pierAdapter.createPost({
      requestExternalId: input.solicitacaoExternalId,
      mensagem: mensagemFinal,
      privada: true,
    });
  } catch (error) {
    throw new AppError("INTEGRACAO_FALHA", "Não foi possível publicar a resposta fiscal no PIER.", erroSeguro(error));
  }
  if (!postagem.externalId)
    throw new AppError("INTEGRACAO_FALHA", "O PIER não confirmou a postagem. A solicitação permaneceu aberta.");

  if (!input.finalizar)
    return {
      situacao: "RESPONDIDA" as const,
      mensagem: "Resposta fiscal publicada no PIER. A solicitação permaneceu aberta.",
      postagemId: postagem.externalId,
      finalizadaEm: null,
    };

  try {
    await pierAdapter.finalizeRequest({ requestExternalId: input.solicitacaoExternalId });
    const confirmacao = await pierAdapter.getRequest({ requestExternalId: input.solicitacaoExternalId });
    if (!finalizada(confirmacao.status, confirmacao.finishedAt))
      throw new AppError("INTEGRACAO_FALHA", "O PIER ainda não confirmou a finalização.");

    await ctx.db
      .from("request")
      .update({ status: confirmacao.status, finished_at: confirmacao.finishedAt ?? new Date().toISOString() })
      .eq("organization_id", ctx.organizationId)
      .eq("external_id", input.solicitacaoExternalId);

    return {
      situacao: "FINALIZADA" as const,
      mensagem: "Resposta fiscal publicada e finalização confirmada no PIER.",
      postagemId: postagem.externalId,
      finalizadaEm: confirmacao.finishedAt ?? new Date().toISOString(),
    };
  } catch (error) {
    throw new AppError(
      "INTEGRACAO_FALHA",
      "A resposta foi publicada, mas a finalização não foi confirmada. Não envie a resposta novamente.",
      erroSeguro(error),
    );
  }
}
