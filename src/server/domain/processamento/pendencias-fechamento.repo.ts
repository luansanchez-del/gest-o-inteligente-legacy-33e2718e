import type { AppContext } from "../../lib/context";
import {
  categoriaDoAchado,
  type ItemRespondido,
  type PendenciaAnterior,
} from "../../../lib/fechamento/respostas-padrao";

interface SolicitacaoRef {
  id: string;
  client_document: string | null;
  client_name: string | null;
  reference_month: string | null;
}

export interface PendenciaAberta extends PendenciaAnterior {
  id: string;
}

/**
 * Pendências em acompanhamento deixadas por fechamentos anteriores do mesmo
 * cliente (por CNPJ; sem CNPJ, pelo nome). A própria solicitação fica de fora.
 */
export async function listarPendenciasAbertas(
  ctx: AppContext,
  solicitacao: SolicitacaoRef,
): Promise<PendenciaAberta[]> {
  const documento = solicitacao.client_document?.replace(/\D/g, "") || null;
  if (!documento && !solicitacao.client_name) return [];

  let query = ctx.db
    .from("closing_followup")
    .select(
      "id, request_id, reference_month, account_name, account_code, amount, finding_title, response_text",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("status", "ABERTA")
    .neq("request_id", solicitacao.id);
  query = documento
    ? query.eq("client_document", documento)
    : query.eq("client_name", solicitacao.client_name!);

  const { data, error } = await query.order("created_at", { ascending: true });
  // Tabela ainda não migrada ou falha de leitura não pode travar a decisão.
  if (error) {
    console.error("[pendencias] leitura indisponível:", error.message);
    return [];
  }
  return (data ?? []).map((p) => ({
    id: p.id,
    competencia: p.reference_month,
    contaNome: p.account_name,
    contaCodigo: p.account_code,
    valor: p.amount === null ? null : Number(p.amount),
    titulo: p.finding_title,
    resposta: p.response_text,
  }));
}

export async function registrarPendencias(
  ctx: AppContext,
  solicitacao: SolicitacaoRef,
  execucaoId: string | null,
  itens: ItemRespondido[],
) {
  const acompanhar = itens.filter((i) => i.opcao.acompanhar);
  if (!acompanhar.length) return 0;
  const { error } = await ctx.db.from("closing_followup").insert(
    acompanhar.map(({ achado, opcao, complemento }) => ({
      organization_id: ctx.organizationId,
      request_id: solicitacao.id,
      execution_id: execucaoId,
      client_document: solicitacao.client_document?.replace(/\D/g, "") || null,
      client_name: solicitacao.client_name,
      reference_month: solicitacao.reference_month,
      finding_code: achado.codigo ?? "SEM_CODIGO",
      category: categoriaDoAchado(achado),
      account_code: achado.contaCodigo ?? null,
      account_name: achado.contaNome ?? null,
      amount: typeof achado.valor === "number" ? achado.valor : null,
      finding_title: achado.titulo,
      response_key: opcao.chave,
      response_text: complemento ? `${opcao.texto} ${complemento}` : opcao.texto,
      created_by: ctx.userId,
    })),
  );
  if (error) throw new Error(error.message);
  return acompanhar.length;
}

export async function marcarPendenciasConferidas(
  ctx: AppContext,
  solicitacaoId: string,
  ids: string[],
) {
  if (!ids.length) return;
  const { error } = await ctx.db
    .from("closing_followup")
    .update({
      status: "CONFERIDA",
      checked_request_id: solicitacaoId,
      checked_at: new Date().toISOString(),
      checked_by: ctx.userId,
    })
    .eq("organization_id", ctx.organizationId)
    .in("id", ids);
  if (error) throw new Error(error.message);
}
