import type { AppContext } from "../../lib/context";
import { audit } from "../../lib/audit";
import { erroSeguro } from "../../lib/mascara";
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
        status: "ERRO";
        solicitacaoExternalId: string;
        erro: string;
      }
  > = [];

  for (const solicitacaoExternalId of ids) {
    try {
      const decisao = await obterDecisaoInteligente(ctx, {
        solicitacaoExternalId,
      });
      itens.push({ status: "OK", solicitacaoExternalId, decisao });
    } catch (error) {
      itens.push({
        status: "ERRO",
        solicitacaoExternalId,
        erro: erroSeguro(error),
      });
    }
  }

  const validos = itens.filter((item) => item.status === "OK");
  const conta = (tipo: string) =>
    validos.filter((item) => item.decisao.recomendacao.tipo === tipo).length;

  return {
    total: itens.length,
    resumo: {
      aptasFinalizar: conta("APROVAR_FINALIZAR"),
      comJustificativa: conta("APROVAR_COM_JUSTIFICATIVA"),
      solicitarCorrecao: conta("SOLICITAR_CORRECAO"),
      revisaoHumana: conta("REVISAO_HUMANA"),
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

  const resumo = {
    total: resultados.length,
    sucesso: sucesso.length,
    finalizadas,
    respondidasAbertas,
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
