import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { erroSeguro, mascararTexto } from "../../lib/mascara";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { contemDeclaracaoSemMovimento } from "../processamento/processamento.service";
import { solicitacaoFinalizadaPier } from "./status-pier";

const LOTE_MAXIMO = 100;

function normalizarDocumento(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizarNome(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ehMovimentoFinanceiro(row: { purpose: string | null; type_name: string | null }) {
  if (row.purpose === "MONTHLY_FINANCIAL_MOVEMENT") return true;
  const nome = normalizarNome(row.type_name);
  return nome.includes("movimento") && nome.includes("financeiro");
}

function mensagemDeclaracao(competencia: string) {
  return mascararTexto(
    `Registro do escritório: conforme o controle interno de carteira, esta empresa foi identificada como sem movimento na competência ${competencia}. Caso a informação não reflita a realidade do período, favor nos avisar para regularização antes do fechamento.`,
  );
}

export interface LinhaSemMovimento {
  cliente: string;
  documento?: string | null;
}

export interface ItemPreparado {
  cliente: string;
  documento: string | null;
  encontrado: boolean;
  solicitacaoExternalId?: string;
  numero?: string | null;
  motivo?: string;
}

export async function prepararDeclaracaoSemMovimento(
  ctx: AppContext,
  input: { linhas: LinhaSemMovimento[]; competencia: string },
) {
  if (!/^\d{4}-\d{2}$/.test(input.competencia))
    throw new AppError("VALIDACAO", "Informe uma competência válida (AAAA-MM).");
  if (!input.linhas.length)
    throw new AppError(
      "VALIDACAO",
      "A planilha não trouxe nenhuma linha marcada como sem movimento.",
    );
  if (input.linhas.length > 500)
    throw new AppError("VALIDACAO", "Importe no máximo 500 linhas por vez.");

  const { data: solicitacoesBrutas, error } = await ctx.db
    .from("request")
    .select("external_id, number, client_name, client_document, purpose, type_name, finished_at")
    .eq("organization_id", ctx.organizationId)
    .eq("reference_month", input.competencia);

  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível carregar as solicitações da competência.",
      error.message,
    );

  const elegiveis = (solicitacoesBrutas ?? []).filter(
    (s) => ehMovimentoFinanceiro(s) && !s.finished_at,
  );
  const porDoc = new Map(
    elegiveis
      .map((s) => [normalizarDocumento(s.client_document), s] as const)
      .filter(([doc]) => doc),
  );
  const porNome = new Map(elegiveis.map((s) => [normalizarNome(s.client_name), s] as const));

  const itens: ItemPreparado[] = input.linhas.map((linha) => {
    const doc = normalizarDocumento(linha.documento);
    const nome = normalizarNome(linha.cliente);
    const solicitacao = (doc && porDoc.get(doc)) || porNome.get(nome) || null;

    if (!solicitacao) {
      return {
        cliente: linha.cliente,
        documento: linha.documento ?? null,
        encontrado: false,
        motivo:
          "Nenhuma solicitação de Movimento Financeiro aberta nesta competência foi encontrada para esta empresa. Carregue as solicitações da competência antes de tentar de novo.",
      };
    }

    return {
      cliente: linha.cliente,
      documento: linha.documento ?? null,
      encontrado: true,
      solicitacaoExternalId: solicitacao.external_id,
      numero: solicitacao.number,
    };
  });

  return {
    total: itens.length,
    encontradas: itens.filter((i) => i.encontrado).length,
    naoEncontradas: itens.filter((i) => !i.encontrado).length,
    itens,
  };
}

export async function executarDeclaracaoSemMovimento(
  ctx: AppContext,
  input: { solicitacoes: string[]; competencia: string },
) {
  assertCanWrite(ctx);
  if (!/^\d{4}-\d{2}$/.test(input.competencia))
    throw new AppError("VALIDACAO", "Informe uma competência válida (AAAA-MM).");

  const ids = [...new Set(input.solicitacoes.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    LOTE_MAXIMO,
  );
  if (!ids.length) throw new AppError("VALIDACAO", "Nenhuma solicitação foi selecionada.");

  const loteId = crypto.randomUUID();
  const mensagem = mensagemDeclaracao(input.competencia);

  const resultados: Array<{
    solicitacaoExternalId: string;
    status: "DECLARADO" | "JA_DECLARADO" | "JA_FINALIZADA" | "ERRO";
    postagemId?: string | null;
    erro?: string;
  }> = [];

  for (const solicitacaoExternalId of ids) {
    try {
      const detalhe = await pierAdapter.getRequest({ requestExternalId: solicitacaoExternalId });
      if (solicitacaoFinalizadaPier(detalhe.status, detalhe.finishedAt)) {
        resultados.push({ solicitacaoExternalId, status: "JA_FINALIZADA" });
        continue;
      }

      const posts = await pierAdapter.listPosts({ requestExternalId: solicitacaoExternalId });
      const jaDeclarado = posts.some((post) => contemDeclaracaoSemMovimento(post.content ?? ""));
      if (jaDeclarado) {
        resultados.push({ solicitacaoExternalId, status: "JA_DECLARADO" });
        continue;
      }

      const postagem = await pierAdapter.createPost({
        requestExternalId: solicitacaoExternalId,
        mensagem,
        privada: true,
      });
      resultados.push({
        solicitacaoExternalId,
        status: "DECLARADO",
        postagemId: postagem.externalId,
      });
    } catch (error) {
      resultados.push({
        solicitacaoExternalId,
        status: "ERRO",
        erro: erroSeguro(error),
      });
    }
  }

  const resumo = {
    total: resultados.length,
    declaradas: resultados.filter((r) => r.status === "DECLARADO").length,
    jaDeclaradas: resultados.filter((r) => r.status === "JA_DECLARADO").length,
    jaFinalizadas: resultados.filter((r) => r.status === "JA_FINALIZADA").length,
    erros: resultados.filter((r) => r.status === "ERRO").length,
  };

  await audit(ctx, {
    action: "DECLARAR_SEM_MOVIMENTO_PIER",
    entity: "request_batch",
    correlationId: loteId,
    after: {
      competencia: input.competencia,
      ...resumo,
      resultados: resultados.map((r) => ({
        solicitacaoExternalId: r.solicitacaoExternalId,
        status: r.status,
      })),
    },
  });

  return { loteId, resumo, resultados };
}
