import { pierGet, readPierConfig } from "./pier.http";
import { mapClient, mapPost, mapRequest, mapUser } from "./pier.mapper";
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
    for (const key of ["data", "items", "content", "results", "dados", "registros"]) {
      if (Array.isArray(container[key])) return container[key] as Raw[];
    }
  }
  return [];
}

/** Única porta de saída para o PIER. O restante do sistema não conhece o PIER. */
export const pierAdapter: PierAdapter = {
  async status() {
    const resolved = readPierConfig();
    return resolved.ok ? { available: true } : { available: false, reason: resolved.reason };
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

  /**
   * Busca as solicitações de um tipo para a competência. O PIER não filtra por
   * competência, então usamos `busca` com MM/AAAA e conferimos a descrição.
   */
  async listRequestsByType({ typeExternalId, referenceMonth }) {
    const [ano, mes] = referenceMonth.split("-");
    const termo = `${mes}/${ano}`;
    const resultados: PierRequest[] = [];

    for (let bloco = 0; bloco < MAX_PAGINAS; bloco += CONCORRENCIA) {
      const paginas = Array.from({ length: CONCORRENCIA }, (_, i) => bloco + i + 1);
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

    return resultados.filter(
      (request) => request.externalId && request.referenceMonth === referenceMonth,
    );
  },

  async listPosts({ requestExternalId }) {
    const payload = await pierGet<unknown>(`/api/v2/solicitacoes/${requestExternalId}/postagens`);
    return asArray(payload)
      .map((raw) => mapPost(raw, requestExternalId))
      .filter((post) => post.externalId);
  },
};
