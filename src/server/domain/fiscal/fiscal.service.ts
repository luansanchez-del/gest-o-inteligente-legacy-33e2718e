import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { carregarTodasAsLinhas, carregarUsuariosPier } from "../gestao/pier-user.repo";
import {
  avaliarChecklistFiscal,
  classificarCategoriaFiscal,
  classificarRegimeFiscal,
  ROTULOS_CATEGORIA_FISCAL,
  type CategoriaFiscal,
} from "./fiscal-manual";

export const DEPARTAMENTOS_FISCAIS_NOMES = [
  "TRIBUTARIO LEGACY",
  "TRIBUTARIO BPO",
];
const DEPARTAMENTOS_FISCAIS_PADRAO = ["9624", "16103"];
const TIPOS_INTERNOS = new Set(["colaborador", "gestor", "encarregado"]);

export type StatusPierFiscal = "PENDENTES" | "FINALIZADAS" | "TODOS";
export type StatusRespostaFiscal =
  | "TODAS"
  | "SEM_RESPOSTA"
  | "RESPONDIDAS"
  | "NAO_VERIFICADAS";
export type StatusValidacaoFiscal =
  | "TODOS"
  | "NAO_VALIDADA"
  | "DOCUMENTOS_OK_REVISAR"
  | "BLOQUEADA"
  | "REVISAO_HUMANA"
  | "ERRO";

export interface FiltroGestaoFiscal {
  competencia: string;
  competenciaFim?: string | null;
  revisaoCompetencia?: boolean;
  departamentoId?: string | null;
  responsavelId?: string | null;
  categoria?: CategoriaFiscal | "TODAS" | null;
  statusPier?: StatusPierFiscal | null;
  statusResposta?: StatusRespostaFiscal | null;
  statusValidacao?: StatusValidacaoFiscal | null;
  anexo?: "COM_ANEXO" | "SEM_ANEXO" | null;
  busca?: string | null;
}

