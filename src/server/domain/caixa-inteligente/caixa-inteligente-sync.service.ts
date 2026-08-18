import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { pierGet } from "../../integrations/pier/pier.http";
import { mapRequest } from "../../integrations/pier/pier.mapper";
import type { PierRequest, PierRequestType } from "../../integrations/pier/pier.types";
import { solicitacaoFinalizadaPier } from "../gestao/status-pier";
import { obterVinculoPier } from "./caixa-inteligente.service";

type Raw = Record<string, unknown>;

const STATUS_ATIVOS = ["Aberta", "Andamento"] as const;
const POR_PAGINA = 30;
const MAX_PAGINAS_FILTRADAS = 40;
const MAX_PAGINAS_FALLBACK = 25;
const CONCORRENCIA_TIPOS = 4;

function asArray(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[];
  if (payload && typeof payload === "object") {
    const container = payload as Record<string, unknown>;
    for (const key of [
      "data",
      "items",
      "content",
      "results",
      "dados",
      "registros",
    ]) {
      if (Array.isArray(container[key])) return container[key] as Raw[];
    }
  }
  return [];
}

function mapearLote(payload: unknown, tipo: PierRequestType) {
  return asArray(payload)
    .map((raw) => mapRequest(raw, tipo.name))
    .filter((item) => item.externalId);
}

interface ResultadoConsultaTipo {
  tipoId: string;
  tipoNome: string;
  status: string;
  minhas: PierRequest[];
  consultadas: number;
  modo: "TIPO_E_RESPONSAVEL" | "TIPO_COMPLETO";
  parcial: boolean;
  erro: string | null;
}

/**
 * Caminho rápido: depois de selecionar o tipo, tenta pedir ao PIER apenas as
 * solicitações do responsável. O retorno é validado antes de ser aceito.
 */
async function consultarTipoComResponsavel(
  tipo: PierRequestType,
  status: string,
  usuarioId: string,
): Promise<ResultadoConsultaTipo> {
  const minhas: PierRequest[] = [];
  let consultadas = 0;

  for (let pagina = 1; pagina <= MAX_PAGINAS_FILTRADAS; pagina++) {
    const payload = await pierGet<unknown>("/api/v2/solicitacoes", {
      pagina,
      quantidadePorPagina: POR_PAGINA,
      idTipoSolicitacao: tipo.externalId,
      status,
      idResponsavel: usuarioId,
    });
    const lote = mapearLote(payload, tipo);
    consultadas += lote.length;

    // Se o PIER ignorar o filtro de responsável (ou não trouxer responsável),
    // abandonamos este caminho e fazemos a carga do tipo sem esse filtro.
    if (
      lote.some(
        (item) =>
          !item.responsibleExternalId || item.responsibleExternalId !== usuarioId,
      )
    ) {
      throw new Error("FILTRO_RESPONSAVEL_NAO_CONFIRMADO");
    }

    minhas.push(...lote);
    if (lote.length < POR_PAGINA) {
      return {
        tipoId: tipo.externalId,
        tipoNome: tipo.name,
        status,
        minhas,
        consultadas,
        modo: "TIPO_E_RESPONSAVEL",
        parcial: false,
        erro: null,
      };
    }
  }

  return {
    tipoId: tipo.externalId,
    tipoNome: tipo.name,
    status,
    minhas,
    consultadas,
    modo: "TIPO_E_RESPONSAVEL",
    parcial: true,
    erro: null,
  };
}

/**
 * Fallback fiel ao fluxo de "carregar solicitações": busca a fila daquele tipo
 * no PIER e só depois separa localmente o usuário vinculado.
 */
async function consultarTipoCompleto(
  tipo: PierRequestType,
  status: string,
  usuarioId: string,
): Promise<ResultadoConsultaTipo> {
  const minhas: PierRequest[] = [];
  let consultadas = 0;

  for (let pagina = 1; pagina <= MAX_PAGINAS_FALLBACK; pagina++) {
    const payload = await pierGet<unknown>("/api/v2/solicitacoes", {
      pagina,
      quantidadePorPagina: POR_PAGINA,
      idTipoSolicitacao: tipo.externalId,
      status,
    });
    const lote = mapearLote(payload, tipo);
    consultadas += lote.length;
    minhas.push(
      ...lote.filter((item) => item.responsibleExternalId === usuarioId),
    );

    if (lote.length < POR_PAGINA) {
      return {
        tipoId: tipo.externalId,
        tipoNome: tipo.name,
        status,
        minhas,
        consultadas,
        modo: "TIPO_COMPLETO",
        parcial: false,
        erro: null,
      };
    }
  }

  return {
    tipoId: tipo.externalId,
    tipoNome: tipo.name,
    status,
    minhas,
    consultadas,
    modo: "TIPO_COMPLETO",
    parcial: true,
    erro: null,
  };
}

