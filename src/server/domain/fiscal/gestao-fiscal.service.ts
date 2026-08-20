import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { carregarUsuariosPier } from "../gestao/pier-user.repo";
import { solicitacaoFinalizadaPier } from "../gestao/status-pier";
import { validarChecklistFiscal } from "./fiscal-checklist.service";

export const DEPARTAMENTO_FISCAL_PIER = "16103";

export type FiltroStatusFiscal = "ABERTAS" | "FINALIZADAS" | "TODAS";
export type FiltroRespostaFiscal =
  | "TODAS"
  | "SEM_RESPOSTA"
  | "RESPONDIDAS"
  | "NAO_VERIFICADAS";

function tipoEhFechamentoFiscal(tipo: string | null | undefined) {
  const texto = (tipo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return texto.includes("fechamento") && texto.includes("fiscal");
}

async function contextoFiscal(ctx: AppContext) {
  const usuarios = await carregarUsuariosPier<{
    external_id: string;
    name: string;
    status: string | null;
    department_external_id: string | null;
  }>(ctx, "external_id, name, status, department_external_id");

  const fiscais = usuarios.filter(
    (u) =>
      u.department_external_id === DEPARTAMENTO_FISCAL_PIER &&
      (u.status ?? "").toLowerCase() === "ativo",
  );
  return {
    fiscais,
    idsFiscais: new Set(fiscais.map((u) => u.external_id)),
  };
}

export async function sincronizarGestaoFiscal(
  ctx: AppContext,
  input: { competencia: string },
) {
  assertCanWrite(ctx);
  if (!/^\d{4}-\d{2}$/.test(input.competencia))
    throw new AppError("VALIDACAO", "Informe a competência no formato AAAA-MM.");

  const { idsFiscais } = await contextoFiscal(ctx);
  const todas = await pierAdapter.listRequests({ status: "Todas", maxPages: 200 });
  const fiscais = todas.filter(
    (s) =>
      s.referenceMonth === input.competencia &&
      Boolean(s.responsibleExternalId && idsFiscais.has(s.responsibleExternalId)),
  );

  const agora = new Date().toISOString();
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
        department_external_id: DEPARTAMENTO_FISCAL_PIER,
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
        "Não foi possível sincronizar as solicitações do Fiscal.",
        error.message,
      );
  }

  await audit(ctx, {
    action: "SINCRONIZAR_GESTAO_FISCAL",
    entity: "request",
    after: {
      competencia: input.competencia,
      encontradas: fiscais.length,
      departamentoPier: DEPARTAMENTO_FISCAL_PIER,
    },
  });

  return {
    competencia: input.competencia,
    total: fiscais.length,
    departamentoPier: DEPARTAMENTO_FISCAL_PIER,
  };
}