function normalizar(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function doc(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function finalizada(status: string | null, finishedAt: string | null) {
  return Boolean(finishedAt) || /finaliz|conclu|encerr/i.test(status ?? "");
}

export async function departamentosFiscais(ctx: AppContext): Promise<string[]> {
  const { data } = await ctx.db
    .from("pier_department")
    .select("external_id, name")
    .eq("organization_id", ctx.organizationId);

  const encontrados = (data ?? [])
    .filter((d) =>
      DEPARTAMENTOS_FISCAIS_NOMES.includes((d.name ?? "").trim().toUpperCase()),
    )
    .map((d) => d.external_id);

  return encontrados.length ? encontrados : DEPARTAMENTOS_FISCAIS_PADRAO;
}

async function ambienteFiscal(ctx: AppContext) {
  const departamentos = new Set(await departamentosFiscais(ctx));
  const usuarios = await carregarUsuariosPier<{
    external_id: string;
    name: string;
    kind: string | null;
    status: string | null;
    department_external_id: string | null;
  }>(ctx, "external_id, name, kind, status, department_external_id");

  const internos = usuarios.filter(
    (u) =>
      TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase()) &&
      Boolean(u.department_external_id && departamentos.has(u.department_external_id)),
  );
  const departamentoPorUsuario = new Map(
    internos.map((u) => [u.external_id, u.department_external_id!]),
  );
  return { departamentos, usuarios: internos, departamentoPorUsuario };
}

export async function listarEquipeFiscal(ctx: AppContext) {
  const amb = await ambienteFiscal(ctx);
  const { data: departamentos } = await ctx.db
    .from("pier_department")
    .select("external_id, name")
    .eq("organization_id", ctx.organizationId)
    .in("external_id", [...amb.departamentos]);

  const contagem = new Map<string, number>();
  for (const u of amb.usuarios) {
    if ((u.status ?? "").toLowerCase() !== "ativo") continue;
    if (!u.department_external_id) continue;
    contagem.set(
      u.department_external_id,
      (contagem.get(u.department_external_id) ?? 0) + 1,
    );
  }

  return {
    departamentos: (departamentos ?? [])
      .map((d) => ({
        id: d.external_id,
        nome: d.name,
        totalUsuarios: contagem.get(d.external_id) ?? 0,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    usuarios: amb.usuarios
      .filter((u) => (u.status ?? "").toLowerCase() === "ativo")
      .map((u) => ({
        id: u.external_id,
        nome: u.name,
        departamentoId: u.department_external_id,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    integracao: await pierAdapter.status(),
  };
}

/**
 * Sincroniza TODAS as solicitações cujo responsável atual pertence ao Tributário
 * Legacy/BPO. Não presume IDs de tipos de solicitação: o recorte é pelo departamento.
 */
export async function sincronizarSolicitacoesFiscais(
  ctx: AppContext,
  input?: { statusPier?: StatusPierFiscal },
) {
  assertCanWrite(ctx);
  const amb = await ambienteFiscal(ctx);
  const statusPier = input?.statusPier ?? "PENDENTES";
  const todas = await pierAdapter.listRequests({ status: "Todas", maxPages: 200 });

  let fiscais = todas
    .map((s) => ({
      solicitacao: s,
      departamentoId: s.responsibleExternalId
        ? amb.departamentoPorUsuario.get(s.responsibleExternalId) ?? null
        : null,
    }))
    .filter((item) => item.departamentoId && amb.departamentos.has(item.departamentoId));

  if (statusPier === "PENDENTES")
    fiscais = fiscais.filter(
      ({ solicitacao }) => !finalizada(solicitacao.status, solicitacao.finishedAt),
    );
  if (statusPier === "FINALIZADAS")
    fiscais = fiscais.filter(({ solicitacao }) =>
      finalizada(solicitacao.status, solicitacao.finishedAt),
    );

  const agora = new Date().toISOString();
  let processados = 0;
  for (let inicio = 0; inicio < fiscais.length; inicio += 250) {
    const lote = fiscais.slice(inicio, inicio + 250);
    const { error } = await ctx.db.from("request").upsert(
      lote.map(({ solicitacao: s, departamentoId }) => ({
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
        "Não foi possível guardar as solicitações do departamento fiscal.",
        error.message,
      );
    processados += lote.length;
  }

  await audit(ctx, {
    action: "SINCRONIZAR_GESTAO_FISCAL",
    entity: "request",
    after: {
      statusPier,
      varridasNoPier: todas.length,
      fiscaisLocalizadas: fiscais.length,
      processados,
      departamentos: [...amb.departamentos],
    },
  });

  return {
    varridasNoPier: todas.length,
    fiscaisLocalizadas: fiscais.length,
    processados,
  };
}

export async function montarPainelFiscal(ctx: AppContext, filtro: FiltroGestaoFiscal) {
  const amb = await ambienteFiscal(ctx);
  let consulta = ctx.db
    .from("request")
    .select(
      "id, external_id, number, description, type_name, type_external_id, purpose, status, client_external_id, client_name, client_document, responsible_external_id, responsible_name, department_external_id, has_attachment, reference_month, deadline_at, finished_at, synced_at",
    )
    .eq("organization_id", ctx.organizationId)
    .in("department_external_id", [...amb.departamentos]);

  if (filtro.revisaoCompetencia) consulta = consulta.is("reference_month", null);
  else if (filtro.competenciaFim && filtro.competenciaFim !== filtro.competencia)
    consulta = consulta
      .gte("reference_month", filtro.competencia)
      .lte("reference_month", filtro.competenciaFim);
  else consulta = consulta.eq("reference_month", filtro.competencia);

  if (filtro.departamentoId)
    consulta = consulta.eq("department_external_id", filtro.departamentoId);
  if (filtro.responsavelId)
    consulta = consulta.eq("responsible_external_id", filtro.responsavelId);
  if (filtro.anexo === "COM_ANEXO") consulta = consulta.eq("has_attachment", true);
  if (filtro.anexo === "SEM_ANEXO") consulta = consulta.eq("has_attachment", false);

  const { data: requests, error } = await consulta;
  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível montar a Gestão Fiscal.",
      error.message,
    );

  const ids = (requests ?? []).map((r) => r.id);
  const [clientes, validacoes, respostas, departamentos] = await Promise.all([
    carregarTodasAsLinhas<{
      document: string | null;
      tax_regime: string | null;
    }>(ctx, "pier_client", "document, tax_regime"),
    ids.length
      ? (ctx.db as any)
          .from("fiscal_validation_state")
          .select(
            "request_id,status,category,tax_regime,summary,details,checked_at",
          )
          .eq("organization_id", ctx.organizationId)
          .in("request_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? (ctx.db as any)
          .from("request_response_state")
          .select("request_id,status,author_name,posted_at,checked_at")
          .eq("organization_id", ctx.organizationId)
          .in("request_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ctx.db
      .from("pier_department")
      .select("external_id,name")
      .eq("organization_id", ctx.organizationId)
      .in("external_id", [...amb.departamentos]),
  ]);

  if ((validacoes as any).error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível carregar as validações fiscais.",
      (validacoes as any).error.message,
    );
  if ((respostas as any).error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível carregar os status de resposta.",
      (respostas as any).error.message,
    );

  const regimePorDoc = new Map(
    clientes.map((c) => [doc(c.document), c.tax_regime]),
  );
  const validacaoPorId = new Map(
    ((validacoes as any).data ?? []).map((v: any) => [v.request_id, v]),
  );
  const respostaPorId = new Map(
    ((respostas as any).data ?? []).map((r: any) => [r.request_id, r]),
  );
  const departamentoNome = new Map(
    (departamentos.data ?? []).map((d) => [d.external_id, d.name]),
  );

  let linhas = (requests ?? []).map((r) => {
    const taxRegime = regimePorDoc.get(doc(r.client_document)) ?? null;
    const categoria = classificarCategoriaFiscal({
      description: r.description,
      typeName: r.type_name,
    });
    const validacao = validacaoPorId.get(r.id) as any;
    const resposta = respostaPorId.get(r.id) as any;
    const statusResposta = resposta?.status ?? "NAO_VERIFICADA";
    const statusValidacao = validacao?.status ?? "NAO_VALIDADA";
    return {
      solicitacaoId: r.external_id,
      requestId: r.id,
      numero: r.number,
      descricao: r.description,
      tipoNome: r.type_name,
      tipoId: r.type_external_id,
      clienteNome: r.client_name ?? "—",
      clienteDocumento: r.client_document,
      competencia: r.reference_month,
      statusPier: r.status,
      finalizadaEm: r.finished_at,
      prazoEm: r.deadline_at,
      responsavelId: r.responsible_external_id,
      responsavelNome: r.responsible_name,
      departamentoId: r.department_external_id,
      departamentoNome: r.department_external_id
        ? departamentoNome.get(r.department_external_id) ?? r.department_external_id
        : null,
      temAnexo: Boolean(r.has_attachment),
      taxRegime,
      regimeManual: classificarRegimeFiscal(taxRegime),
      categoria,
      categoriaRotulo: ROTULOS_CATEGORIA_FISCAL[categoria],
      statusValidacao,
      resumoValidacao: validacao?.summary ?? null,
      checklist: validacao?.details?.checklist ?? [],
      validadaEm: validacao?.checked_at ?? null,
      statusResposta,
      jaRespondida: statusResposta === "RESPONDIDA",
      respostaAutor: resposta?.author_name ?? null,
      respostaEm: resposta?.posted_at ?? null,
      respostaVerificadaEm: resposta?.checked_at ?? null,
      sincronizadaEm: r.synced_at,
    };
  });

  if (filtro.statusPier === "PENDENTES")
    linhas = linhas.filter((l) => !finalizada(l.statusPier, l.finalizadaEm));
  if (filtro.statusPier === "FINALIZADAS")
    linhas = linhas.filter((l) => finalizada(l.statusPier, l.finalizadaEm));
  if (filtro.categoria && filtro.categoria !== "TODAS")
    linhas = linhas.filter((l) => l.categoria === filtro.categoria);
  if (filtro.statusValidacao && filtro.statusValidacao !== "TODOS")
    linhas = linhas.filter((l) => l.statusValidacao === filtro.statusValidacao);
  if (filtro.statusResposta === "SEM_RESPOSTA")
    linhas = linhas.filter((l) => l.statusResposta === "NAO_RESPONDIDA");
  if (filtro.statusResposta === "RESPONDIDAS")
    linhas = linhas.filter((l) => l.statusResposta === "RESPONDIDA");
  if (filtro.statusResposta === "NAO_VERIFICADAS")
    linhas = linhas.filter((l) => l.statusResposta === "NAO_VERIFICADA");

  const busca = normalizar(filtro.busca);
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    linhas = linhas.filter(
      (l) =>
        normalizar(l.clienteNome).includes(busca) ||
        normalizar(l.descricao).includes(busca) ||
        normalizar(l.responsavelNome).includes(busca) ||
        (digitos.length >= 3 && doc(l.clienteDocumento).includes(digitos)),
    );
  }

  linhas.sort((a, b) => {
    const resp = (a.responsavelNome ?? "").localeCompare(
      b.responsavelNome ?? "",
      "pt-BR",
    );
    return resp || a.clienteNome.localeCompare(b.clienteNome, "pt-BR");
  });

  const contar = (status: string) =>
    linhas.filter((l) => l.statusValidacao === status).length;

  return {
    competencia: filtro.competencia,
    total: linhas.length,
    totais: {
      naoValidadas: contar("NAO_VALIDADA"),
      documentosOkRevisar: contar("DOCUMENTOS_OK_REVISAR"),
      bloqueadas: contar("BLOQUEADA"),
      revisaoHumana: contar("REVISAO_HUMANA"),
      erros: contar("ERRO"),
      comAnexo: linhas.filter((l) => l.temAnexo).length,
      semAnexo: linhas.filter((l) => !l.temAnexo).length,
      respondidas: linhas.filter((l) => l.jaRespondida).length,
      naoVerificadasResposta: linhas.filter(
        (l) => l.statusResposta === "NAO_VERIFICADA",
      ).length,
    },
    linhas,
  };
}

export async function validarSolicitacoesFiscais(
  ctx: AppContext,
  input: { solicitacoes: string[] },
) {
  assertCanWrite(ctx);
  const ids = [...new Set(input.solicitacoes.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    100,
  );
  if (!ids.length)
    throw new AppError("VALIDACAO", "Selecione ao menos uma solicitação fiscal.");

  const amb = await ambienteFiscal(ctx);
  const { data: requests, error } = await ctx.db
    .from("request")
    .select(
      "id,external_id,description,type_name,status,finished_at,client_document,client_name,responsible_external_id,department_external_id",
    )
    .eq("organization_id", ctx.organizationId)
    .in("external_id", ids);
  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível localizar as solicitações fiscais.",
      error.message,
    );

  const clientes = await carregarTodasAsLinhas<{
    document: string | null;
    tax_regime: string | null;
  }>(ctx, "pier_client", "document, tax_regime");
  const regimePorDoc = new Map(
    clientes.map((c) => [doc(c.document), c.tax_regime]),
  );

  const resultados: Array<{
    solicitacaoExternalId: string;
    clienteNome: string;
    status: string;
    categoria: CategoriaFiscal;
    resumo: string;
    faltantes: string[];
    erro?: string;
  }> = [];

  for (const request of requests ?? []) {
    try {
      if (
        !request.department_external_id ||
        !amb.departamentos.has(request.department_external_id)
      )
        throw new AppError(
          "REGRA_NEGOCIO",
          "A solicitação não pertence mais ao departamento fiscal.",
        );

      const estadoReal = await pierAdapter.getRequest({
        requestExternalId: request.external_id,
      });
      const deptoReal = estadoReal.responsibleExternalId
        ? amb.departamentoPorUsuario.get(estadoReal.responsibleExternalId) ?? null
        : null;
      if (!deptoReal || !amb.departamentos.has(deptoReal))
        throw new AppError(
          "REGRA_NEGOCIO",
          "A solicitação foi atribuída a outro departamento no PIER.",
        );

      const arquivos = await pierAdapter.listFiles({
        requestExternalId: request.external_id,
      });
      const taxRegime = regimePorDoc.get(doc(request.client_document)) ?? null;
      const regimeManual = classificarRegimeFiscal(taxRegime);
      const categoria = classificarCategoriaFiscal({
        description: estadoReal.description ?? request.description,
        typeName: estadoReal.typeName ?? request.type_name,
      });
      const avaliacao = avaliarChecklistFiscal({
        categoria,
        regime: regimeManual,
        arquivos,
      });

      let status: StatusValidacaoFiscal;
      let resumo: string;
      if (categoria === "OUTRA" && regimeManual !== "SIMPLES") {
        status = "REVISAO_HUMANA";
        resumo =
          "Solicitação fiscal localizada, mas o assunto não está mapeado no Manual de Fechamento BPO. Revisão humana necessária.";
      } else if (!arquivos.length) {
        status = "BLOQUEADA";
        resumo = "Nenhum documento foi localizado no PIER para esta solicitação fiscal.";
      } else if (!avaliacao.completo) {
        status = "BLOQUEADA";
        resumo = `Checklist documental incompleto: ${avaliacao.faltantes.join(", ")}.`;
      } else {
        status = "DOCUMENTOS_OK_REVISAR";
        resumo =
          "Checklist documental localizado. Antes de concluir, validar escrituração, atualização dos relatórios, correspondência das guias com a apuração e eventuais divergências.";
      }

      const agora = new Date().toISOString();
      const { error: saveError } = await (ctx.db as any)
        .from("fiscal_validation_state")
        .upsert(
          {
            organization_id: ctx.organizationId,
            request_id: request.id,
            status,
            category: categoria,
            tax_regime: taxRegime,
            summary: resumo,
            details: {
              regimeManual,
              checklist: avaliacao.itens,
              totalObrigatorios: avaliacao.totalObrigatorios,
              totalPresentes: avaliacao.totalPresentes,
              faltantes: avaliacao.faltantes,
              opcionaisAusentes: avaliacao.opcionaisAusentes,
              arquivos: arquivos.map((a) => ({
                id: a.externalId,
                nome: a.name,
                categoria: a.category,
                criadoEm: a.createdAt,
              })),
              regraFonte: "Manual fechamento BPO - Processo de Fechamento da Escrituração Fiscal",
              validacaoConteudoPendente:
                status === "DOCUMENTOS_OK_REVISAR",
            },
            checked_at: agora,
            checked_by: ctx.userId,
            updated_at: agora,
          },
          { onConflict: "organization_id,request_id" },
        );
      if (saveError)
        throw new AppError(
          "INESPERADO",
          "Não foi possível guardar a validação fiscal.",
          saveError.message,
        );

      await ctx.db
        .from("request")
        .update({
          status: estadoReal.status,
          responsible_name: estadoReal.responsibleName,
          responsible_external_id: estadoReal.responsibleExternalId,
          department_external_id: deptoReal,
          has_attachment: arquivos.length > 0,
          finished_at: estadoReal.finishedAt,
          synced_at: agora,
        })
        .eq("organization_id", ctx.organizationId)
        .eq("id", request.id);

      resultados.push({
        solicitacaoExternalId: request.external_id,
        clienteNome: request.client_name ?? "—",
        status,
        categoria,
        resumo,
        faltantes: avaliacao.faltantes,
      });
    } catch (error) {
      const mensagem =
        error instanceof AppError
          ? error.userMessage
          : error instanceof Error
            ? error.message
            : "Falha inesperada na validação fiscal.";
      resultados.push({
        solicitacaoExternalId: request.external_id,
        clienteNome: request.client_name ?? "—",
        status: "ERRO",
        categoria: classificarCategoriaFiscal({
          description: request.description,
          typeName: request.type_name,
        }),
        resumo: mensagem,
        faltantes: [],
        erro: mensagem,
      });
    }
  }

  const resumo = {
    total: resultados.length,
    documentosOkRevisar: resultados.filter(
      (r) => r.status === "DOCUMENTOS_OK_REVISAR",
    ).length,
    bloqueadas: resultados.filter((r) => r.status === "BLOQUEADA").length,
    revisaoHumana: resultados.filter((r) => r.status === "REVISAO_HUMANA").length,
    erros: resultados.filter((r) => r.status === "ERRO").length,
  };

  await audit(ctx, {
    action: "VALIDAR_GESTAO_FISCAL",
    entity: "fiscal_validation_state",
    after: resumo,
  });

  return { resumo, resultados };
}
