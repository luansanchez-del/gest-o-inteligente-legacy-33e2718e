import { integracaoFalhou, integracaoIndisponivel } from "../../lib/errors";

export interface PierConfig {
  baseUrl: string;
  token: string;
}

/** Lê a configuração do PIER apenas do ambiente do servidor. Nunca de VITE_*. */
export function readPierConfig(): { ok: true; config: PierConfig } | { ok: false; reason: string } {
  const baseUrl = process.env["PIER_BASE_URL"]?.trim();
  const token = process.env["PIER_API_TOKEN"]?.trim();

  const missing = [!baseUrl && "PIER_BASE_URL", !token && "PIER_API_TOKEN"].filter(
    Boolean,
  ) as string[];

  if (missing.length) {
    return {
      ok: false,
      reason: `Integração com o PIER ainda não configurada (faltam: ${missing.join(", ")}).`,
    };
  }

  return { ok: true, config: { baseUrl: baseUrl!.replace(/\/+$/, ""), token: token! } };
}

const TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET no PIER com timeout, retry com backoff e sem jamais registrar a credencial. */
export async function pierGet<T>(path: string, query?: Record<string, string | undefined>) {
  const resolved = readPierConfig();
  if (!resolved.ok) throw integracaoIndisponivel(resolved.reason);

  const url = new URL(`${resolved.config.baseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }

  let lastDetail = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${resolved.config.token}`,
        },
        signal: controller.signal,
      });

      console.info(
        `[pier] GET ${path} -> ${response.status} em ${Date.now() - startedAt}ms (tentativa ${attempt})`,
      );

      if (response.status === 401 || response.status === 403) {
        throw integracaoIndisponivel(
          "O PIER recusou as credenciais configuradas. Revise a credencial de integração.",
        );
      }

      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        lastDetail = `HTTP ${response.status}`;
        await sleep(attempt * 400 + Math.random() * 200);
        continue;
      }

      if (!response.ok) {
        throw integracaoFalhou(
          `O PIER respondeu com erro ao consultar ${path}.`,
          `HTTP ${response.status}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) throw error;
      lastDetail = error instanceof Error ? error.message : String(error);
      if (attempt >= MAX_ATTEMPTS) break;
      await sleep(attempt * 400 + Math.random() * 200);
    } finally {
      clearTimeout(timer);
    }
  }

  throw integracaoFalhou("Não foi possível falar com o PIER agora.", lastDetail);
}
