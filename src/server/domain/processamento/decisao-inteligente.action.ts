import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { erroSeguro, mascararTexto } from "../../lib/mascara";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { carregarSolicitacao } from "../validacao/validacao.service";
import { obterDecisaoInteligente } from "./decisao-inteligente.service";

export type AcaoDecisaoInteligente =
  | "RESPONDER_MANTER_ABERTA"
  | "RESPONDER_FINALIZAR";

function pareceFinalizada(status: string | null, finishedAt: string | null) {
  return Boolean(finishedAt) || /finaliz|conclu|encerr/i.test(status ?? "");
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object"
    ? (valor as Record<string, unknown>)
    : {};
}

async function fingerprint(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function postagemAnterior(
  ctx: AppContext,
  solicitacaoExternalId: string,
  chave: string,
) {
  const { data } = await ctx.db
    .from("audit_log")
    .select("after_data")
    .eq("organization_id", ctx.organizationId)
    .eq("correlation_id", solicitacaoExternalId)
    .eq("action", "DECISAO_INTELIGENTE_PIER")
    .order("created_at", { ascending: false })
    .limit(30);

  for (const evento of data ?? []) {
    const after = objeto(evento.after_data);
    if (after["fingerprint"] !== chave) continue;
    const postagemId = after["postagemId"];
    if (typeof postagemId === "string" && postagemId) return postagemId;
  }
  return null;
}

/**
 * Executa somente a ação confirmada pelo usuário.
 * Vencimento nunca dispara ação automática e impedimentos nunca são finalizados.
 */
export async function executarDecisaoInteligente(
  ctx: AppContext,
  input: {
    solicitacaoExternalId: string;
    execucaoId?: string | null;
    acao: AcaoDecisaoInteligente;
    mensagem: string;
    justificativa?: string | null;
    privada?: boolean;
  },
) {
  assertCanWrite(ctx);

  const mensagem = mascararTexto(input.mensagem ?? "").trim().slice(0, 8500);
  if (mensagem.length < 10)
    throw new AppError(
      "VALIDACAO",
      "Revise a resposta antes de executar a ação no PIER.",
    );

  const decisao = await obterDecisaoInteligente(ctx, {
    solicitacaoExternalId: input.solicitacaoExternalId,
    execucaoId: input.execucaoId,
  });
  const solicitacao = await carregarSolicitacao(ctx, input.solicitacaoExternalId);

  let estadoReal;
  try {
    estadoReal = await pierAdapter.getRequest({
      requestExternalId: solicitacao.external_id,
    });
  } catch (error) {
    throw new AppError(
      "INTEGRACAO_FALHA",
      "Não foi possível conferir o estado atual da solicitação no PIER.",
      erroSeguro(error),
    );
  }

  if (pareceFinalizada(estadoReal.status, estadoReal.finishedAt)) {
    await ctx.db
      .from("request")
      .update({
        status: estadoReal.status,
        finished_at: estadoReal.finishedAt ?? solicitacao.finished_at,
      })
      .eq("organization_id", ctx.organizationId)
      .eq("id", solicitacao.id);

    return {
      situacao: "JA_FINALIZADA" as const,
      mensagem:
        "A solicitação já está finalizada no PIER. Nenhuma nova ação foi executada.",
      postagemId: null,
      finalizadaEm: estadoReal.finishedAt,
    };
  }

  const finalizar = input.acao === "RESPONDER_FINALIZAR";
  if (finalizar && !decisao.recomendacao.podeFinalizar)
    throw new AppError(
      "REGRA_NEGOCIO",
      "A análise possui impedimento ou não sustenta uma finalização. Responda e mantenha a solicitação aberta.",
    );

  const justificativa = input.justificativa
    ? mascararTexto(input.justificativa).trim().slice(0, 2000)
    : "";
  if (
    finalizar &&
    decisao.recomendacao.exigeJustificativa &&
    justificativa.length < 10
  )
    throw new AppError(
      "VALIDACAO",
      "Esta aprovação exige uma justificativa técnica antes da finalização.",
    );

  const mensagemFinal =
    finalizar && justificativa
      ? `${mensagem}\n\nJustificativa da aprovação:\n${justificativa}`.slice(0, 9000)
      : mensagem;
  const chave = await fingerprint(
    `${solicitacao.external_id}|${input.execucaoId ?? decisao.execucaoId ?? "sem-execucao"}|${input.acao}|${mensagemFinal}`,
  );

  let postagemId = await postagemAnterior(ctx, solicitacao.external_id, chave);
  if (!postagemId) {
    try {
      const postagem = await pierAdapter.createPost({
        requestExternalId: solicitacao.external_id,
        mensagem: mensagemFinal,
        privada: input.privada ?? true,
      });
      postagemId = postagem.externalId;
    } catch (error) {
      throw new AppError(
        "INTEGRACAO_FALHA",
        "A resposta não pôde ser publicada no PIER. Nenhuma finalização foi executada.",
        erroSeguro(error),
      );
    }

    if (!postagemId)
      throw new AppError(
        "INTEGRACAO_FALHA",
        "O PIER não confirmou o identificador da postagem. A solicitação permaneceu aberta.",
      );

    await audit(ctx, {
      action: "DECISAO_INTELIGENTE_PIER",
      entity: "request",
      entityId: solicitacao.id,
      correlationId: solicitacao.external_id,
      after: {
        fase: "POSTADA",
        acao: input.acao,
        tipoDecisao: decisao.recomendacao.tipo,
        execucaoId: input.execucaoId ?? decisao.execucaoId,
        postagemId,
        fingerprint: chave,
        justificativaRegistrada: Boolean(justificativa),
      },
    });
  }

  if (!finalizar) {
    return {
      situacao: "RESPONDIDA" as const,
      mensagem: "Resposta publicada no PIER. A solicitação permaneceu aberta.",
      postagemId,
      finalizadaEm: null,
    };
  }

  try {
    await pierAdapter.finalizeRequest({
      requestExternalId: solicitacao.external_id,
    });
  } catch (error) {
    throw new AppError(
      "INTEGRACAO_FALHA",
      "A resposta foi publicada, mas a finalização falhou. Uma nova tentativa reutilizará a postagem já confirmada.",
      erroSeguro(error),
    );
  }

  let confirmacao;
  try {
    confirmacao = await pierAdapter.getRequest({
      requestExternalId: solicitacao.external_id,
    });
  } catch (error) {
    throw new AppError(
      "INTEGRACAO_FALHA",
      "A finalização foi enviada, mas não foi possível confirmar o novo estado no PIER.",
      erroSeguro(error),
    );
  }

  if (!pareceFinalizada(confirmacao.status, confirmacao.finishedAt))
    throw new AppError(
      "INTEGRACAO_FALHA",
      "O PIER ainda não confirmou a finalização. A postagem foi preservada e não será duplicada em uma nova tentativa.",
    );

  const finalizadaEm = confirmacao.finishedAt ?? new Date().toISOString();
  await ctx.db
    .from("request")
    .update({ status: confirmacao.status, finished_at: finalizadaEm })
    .eq("organization_id", ctx.organizationId)
    .eq("id", solicitacao.id);

  await audit(ctx, {
    action: "DECISAO_INTELIGENTE_PIER",
    entity: "request",
    entityId: solicitacao.id,
    correlationId: solicitacao.external_id,
    after: {
      fase: "FINALIZADA",
      acao: input.acao,
      tipoDecisao: decisao.recomendacao.tipo,
      execucaoId: input.execucaoId ?? decisao.execucaoId,
      postagemId,
      fingerprint: chave,
      statusPier: confirmacao.status,
      finalizadaEm,
      justificativaRegistrada: Boolean(justificativa),
    },
  });

  return {
    situacao: "FINALIZADA" as const,
    mensagem: decisao.recomendacao.exigeJustificativa
      ? "Resposta e justificativa publicadas; solicitação finalizada e confirmada no PIER."
      : "Resposta publicada; solicitação finalizada e confirmada no PIER.",
    postagemId,
    finalizadaEm,
  };
}
