import type { AppContext } from "../../lib/context";
import {
  carregarSolicitacao,
  obterResultadoValidacao,
} from "../validacao/validacao.service";
import {
  montarRecomendacaoDecisao,
  type AchadoDecisao,
} from "./decisao-inteligente.core";

function diasDeAtraso(deadlineAt: string | null, finishedAt: string | null) {
  if (!deadlineAt || finishedAt) return 0;
  const limite = new Date(deadlineAt);
  if (Number.isNaN(limite.getTime())) return 0;
  const agora = new Date();
  if (limite.getTime() >= agora.getTime()) return 0;
  return Math.max(
    1,
    Math.floor((agora.getTime() - limite.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

export async function obterDecisaoInteligente(
  ctx: AppContext,
  input: { solicitacaoExternalId: string; execucaoId?: string | null },
) {
  const solicitacao = await carregarSolicitacao(ctx, input.solicitacaoExternalId);

  let execucaoId = input.execucaoId ?? null;
  if (!execucaoId) {
    const { data: execucao } = await ctx.db
      .from("validation_execution")
      .select("id, status")
      .eq("organization_id", ctx.organizationId)
      .eq("request_id", solicitacao.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (execucao?.status === "COMPLETED") execucaoId = execucao.id;
  }

  let resultado: Awaited<ReturnType<typeof obterResultadoValidacao>> | null = null;
  if (execucaoId) {
    try {
      resultado = await obterResultadoValidacao(ctx, { execucaoId });
    } catch {
      resultado = null;
    }
  }

  const achados = ((resultado?.achados ?? []) as AchadoDecisao[]).map((achado) => ({
    severidade: achado.severidade,
    titulo: achado.titulo,
    detalhe: achado.detalhe ?? null,
    contaCodigo: achado.contaCodigo ?? null,
    contaNome: achado.contaNome ?? null,
    exigeHumano: Boolean(achado.exigeHumano),
  }));

  const recomendacao = montarRecomendacaoDecisao({
    clienteNome: solicitacao.client_name,
    competencia: solicitacao.reference_month,
    resultado: typeof resultado?.resultado === "string" ? resultado.resultado : null,
    resumo: typeof resultado?.resumo === "string" ? resultado.resumo : null,
    achados,
    analiseDisponivel: Boolean(resultado && resultado.status === "COMPLETED"),
  });

  const atraso = diasDeAtraso(solicitacao.deadline_at, solicitacao.finished_at);

  return {
    solicitacaoExternalId: solicitacao.external_id,
    execucaoId,
    clienteNome: solicitacao.client_name,
    numero: solicitacao.number,
    competencia: solicitacao.reference_month,
    statusPier: solicitacao.status,
    responsavelAtual: solicitacao.responsible_name,
    prazoEm: solicitacao.deadline_at,
    vencida: atraso > 0,
    diasVencida: atraso,
    finalizadaEm: solicitacao.finished_at,
    recomendacao,
    encaminhamento: {
      disponivel: false,
      motivo:
        "O conector PIER atual ainda não possui endpoint validado para trocar responsável/departamento. Nenhum endpoint será presumido.",
    },
  };
}
