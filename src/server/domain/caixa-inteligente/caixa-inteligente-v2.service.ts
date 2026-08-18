import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { solicitacaoFinalizadaPier } from "../gestao/status-pier";
import { lerAnexosPier } from "./anexo-inteligente.service";
import { analisarContextoComIA } from "./contexto-inteligente.service";
import * as baseService from "./caixa-inteligente.service";

export type AcaoCaixaV2 =
  | "RESPONDER_MANTER_ABERTA"
  | "RESPONDER_FINALIZAR"
  | "FINALIZAR_SEM_RESPONDER";

function rotuloContexto(categoria: string) {
  if (categoria === "FISCAL")
    return {
      titulo: "Documentos e evidências fiscais",
      vazio:
        "Nenhum documento fiscal conclusivo foi identificado automaticamente neste contexto.",
    };
  if (categoria === "FINANCEIRO")
    return {
      titulo: "Documentos e evidências financeiras",
      vazio:
        "Nenhum extrato, comprovante ou evidência financeira conclusiva foi identificado automaticamente.",
    };
  if (categoria === "FOLHA")
    return {
      titulo: "Documentos e evidências de Folha / DP",
      vazio:
        "Nenhum documento de folha, eSocial ou DP conclusivo foi identificado automaticamente.",
    };
  if (categoria === "ADMINISTRATIVO")
    return {
      titulo: "Documentos e evidências administrativas",
      vazio: "Nenhuma evidência administrativa conclusiva foi identificada automaticamente.",
    };
  if (categoria === "DOCUMENTO")
    return {
      titulo: "Documentos localizados",
      vazio: "Nenhum documento conclusivo foi identificado automaticamente.",
    };
  return {
    titulo: "Fechamento e documentos contábeis",
    vazio:
      "Não foi localizado fechamento contábil ou evidência conclusiva correspondente ao contexto identificado.",
  };
}

export async function analisarSolicitacaoV2(
  ctx: AppContext,
  input: { email?: string; solicitacaoExternalId: string },
) {
  const base = await baseService.analisarSolicitacao(ctx, input);
  const solicitacao = await pierAdapter.getRequest({
    requestExternalId: input.solicitacaoExternalId,
  });

  const [postagens, arquivos] = await Promise.all([
    pierAdapter
      .listPosts({ requestExternalId: solicitacao.externalId })
      .catch(() => []),
    pierAdapter
      .listFiles({ requestExternalId: solicitacao.externalId })
      .catch(() => []),
  ]);

  const arquivosLidos = await lerAnexosPier(arquivos);
  const contextual = await analisarContextoComIA({
    tipo: solicitacao.typeName,
    descricao: solicitacao.description,
    cliente: solicitacao.clientName,
    postagens: postagens.map((p) => ({ autor: p.authorName, conteudo: p.content })),
    anexos: arquivosLidos,
  }).catch(() => null);

  const categoria = contextual?.categoria ?? base.leitura.categoria;
  const confianca = contextual?.confianca ?? base.leitura.confianca;
  const categoriaContabil = categoria === "CONTABIL" || categoria === "BALANCETE";
  const contexto = rotuloContexto(categoria);

  // Fechamento contábil só é evidência principal quando o assunto também é contábil.
  const fechamento = categoriaContabil ? base.localizador.fechamento : null;

  let acao = base.recomendacao.acao as
    | "RESPONDER_FINALIZAR"
    | "RESPONDER_MANTER_ABERTA"
    | "ENCAMINHAR"
    | "REVISAO_HUMANA"
    | "FINALIZAR_SEM_RESPONDER";
  let motivo = base.recomendacao.motivo;

  if (!categoriaContabil && contextual) {
    acao = contextual.acaoSugerida;
    motivo = contextual.motivo || motivo;
  } else if (
    categoriaContabil &&
    fechamento?.status !== "CONCLUIDO" &&
    contextual?.acaoSugerida
  ) {
    acao = contextual.acaoSugerida;
    motivo = contextual.motivo || motivo;
  }

  // O histórico de responsável continua válido como sinal forte quando identificado.
  if (
    base.recomendacao.acao === "ENCAMINHAR" &&
    base.localizador.responsavelSugerido
  ) {
    acao = "ENCAMINHAR";
    motivo = base.recomendacao.motivo;
  }

  const resumoArquivos = arquivosLidos
    .filter((a) => a.status === "LIDO" || a.status === "PARCIAL")
    .map((a) => `${a.nome}: ${a.resumo}`)
    .join("\n\n");

  const resumoContexto =
    contextual?.resumo?.trim() ||
    (resumoArquivos
      ? `Conteúdo identificado nos anexos:\n${resumoArquivos}`
      : "Nenhum conteúdo adicional foi extraído dos anexos.");

  let respostaSugerida = contextual?.respostaSugerida?.trim() || base.respostaSugerida;
  if (acao === "FINALIZAR_SEM_RESPONDER") respostaSugerida = "";

  return {
    ...base,
    solicitacao: {
      ...base.solicitacao,
      resumoContexto,
    },
    leitura: {
      ...base.leitura,
      categoria,
      confianca,
      arquivos: arquivos.map((a) => a.name).filter(Boolean),
      arquivosLidos,
      resumoContexto,
    },
    localizador: {
      ...base.localizador,
      fechamento,
      contextoDocumental: {
        titulo: contexto.titulo,
        mensagemVazia: contexto.vazio,
        arquivosLidos,
      },
    },
    recomendacao: {
      acao,
      motivo,
      somenteInformativo: contextual?.somenteInformativo ?? false,
    },
    respostaSugerida,
  };
}

