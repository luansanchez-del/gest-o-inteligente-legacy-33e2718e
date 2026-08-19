import type { AppContext } from "../../lib/context";
import { audit } from "../../lib/audit";
import { erroSeguro } from "../../lib/mascara";
import { verificarRespostaPierPorExternalId } from "../gestao/resposta-pier.service";
import { obterDecisaoInteligente } from "./decisao-inteligente.service";
import {
  executarDecisaoInteligente,
  type AcaoDecisaoInteligente,
} from "./decisao-inteligente.action";

export interface PrepararDecisaoLoteInput {
  solicitacoes: string[];
}

export interface ExecutarDecisaoLoteItem {
  solicitacaoExternalId: string;
  execucaoId?: string | null;
  acao: AcaoDecisaoInteligente;
  mensagem: string;
  justificativa?: string | null;
}

function idsUnicos(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
}

export async function prepararDecisaoLote(
  ctx: AppContext,
  input: PrepararDecisaoLoteInput,
) {
  const ids = idsUnicos(input.solicitacoes);
  const itens: Array<
    | {
        status: "OK";
        solicitacaoExternalId: string;
        decisao: Awaited<ReturnType<typeof obterDecisaoInteligente>>;
      }
    | {
        status: "JA_RESPONDIDA";
        solicitacaoExternalId: string;
        autor: string | null;
        respondidaEm: string | null;
      }
    | {
        status: "ERRO";
        solicitacaoExternalId: string;
        erro: string;
      }
  > = [];

  for (const solicitacaoExternalId of ids) {
    try {
      // Fail-safe: antes de gerar qualquer resposta, confere o PIER ao vivo.
      const resposta = await verificarRespostaPierPorExternalId(
        ctx,
        solicitacaoExternalId,
      );
      if (resposta.status === "RESPONDIDA") {
        itens.push({
          status: "JA_RESPONDIDA",
          solicitacaoExternalId,
          autor: resposta.authorName,
          respondidaEm: resposta.postedAt,
        });
        continue;
      }

      const decisao = await obterDecisaoInteligente(ctx, {
        solicitacaoExternalId,
      });
      itens.push({ status: "OK", solicitacaoExternalId, decisao });
    } catch (error) {
      // Se a verificação falhar, a solicitação NÃO fica elegível para postagem.
      itens.push({
        status: "ERRO",
        solicitacaoExternalId,
        erro: erroSeguro(error),
      });
    }
  }

  const conta = (tipo: string) =>
    itens.filter(
      (item) =>
        item.status === "OK" && item.decisao.recomendacao.tipo === tipo,
    ).length;

  return {
    total: itens.length,
    resumo: {
      aptasFinalizar: conta("APROVAR_FINALIZAR"),
      comJustificativa: conta("APROVAR_COM_JUSTIFICATIVA"),
      solicitarCorrecao: conta("SOLICITAR_CORRECAO"),
      revisaoHumana: conta("REVISAO_HUMANA"),
      jaRespondidas: itens.filter((item) => item.status === "JA_RESPONDIDA").length,
      errosPreparacao: itens.filter((item) => item.status === "ERRO").length,
    },
    itens,
  };
}

export async function executarDecisaoLote(
  ctx: AppContext,
  input: { itens: ExecutarDecisaoLoteItem[] },
) {
  const loteId = crypto.randomUUID();
  const itens = input.itens.slice(0, 100);

  await audit(ctx, {
    action: "DECISAO_LOTE_PIER",
    entity: "request_batch",
    correlationId: loteId,
    after: {
      fase: "INICIADA",
      total: itens.length,
      solicitacoes: itens.map((item) => item.solicitacaoExternalId),
    },
  });

  const resultados: Array<{
    solicitacaoExternalId: string;
    status: "SUCESSO" | "ERRO";
    situacao?: string;
    mensagem?: string;
    postagemId?: string | null;
    finalizadaEm?: string | null;
    erro?: string;
  }> = [];

  for (const item of itens) {
    try {
      // Segunda conferência, imediatamente antes da escrita no PIER.
      const resposta = await verificarRespostaPierPorExternalId(
        ctx,
        item.solicitacaoExternalId,
      );
      if (resposta.status === "RESPONDIDA") {
        resultados.push({
          solicitacaoExternalId: item.solicitacaoExternalId,
          status: "SUCESSO",
          situacao: "JA_RESPONDIDA",
          mensagem: resposta.authorName
            ? `Ignorada: já havia resposta no PIER por ${resposta.authorName}. Nenhuma nova postagem foi criada.`
            : "Ignorada: já havia resposta no PIER. Nenhuma nova postagem foi criada.",
          postagemId: resposta.postExternalId,
          finalizadaEm: null,
        });
        continue;
      }

      const retorno = await executarDecisaoInteligente(ctx, {
        solicitacaoExternalId: item.solicitacaoExternalId,
        execucaoId: item.execucaoId ?? null,
        acao: item.acao,
        mensagem: item.mensagem,
        justificativa: item.justificativa ?? null,
        privada: true,
      });
      resultados.push({
        solicitacaoExternalId: item.solicitacaoExternalId,
        status: "SUCESSO",
        situacao: retorno.situacao,
        mensagem: retorno.mensagem,
        postagemId: retorno.postagemId,
        finalizadaEm: retorno.finalizadaEm,
      });
    } catch (error) {
      resultados.push({
        solicitacaoExternalId: item.solicitacaoExternalId,
        status: "ERRO",
        erro: erroSeguro(error),
      });
    }
  }

  const sucesso = resultados.filter((item) => item.status === "SUCESSO");
  const finalizadas = sucesso.filter((item) =>
    ["FINALIZADA", "JA_FINALIZADA"].includes(item.situacao ?? ""),
  ).length;
  const respondidasAbertas = sucesso.filter(
    (item) => item.situacao === "RESPONDIDA",
  ).length;
  const jaRespondidas = sucesso.filter(
    (item) => item.situacao === "JA_RESPONDIDA",
  ).length;

  const resumo = {
    total: resultados.length,
    sucesso: sucesso.length,
    finalizadas,
    respondidasAbertas,
    jaRespondidas,
    erros: resultados.filter((item) => item.status === "ERRO").length,
  };

  await audit(ctx, {
    action: "DECISAO_LOTE_PIER",
    entity: "request_batch",
    correlationId: loteId,
    after: {
      fase: "CONCLUIDA",
      ...resumo,
      resultados: resultados.map((item) => ({
        solicitacaoExternalId: item.solicitacaoExternalId,
        status: item.status,
        situacao: item.situacao ?? null,
      })),
    },
  });

  return { loteId, resumo, resultados };
}
