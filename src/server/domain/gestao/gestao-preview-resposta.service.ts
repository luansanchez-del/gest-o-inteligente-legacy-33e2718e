import type { AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { montarPreview as montarPreviewBase } from "./gestao.service";

export type StatusRespostaFiltro =
  | "TODAS"
  | "SEM_RESPOSTA"
  | "RESPONDIDAS"
  | "NAO_VERIFICADAS";

export async function montarPreviewComRespostas(
  ctx: AppContext,
  filtro: Parameters<typeof montarPreviewBase>[1] & {
    statusResposta?: StatusRespostaFiltro | null;
  },
) {
  const base = await montarPreviewBase(ctx, filtro);
  const externalIds = base.empresas.map((e) => e.solicitacaoId);

  const requestPorExternal = new Map<string, string>();
  if (externalIds.length) {
    for (let inicio = 0; inicio < externalIds.length; inicio += 500) {
      const { data, error } = await ctx.db
        .from("request")
        .select("id, external_id")
        .eq("organization_id", ctx.organizationId)
        .in("external_id", externalIds.slice(inicio, inicio + 500));
      if (error)
        throw new AppError(
          "INESPERADO",
          "Não foi possível carregar o status de resposta das solicitações.",
          error.message,
        );
      for (const request of data ?? [])
        requestPorExternal.set(request.external_id, request.id);
    }
  }

  const requestIds = [...requestPorExternal.values()];
  const estadoPorRequest = new Map<
    string,
    {
      status: "RESPONDIDA" | "NAO_RESPONDIDA";
      checked_at: string;
      author_name: string | null;
      posted_at: string | null;
      post_external_id: string | null;
    }
  >();

  if (requestIds.length) {
    for (let inicio = 0; inicio < requestIds.length; inicio += 500) {
      const { data, error } = await (ctx.db as any)
        .from("request_response_state")
        .select(
          "request_id,status,checked_at,author_name,posted_at,post_external_id",
        )
        .eq("organization_id", ctx.organizationId)
        .in("request_id", requestIds.slice(inicio, inicio + 500));
      if (error)
        throw new AppError(
          "INESPERADO",
          "Não foi possível carregar o status de resposta das solicitações.",
          error.message,
        );
      for (const row of data ?? []) estadoPorRequest.set(row.request_id, row);
    }
  }

  let empresas = base.empresas.map((empresa) => {
    const requestId = requestPorExternal.get(empresa.solicitacaoId) ?? null;
    const estado = requestId ? estadoPorRequest.get(requestId) ?? null : null;
    return {
      ...empresa,
      statusResposta: estado?.status ?? ("NAO_VERIFICADA" as const),
      respostaAutor: estado?.author_name ?? null,
      respostaEm: estado?.posted_at ?? null,
      respostaPostagemId: estado?.post_external_id ?? null,
      respostaVerificadaEm: estado?.checked_at ?? null,
      jaRespondida: estado?.status === "RESPONDIDA",
    };
  });

  const statusResposta = filtro.statusResposta ?? "TODAS";
  if (statusResposta === "SEM_RESPOSTA")
    empresas = empresas.filter((e) => e.statusResposta === "NAO_RESPONDIDA");
  if (statusResposta === "RESPONDIDAS")
    empresas = empresas.filter((e) => e.statusResposta === "RESPONDIDA");
  if (statusResposta === "NAO_VERIFICADAS")
    empresas = empresas.filter((e) => e.statusResposta === "NAO_VERIFICADA");

  const porResponsavel = new Map<
    string,
    { id: string | null; nome: string; total: number }
  >();
  for (const linha of empresas) {
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
    ...base,
    totalEmpresas: empresas.length,
    totalSemResponsavel: empresas.filter((l) => !l.responsavelId).length,
    totalComDocumento: empresas.filter((l) => l.documentoDisponivel).length,
    totalSemDocumento: empresas.filter((l) => !l.documentoDisponivel).length,
    totalAvisosCadastrais: empresas.filter((l) => Boolean(l.avisoCadastral))
      .length,
    totalJaRespondidas: empresas.filter((l) => l.jaRespondida).length,
    totalSemRespostaVerificada: empresas.filter(
      (l) => l.statusResposta === "NAO_RESPONDIDA",
    ).length,
    totalRespostaNaoVerificada: empresas.filter(
      (l) => l.statusResposta === "NAO_VERIFICADA",
    ).length,
    responsaveis: [...porResponsavel.values()].sort((a, b) => b.total - a.total),
    empresas,
  };
}
