import { integracaoFalhou } from "../../lib/errors";

import { pierDownload, pierGet, pierPost, readPierConfig } from "./pier.http";
import {
  mapClient,
  mapFile,
  mapPost,
  mapRequest,
  mapRequestType,
  mapUser,
} from "./pier.mapper";
import type { PierAdapter, PierRequest } from "./pier.types";

type Raw = Record<string, unknown>;

const POR_PAGINA = 500;
/** A API de solicitações rejeita mais de 30 registros por página. */
const POR_PAGINA_SOLICITACOES = 30;
const MAX_PAGINAS = 200;
/** Páginas buscadas em paralelo para a listagem de solicitações (limitada a 30/página). */
const CONCORRENCIA = 5;

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

/** Única porta de saída para o PIER. O restante do sistema não conhece o PIER. */
export const pierAdapter: PierAdapter = {
  async status() {
    const resolved = readPierConfig();
    return resolved.ok
      ? { available: true }
      : { available: false, reason: resolved.reason };
  },

  /** Percorre /api/v2/clientes página a página até esgotar os registros. */
  async listClients(options) {
    const resultados: Raw[] = [];

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const payload = await pierGet<unknown>("/api/v2/clientes", {
        pagina,
        quantidadePorPagina: POR_PAGINA,
        status: options?.status ?? "Todos",
      });
      const lote = asArray(payload);
      resultados.push(...lote);
      if (lote.length < POR_PAGINA) break;
    }

    return resultados.map(mapClient).filter((client) => client.externalId);
  },

  /** Percorre /api/v2/usuarios (UsuarioResumoPublic: id, nome, tipo, status, departamentoPrincipalId). */
  async listUsers(options) {
    const resultados: Raw[] = [];

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const payload = await pierGet<unknown>("/api/v2/usuarios", {
        pagina,
        quantidadePorPagina: POR_PAGINA,
        status: options?.status ?? "Todos",
        tipo: "Todos",
      });
      const lote = asArray(payload);
      resultados.push(...lote);
      if (lote.length < POR_PAGINA) break;
    }

    return resultados.map(mapUser).filter((user) => user.externalId);
  },

  async listRequestTypes() {
    const resultados: Raw[] = [];
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const payload = await pierGet<unknown>("/api/v2/tipos-solicitacao", {
        pagina,
        quantidadePorPagina: POR_PAGINA,
        status: "Ativo",
      });
      const lote = asArray(payload);
      resultados.push(...lote);
      if (lote.length < POR_PAGINA) break;
    }
    return resultados.map(mapRequestType).filter((tipo) => tipo.externalId);
  },

  /**
   * Listagem genérica usada pela Caixa de Entrada Inteligente. Não assume tipo,
   * competência nem responsável: esses recortes são feitos pelo domínio depois
   * da normalização. O status utiliza o mesmo parâmetro já empregado pela API.
   */
  async listRequests(options) {
    const resultados: PierRequest[] = [];
    const limite = Math.min(Math.max(options?.maxPages ?? 60, 1), MAX_PAGINAS);

    for (let bloco = 0; bloco < limite; bloco += CONCORRENCIA) {
      const paginas = Array.from(
        { length: Math.min(CONCORRENCIA, limite - bloco) },
        (_, i) => bloco + i + 1,
      );
      const lotes = await Promise.all(
        paginas.map((pagina) =>
          pierGet<unknown>("/api/v2/solicitacoes", {
            pagina,
            quantidadePorPagina: POR_PAGINA_SOLICITACOES,
            status: options?.status ?? "Todas",
            ...(options?.busca?.trim() ? { busca: options.busca.trim() } : {}),
          }).then(asArray),
        ),
      );

      for (const lote of lotes) resultados.push(...lote.map(mapRequest));
      if (lotes.some((lote) => lote.length < POR_PAGINA_SOLICITACOES)) break;
    }

    return resultados.filter((request) => request.externalId);
  },

  /**
   * Busca as solicitações de um tipo para a competência. O PIER não filtra por
   * competência, então usamos `busca` com MM/AAAA e conferimos a descrição.
   */
  async listRequestsByType({
    typeExternalId,
    referenceMonth,
    incluirSemCompetencia,
  }) {
    const [ano, mes] = referenceMonth.split("-");
    const termo = `${mes}/${ano}`;
    const resultados: PierRequest[] = [];

    for (let bloco = 0; bloco < MAX_PAGINAS; bloco += CONCORRENCIA) {
      const paginas = Array.from(
        { length: CONCORRENCIA },
        (_, i) => bloco + i + 1,
      );
      const lotes = await Promise.all(
        paginas.map((pagina) =>
          pierGet<unknown>("/api/v2/solicitacoes", {
            pagina,
            quantidadePorPagina: POR_PAGINA_SOLICITACOES,
            idTipoSolicitacao: typeExternalId,
            status: "Todas",
            busca: termo,
          }).then(asArray),
        ),
      );

      for (const lote of lotes) {
        resultados.push(...lote.map((raw) => mapRequest(raw)));
      }
      if (lotes.some((lote) => lote.length < POR_PAGINA_SOLICITACOES)) break;
    }

    // Sem competência interpretável a solicitação não é descartada: ela é devolvida
    // para entrar na fila de "Revisão de competência".
    return resultados.filter(
      (request) =>
        request.externalId &&
        (request.referenceMonth === referenceMonth ||
          (incluirSemCompetencia && !request.referenceMonth)),
    );
  },

  async listPosts({ requestExternalId }) {
    const payload = await pierGet<unknown>(
      `/api/v2/solicitacoes/${requestExternalId}/postagens`,
    );
    return asArray(payload)
      .map((raw) => mapPost(raw, requestExternalId))
      .filter((post) => post.externalId);
  },

  /** Estado real da solicitação. Usado para corrigir divergência entre cache e PIER. */
  async getRequest({ requestExternalId }) {
    const payload = await pierGet<unknown>(
      `/api/v2/solicitacoes/${requestExternalId}`,
    );
    const raw =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Raw)["data"] &&
          typeof (payload as Raw)["data"] === "object"
          ? ((payload as Raw)["data"] as Raw)
          : (payload as Raw)
        : ({} as Raw);
    const request = mapRequest(raw);
    if (!request.externalId) request.externalId = requestExternalId;
    return request;
  },

  async listFiles({ requestExternalId }) {
    const resultados: Raw[] = [];
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const payload = await pierGet<unknown>("/api/v2/arquivos", {
        pagina,
        quantidadePorPagina: POR_PAGINA,
        idSolicitacao: requestExternalId,
      });
      const lote = asArray(payload);
      resultados.push(...lote);
      if (lote.length < POR_PAGINA) break;
    }
    return resultados
      .map((raw) => mapFile(raw, requestExternalId))
      .filter((f) => f.externalId);
  },

  async downloadFile({ fileExternalId }) {
    const payload = await pierGet<unknown>(
      `/api/v2/arquivos/${fileExternalId}/url-download`,
    );
    let url: string | null = null;
    if (typeof payload === "string") url = payload;
    else if (payload && typeof payload === "object") {
      const raw = payload as Raw;
      for (const key of ["url", "urlDownload", "downloadUrl", "link", "uri"]) {
        const value = raw[key];
        if (typeof value === "string" && value.trim()) {
          url = value.trim();
          break;
        }
      }
    }
    if (!url)
      throw integracaoFalhou(
        "O PIER não devolveu o link de download do arquivo.",
      );
    // A URL é temporária: usada apenas aqui e nunca persistida ou registrada.
    return pierDownload(url);
  },

  async createPost({ requestExternalId, mensagem, privada = true }) {
    const payload = await pierPost<unknown>(
      `/api/v2/solicitacoes/${requestExternalId}/postagens`,
      { mensagem, flgPrivada: privada },
    );
    let externalId: string | null = null;
    if (typeof payload === "string" || typeof payload === "number")
      externalId = String(payload);
    else if (payload && typeof payload === "object") {
      const raw = payload as Raw;
      const alvo =
        raw["data"] && typeof raw["data"] === "object"
          ? (raw["data"] as Raw)
          : raw;
      for (const key of ["id", "idPostagem", "externalId"]) {
        const value = alvo[key];
        if (typeof value === "string" || typeof value === "number") {
          externalId = String(value);
          break;
        }
      }
    }
    return { externalId };
  },

  async finalizeRequest({ requestExternalId }) {
    await pierPost<unknown>(
      `/api/v2/solicitacoes/${requestExternalId}/finalizar`,
    );
  },
};