async function carregarTipoStatus(
  tipo: PierRequestType,
  status: string,
  usuarioId: string,
): Promise<ResultadoConsultaTipo> {
  try {
    return await consultarTipoComResponsavel(tipo, status, usuarioId);
  } catch {
    try {
      return await consultarTipoCompleto(tipo, status, usuarioId);
    } catch (error) {
      return {
        tipoId: tipo.externalId,
        tipoNome: tipo.name,
        status,
        minhas: [],
        consultadas: 0,
        modo: "TIPO_COMPLETO",
        parcial: true,
        erro: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

async function carregarTodosOsTipos(usuarioId: string) {
  const tipos = await pierAdapter.listRequestTypes();
  const resultados: ResultadoConsultaTipo[] = [];

  // Processa poucos tipos em paralelo para não pressionar a API do PIER.
  for (let inicio = 0; inicio < tipos.length; inicio += CONCORRENCIA_TIPOS) {
    const grupo = tipos.slice(inicio, inicio + CONCORRENCIA_TIPOS);
    const consultas = await Promise.all(
      grupo.flatMap((tipo) =>
        STATUS_ATIVOS.map((status) =>
          carregarTipoStatus(tipo, status, usuarioId),
        ),
      ),
    );
    resultados.push(...consultas);
  }

  const unicas = new Map<string, PierRequest>();
  for (const resultado of resultados) {
    for (const solicitacao of resultado.minhas) {
      if (solicitacao.externalId) unicas.set(solicitacao.externalId, solicitacao);
    }
  }

  return {
    tipos,
    resultados,
    minhas: [...unicas.values()],
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
 * A Minha Caixa não parte mais de um recorte já carregado de Fechamento Contábil.
 * Primeiro percorre TODOS os tipos ativos do PIER, carrega as solicitações abertas
 * daquele tipo e só depois separa as atribuídas ao usuário vinculado.
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
    const carga = await carregarTodosOsTipos(usuario.id);
    const minhasAtivas = carga.minhas.filter(
      (s) => !solicitacaoFinalizadaPier(s.status, s.finishedAt),
    );
    const processadas = await gravarSolicitacoes(
      ctx,
      minhasAtivas,
      usuario.departamentoId,
    );

    const falhas = carga.resultados.filter((r) => r.erro);
    const parciais = carga.resultados.filter((r) => r.parcial);
    const fallbacks = carga.resultados.filter(
      (r) => r.modo === "TIPO_COMPLETO",
    ).length;
    const consultadas = carga.resultados.reduce(
      (total, r) => total + r.consultadas,
      0,
    );
    const possivelmenteParcial = falhas.length > 0 || parciais.length > 0;

    await audit(ctx, {
      action: "SINCRONIZAR_CAIXA_INTELIGENTE",
      entity: "request",
      after: {
        modo: "CARGA_POR_TIPO_DEPOIS_RESPONSAVEL",
        usuarioPier: usuario.id,
        tiposAtivos: carga.tipos.length,
        consultasTipoStatus: carga.resultados.length,
        consultadas,
        encontradas: minhasAtivas.length,
        processadas,
        fallbacks,
        falhas: falhas.map((r) => ({
          tipoId: r.tipoId,
          tipoNome: r.tipoNome,
          status: r.status,
          erro: r.erro,
        })),
        possivelmenteParcial,
      },
    });

    // Só derruba a operação se nenhum tipo/status conseguiu ser consultado.
    if (carga.resultados.length > 0 && falhas.length === carga.resultados.length) {
      throw new AppError(
        "INTEGRACAO_FALHA",
        "Não foi possível carregar as solicitações do PIER.",
        falhas.slice(0, 5).map((r) => `${r.tipoNome}/${r.status}: ${r.erro}`).join(" | "),
      );
    }

    return {
      usuario: { id: usuario.id, nome: usuario.nome },
      tiposConsultados: carga.tipos.length,
      consultadas,
      encontradas: minhasAtivas.length,
      processadas,
      possivelmenteParcial,
      falhas: falhas.length,
    };
  } catch (error) {
    await audit(ctx, {
      action: "SINCRONIZAR_CAIXA_INTELIGENTE_FALHA",
      entity: "request",
      after: {
        modo: "CARGA_POR_TIPO_DEPOIS_RESPONSAVEL",
        usuarioPier: usuario.id,
        erro: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