async function resolverUsuario(ctx: AppContext, email?: string) {
  const vinculo = await baseService.obterVinculoPier(ctx, { email });
  if (!vinculo.usuario)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Vincule seu usuário do PIER antes de operar a Caixa de Entrada.",
    );
  return vinculo.usuario;
}

function acaoFinaliza(acao: AcaoCaixaV2) {
  return acao === "RESPONDER_FINALIZAR" || acao === "FINALIZAR_SEM_RESPONDER";
}

export async function executarAcaoV2(
  ctx: AppContext,
  input: {
    email?: string;
    solicitacaoExternalId: string;
    acao: AcaoCaixaV2;
    mensagem?: string;
    privada?: boolean;
    justificativaFinalizacao?: string;
  },
) {
  assertCanWrite(ctx);
  const usuario = await resolverUsuario(ctx, input.email);
  const atual = await pierAdapter.getRequest({
    requestExternalId: input.solicitacaoExternalId,
  });

  if (atual.responsibleExternalId !== usuario.id)
    throw new AppError(
      "REGRA_NEGOCIO",
      "A solicitação mudou de responsável no PIER. Atualize a Caixa antes de executar a ação.",
    );
  if (solicitacaoFinalizadaPier(atual.status, atual.finishedAt))
    throw new AppError("REGRA_NEGOCIO", "A solicitação já está finalizada no PIER.");

  const mensagem = input.mensagem?.trim() ?? "";
  const precisaResponder = input.acao !== "FINALIZAR_SEM_RESPONDER";
  if (precisaResponder && mensagem.length < 10)
    throw new AppError("VALIDACAO", "Revise a resposta antes de publicar no PIER.");

  if (acaoFinaliza(input.acao)) {
    const analiseAtual = await analisarSolicitacaoV2(ctx, {
      email: input.email,
      solicitacaoExternalId: atual.externalId,
    });
    const recomendada = analiseAtual.recomendacao.acao;
    const corresponde =
      (input.acao === "RESPONDER_FINALIZAR" && recomendada === "RESPONDER_FINALIZAR") ||
      (input.acao === "FINALIZAR_SEM_RESPONDER" && recomendada === "FINALIZAR_SEM_RESPONDER");
    const justificativa = input.justificativaFinalizacao?.trim() ?? "";
    if (!corresponde && justificativa.length < 10) {
      throw new AppError(
        "VALIDACAO",
        "A finalização diverge da recomendação atual. Informe uma justificativa de exceção.",
      );
    }
  }

  let postagemId: string | null = null;
  if (precisaResponder) {
    const postagem = await pierAdapter.createPost({
      requestExternalId: atual.externalId,
      mensagem,
      privada: input.privada ?? false,
    });
    postagemId = postagem.externalId;
    if (!postagemId)
      throw new AppError(
        "INTEGRACAO_FALHA",
        "O PIER não confirmou a postagem. Nenhuma finalização será executada.",
      );
  }

  let confirmado = atual;
  if (acaoFinaliza(input.acao)) {
    await pierAdapter.finalizeRequest({ requestExternalId: atual.externalId });
    confirmado = await pierAdapter.getRequest({ requestExternalId: atual.externalId });
    if (!solicitacaoFinalizadaPier(confirmado.status, confirmado.finishedAt))
      throw new AppError(
        "INTEGRACAO_FALHA",
        precisaResponder
          ? "A resposta foi publicada, mas o PIER não confirmou a finalização."
          : "O PIER não confirmou a finalização sem resposta. A solicitação permanece para conferência.",
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
      postagemId,
      publicouResposta: precisaResponder,
      privada: precisaResponder ? input.privada ?? false : null,
      finalizada: acaoFinaliza(input.acao),
      justificativaFinalizacao: input.justificativaFinalizacao?.trim() || null,
    },
  });

  return {
    postagemId,
    publicouResposta: precisaResponder,
    finalizada: acaoFinaliza(input.acao),
    statusPier: confirmado.status,
  };
}
