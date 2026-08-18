import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierGet } from "../../integrations/pier/pier.http";
import { mapRequest } from "../../integrations/pier/pier.mapper";
import type { PierRequest } from "../../integrations/pier/pier.types";
import { solicitacaoFinalizadaPier } from "../gestao/status-pier";
import { obterVinculoPier } from "./caixa-inteligente.service";

type Raw = Record<string, unknown>;

const POR_PAGINA = 30;
const MAX_PAGINAS = 40;

function asArray(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[];
  if (payload && typeof payload === "object") {
    const container = payload as Record<string, unknown>;
    for (const key of ["data", "items", "content", "results", "dados", "registros"]) {
      if (Array.isArray(container[key])) return container[key] as Raw[];
    }
  }
  return [];
}

function validarFiltroResponsavel(itens: PierRequest[], usuarioId: string) {
  const divergentes = itens.filter(
    (item) => item.responsibleExternalId && item.responsibleExternalId !== usuarioId,
  );
  if (divergentes.length) {
    throw new AppError(
      "INTEGRACAO_FALHA",
      "O PIER não aplicou com segurança o filtro de responsável. A sincronização foi interrompida.",
      `responsável esperado ${usuarioId}; divergentes: ${divergentes
        .slice(0, 5)
        .map((item) => `${item.externalId}:${item.responsibleExternalId}`)
        .join(", ")}`,
    );
  }

  if (itens.length > 0 && !itens.some((item) => item.responsibleExternalId === usuarioId)) {
    throw new AppError(
      "INTEGRACAO_FALHA",
      "O PIER não confirmou o responsável nas solicitações retornadas. A sincronização foi interrompida.",
      `nenhum item retornou idResponsavel=${usuarioId}`,
    );
  }
}

async function consultarSolicitacoesDoResponsavel(usuarioId: string) {
  const resultados: PierRequest[] = [];

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const payload = await pierGet<unknown>("/api/v2/solicitacoes", {
      pagina,
      quantidadePorPagina: POR_PAGINA,
      status: "Todas",
      idResponsavel: usuarioId,
    });

    const lote = asArray(payload)
      .map((raw) => mapRequest(raw))
      .filter((item) => item.externalId);
    validarFiltroResponsavel(lote, usuarioId);
    resultados.push(...lote);

    if (lote.length < POR_PAGINA) {
      return {
        itens: resultados,
        atingiuLimite: false,
      };
    }
  }

  return {
    itens: resultados,
    atingiuLimite: true,
  };
}

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
 * Sincroniza a Minha Caixa consultando o PIER diretamente pelo responsável.
 * O filtro é validado contra o próprio retorno antes de qualquer gravação.
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

  try {
    const consulta = await consultarSolicitacoesDoResponsavel(usuario.id);
    const minhas = consulta.itens.filter(
      (s) =>
        s.responsibleExternalId === usuario.id &&
        !solicitacaoFinalizadaPier(s.status, s.finishedAt),
    );

    const processadas = await gravarSolicitacoes(ctx, minhas, usuario.departamentoId);

    await audit(ctx, {
      action: "SINCRONIZAR_CAIXA_INTELIGENTE",
      entity: "request",
      after: {
        modo: "RESPONSAVEL_DIRETO",
        usuarioPier: usuario.id,
        consultadas: consulta.itens.length,
        encontradas: minhas.length,
        processadas,
        possivelmenteParcial: consulta.atingiuLimite,
      },
    });

    return {
      usuario: { id: usuario.id, nome: usuario.nome },
      consultadas: consulta.itens.length,
      encontradas: minhas.length,
      processadas,
      possivelmenteParcial: consulta.atingiuLimite,
    };
  } catch (error) {
    await audit(ctx, {
      action: "SINCRONIZAR_CAIXA_INTELIGENTE_FALHA",
      entity: "request",
      after: {
        modo: "RESPONSAVEL_DIRETO",
        usuarioPier: usuario.id,
        erro: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
