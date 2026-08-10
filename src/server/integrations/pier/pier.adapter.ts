import { pierGet, readPierConfig } from "./pier.http";
import { mapClient, mapPost, mapRequest } from "./pier.mapper";
import type { PierAdapter } from "./pier.types";

type Raw = Record<string, unknown>;

const POR_PAGINA = 500;
const MAX_PAGINAS = 200;

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

  async listRequests({ clientExternalId, referenceMonth }) {
    const payload = await pierGet<unknown>("/api/v2/solicitacoes", {
      idCliente: clientExternalId,
      competencia: referenceMonth,
    });
    return asArray(payload)
      .map((raw) => mapRequest(raw, clientExternalId))
      .filter((request) => request.externalId);
  },

  async listPosts({ requestExternalId }) {
    const payload = await pierGet<unknown>(`/api/v2/solicitacoes/${requestExternalId}/postagens`);
    return asArray(payload)
      .map((raw) => mapPost(raw, requestExternalId))
      .filter((post) => post.externalId);
  },
};
