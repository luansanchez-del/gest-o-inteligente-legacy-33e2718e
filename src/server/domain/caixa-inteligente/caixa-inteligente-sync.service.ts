import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import type { PierRequest } from "../../integrations/pier/pier.types";
import { solicitacaoFinalizadaPier } from "../gestao/status-pier";
import { obterVinculoPier } from "./caixa-inteligente.service";

const STATUS_ATIVOS = ["Aberta", "Andamento"] as const;
const MAX_PAGINAS_POR_STATUS = 80;
const ITENS_POR_PAGINA = 30;

async function gravarSolicitacoes(
  ctx: AppContext,
  solicitacoes: PierRequest[],
  departamentoId: string | null,
) {
  if (!solicitacoes.length) return 0;

  const agora = new Date().toISOString();
  let processados = 0;

  for (let inicio = 0; inicio < solicitacoes.length; inicio += 250) {
    const lote = solicitacoes.slice(inicio, inicio + 250);
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

    if (error) {
      throw new AppError(
        "INESPERADO",
        "Não foi possível atualizar sua Caixa de Entrada.",
        error.message,
      );
    }
    processados += lote.length;
  }

  return processados;
}

/**
 * Sincronização segura da Minha Caixa.
 *
 * Evita varrer o universo inteiro de solicitações (inclusive finalizadas), que
 * pode exceder o tempo de execução. Consulta somente os dois status ativos do
 * PIER, sem filtro de tipo, combina os resultados e filtra pelo usuário vinculado.
 * Se um status falhar, preserva o outro e sinaliza resultado parcial.
 */
export async function sincronizarMinhaCaixaSegura(
  ctx: AppContext,
  input: { email?: string },
) {
  assertCanWrite(ctx);

  const vinculo = await obterVinculoPier(ctx, { email: input.email });
  const usuario = vinculo.usuario;
  if (!usuario) {
    throw new AppError(
      "REGRA_NEGOCIO",
      "Vincule seu usuário do PIER antes de carregar a Caixa de Entrada.",
    );
  }

  const consultas = await Promise.all(
    STATUS_ATIVOS.map(async (status) => {
      try {
        const itens = await pierAdapter.listRequests({
          status,
          maxPages: MAX_PAGINAS_POR_STATUS,
        });
        return {
          status,
          itens,
          erro: null as string | null,
          atingiuLimite: itens.length >= MAX_PAGINAS_POR_STATUS * ITENS_POR_PAGINA,
        };
      } catch (error) {
        return {
          status,
          itens: [] as PierRequest[],
          erro: error instanceof Error ? error.message : "Falha ao consultar o PIER.",
          atingiuLimite: false,
        };
      }
    }),
  );

  if (consultas.every((c) => c.erro)) {
    throw new AppError(
      "INTEGRACAO_FALHA",
      "Não foi possível consultar as solicitações abertas do PIER. Tente novamente.",
      consultas.map((c) => `${c.status}: ${c.erro}`).join(" | "),
    );
  }

  const unicas = new Map<string, PierRequest>();
  for (const consulta of consultas) {
    for (const solicitacao of consulta.itens) {
      if (solicitacao.externalId) unicas.set(solicitacao.externalId, solicitacao);
    }
  }

  const solicitacoes = [...unicas.values()];
  const minhas = solicitacoes.filter(
    (s) =>
      s.responsibleExternalId === usuario.id &&
      !solicitacaoFinalizadaPier(s.status, s.finishedAt),
  );

  const processadas = await gravarSolicitacoes(ctx, minhas, usuario.departamentoId);
  const possivelmenteParcial = consultas.some((c) => Boolean(c.erro) || c.atingiuLimite);

  const consultadasPorStatus = Object.fromEntries(
    consultas.map((c) => [
      c.status,
      {
        consultadas: c.itens.length,
        erro: c.erro,
        atingiuLimite: c.atingiuLimite,
      },
    ]),
  );

  await audit(ctx, {
    action: "SINCRONIZAR_CAIXA_INTELIGENTE",
    entity: "request",
    after: {
      usuarioPier: usuario.id,
      consultadas: solicitacoes.length,
      consultadasPorStatus,
      encontradas: minhas.length,
      processadas,
      possivelmenteParcial,
    },
  });

  return {
    usuario: { id: usuario.id, nome: usuario.nome },
    consultadas: solicitacoes.length,
    consultadasPorStatus,
    encontradas: minhas.length,
    processadas,
    possivelmenteParcial,
  };
}
