import { pierGet, readPierConfig } from "./pier.http";
import { mapClient, mapPost, mapRequest } from "./pier.mapper";
import type { PierAdapter } from "./pier.types";

type Raw = Record<string, unknown>;

function asArray(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[];
  if (payload && typeof payload === "object") {
    const container = payload as Record<string, unknown>;
    for (const key of ["data", "items", "content", "results"]) {
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

  async listClients() {
    const payload = await pierGet<unknown>("/clients");
    return asArray(payload)
      .map(mapClient)
      .filter((client) => client.externalId);
  },

  async listRequests({ clientExternalId, referenceMonth }) {
    const payload = await pierGet<unknown>("/requests", {
      clientId: clientExternalId,
      referenceMonth,
    });
    return asArray(payload)
      .map((raw) => mapRequest(raw, clientExternalId))
      .filter((request) => request.externalId);
  },

  async listPosts({ requestExternalId }) {
    const payload = await pierGet<unknown>(`/requests/${requestExternalId}/posts`);
    return asArray(payload)
      .map((raw) => mapPost(raw, requestExternalId))
      .filter((post) => post.externalId);
  },
};