export async function listarGestaoFiscal(
  ctx: AppContext,
  input: {
    competencia: string;
    responsavelId?: string | null;
    status?: FiltroStatusFiscal | null;
    resposta?: FiltroRespostaFiscal | null;
    busca?: string | null;
    somenteComAnexo?: boolean;
  },
) {
  if (!/^\d{4}-\d{2}$/.test(input.competencia))
    throw new AppError("VALIDACAO", "Informe a competência no formato AAAA-MM.");

  const { fiscais } = await contextoFiscal(ctx);
  let consulta = ctx.db
    .from("request")
    .select(
      "id, external_id, number, description, type_name, status, client_name, client_document, responsible_external_id, responsible_name, has_attachment, reference_month, deadline_at, finished_at, requested_at",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("department_external_id", DEPARTAMENTO_FISCAL_PIER)
    .eq("reference_month", input.competencia);

  if (input.responsavelId)
    consulta = consulta.eq("responsible_external_id", input.responsavelId);
  if (input.somenteComAnexo) consulta = consulta.eq("has_attachment", true);

  const { data: requests, error } = await consulta;
  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível carregar a Gestão Fiscal.",
      error.message,
    );

  const requestIds = (requests ?? []).map((r) => r.id);
  const respostaPorRequest = new Map<
    string,
    {
      status: string;
      author_name: string | null;
      posted_at: string | null;
      checked_at: string | null;
    }
  >();
  if (requestIds.length) {
    for (let inicio = 0; inicio < requestIds.length; inicio += 500) {
      const { data } = await (ctx.db as any)
        .from("request_response_state")
        .select("request_id,status,author_name,posted_at,checked_at")
        .eq("organization_id", ctx.organizationId)
        .in("request_id", requestIds.slice(inicio, inicio + 500));
      for (const row of data ?? []) respostaPorRequest.set(row.request_id, row);
    }
  }

  let linhas = (requests ?? []).map((r) => {
    const finalizada = solicitacaoFinalizadaPier(r.status, r.finished_at);
    const resposta = respostaPorRequest.get(r.id) ?? null;
    const statusResposta = resposta?.status ?? "NAO_VERIFICADA";
    const fechamentoFiscal = tipoEhFechamentoFiscal(r.type_name);
    return {
      solicitacaoId: r.external_id,
      numero: r.number,
      clienteNome: r.client_name ?? "—",
      documento: r.client_document,
      tipoNome: r.type_name ?? "Solicitação fiscal",
      descricao: r.description,
      competencia: r.reference_month,
      responsavelId: r.responsible_external_id,
      responsavelNome: r.responsible_name,
      statusPier: r.status,
      prazoEm: r.deadline_at,
      finalizadaEm: r.finished_at,
      solicitadaEm: r.requested_at,
      temAnexo: Boolean(r.has_attachment),
      finalizada,
      fechamentoFiscal,
      statusResposta,
      respostaAutor: resposta?.author_name ?? null,
      respostaEm: resposta?.posted_at ?? null,
      respostaVerificadaEm: resposta?.checked_at ?? null,
    };
  });

  const status = input.status ?? "ABERTAS";
  if (status === "ABERTAS") linhas = linhas.filter((l) => !l.finalizada);
  if (status === "FINALIZADAS") linhas = linhas.filter((l) => l.finalizada);

  const resposta = input.resposta ?? "TODAS";
  if (resposta === "RESPONDIDAS")
    linhas = linhas.filter((l) => l.statusResposta === "RESPONDIDA");
  if (resposta === "SEM_RESPOSTA")
    linhas = linhas.filter((l) => l.statusResposta === "NAO_RESPONDIDA");
  if (resposta === "NAO_VERIFICADAS")
    linhas = linhas.filter((l) => l.statusResposta === "NAO_VERIFICADA");

  const busca = (input.busca ?? "").trim().toLowerCase();
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    linhas = linhas.filter(
      (l) =>
        l.clienteNome.toLowerCase().includes(busca) ||
        l.tipoNome.toLowerCase().includes(busca) ||
        (digitos.length >= 3 && (l.documento ?? "").replace(/\D/g, "").includes(digitos)),
    );
  }

  linhas.sort((a, b) => {
    const prazoA = a.prazoEm ?? "9999";
    const prazoB = b.prazoEm ?? "9999";
    return prazoA.localeCompare(prazoB) || a.clienteNome.localeCompare(b.clienteNome, "pt-BR");
  });

  return {
    competencia: input.competencia,
    departamentoPier: DEPARTAMENTO_FISCAL_PIER,
    responsaveis: fiscais.map((u) => ({ id: u.external_id, nome: u.name })),
    resumo: {
      total: linhas.length,
      abertas: linhas.filter((l) => !l.finalizada).length,
      fechamentosFiscais: linhas.filter((l) => l.fechamentoFiscal).length,
      outrasDemandas: linhas.filter((l) => !l.fechamentoFiscal).length,
      comAnexo: linhas.filter((l) => l.temAnexo).length,
      respondidas: linhas.filter((l) => l.statusResposta === "RESPONDIDA").length,
      naoVerificadas: linhas.filter((l) => l.statusResposta === "NAO_VERIFICADA").length,
    },
    linhas,
  };
}

export async function validarFechamentosFiscais(
  ctx: AppContext,
  input: { solicitacoes: string[] },
) {
  assertCanWrite(ctx);
  const ids = [...new Set(input.solicitacoes.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
  const resultados = [];
  for (const solicitacaoExternalId of ids) {
    try {
      const resultado = await validarChecklistFiscal(ctx, { solicitacaoExternalId });
      resultados.push({ status: "OK" as const, ...resultado });
    } catch (error) {
      resultados.push({
        status: "ERRO" as const,
        solicitacaoExternalId,
        erro: error instanceof Error ? error.message : "Falha na validação fiscal.",
      });
    }
  }
  return {
    total: resultados.length,
    aptas: resultados.filter((r) => r.status === "OK" && r.situacao === "APTA_PARA_CONCLUIR").length,
    aguardandoDocumento: resultados.filter((r) => r.status === "OK" && r.situacao === "AGUARDANDO_DOCUMENTO").length,
    comRessalvas: resultados.filter((r) => r.status === "OK" && r.situacao === "COM_RESSALVAS").length,
    revisaoHumana: resultados.filter((r) => r.status === "OK" && r.situacao === "REVISAO_HUMANA").length,
    erros: resultados.filter((r) => r.status === "ERRO").length,
    resultados,
  };
}
