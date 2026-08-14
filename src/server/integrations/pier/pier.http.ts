import { integracaoFalhou, integracaoIndisponivel } from "../../lib/errors";

export interface PierConfig {
  baseUrl: string;
  usuario: string;
  senha: string;
}

/** Lê a configuração do PIER apenas do ambiente do servidor. Nunca de VITE_*. */
export function readPierConfig(): { ok: true; config: PierConfig } | { ok: false; reason: string } {
  const baseUrl = process.env["PIER_BASE_URL"]?.trim();
  const usuario = process.env["PIER_USUARIO"]?.trim();
  const senha = process.env["PIER_SENHA"]?.trim();

  const missing = [
    !baseUrl && "PIER_BASE_URL",
    !usuario && "PIER_USUARIO",
    !senha && "PIER_SENHA",
  ].filter(Boolean) as string[];

  if (missing.length) {
    return {
      ok: false,
      reason: `Integração com o PIER ainda não configurada (faltam: ${missing.join(", ")}).`,
    };
  }

  return {
    ok: true,
    config: { baseUrl: baseUrl!.replace(/\/+$/, ""), usuario: usuario!, senha: senha! },
  };
}

const TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
/** Renova o token um pouco antes do vencimento informado pelo PIER. */
const RENOVAR_ANTES_MS = 60_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TokenCache {
  chave: string;
  token: string;
  expiraEm: number;
}

let cache: TokenCache | null = null;

async function safeResponseText(response: Response): Promise<string> {
  try {
    const clone = response.clone();
    const text = await clone.text();
    return text.length > 500 ? text.slice(0, 500) + "…" : text;
  } catch {
    return "";
  }
}

function extractToken(payload: Record<string, unknown>): string | null {
  for (const key of ["token", "accessToken", "access_token", "jwt", "bearer"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractExpiration(payload: Record<string, unknown>): number {
  for (const key of ["expiraEm", "expiresAt", "expires_at", "exp", "expiration"]) {
    const value = payload[key];
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 1_000_000_000_000 ? value : value * 1000;
    }
  }
  return Number.NaN;
}

/** Autentica em /api/v2/auth/login com usuário e senha. Nunca registra credencial nem token. */
async function autenticar(config: PierConfig, forcar = false): Promise<string> {
  const chave = `${config.baseUrl}|${config.usuario}`;
  if (
    !forcar &&
    cache &&
    cache.chave === chave &&
    cache.expiraEm - RENOVAR_ANTES_MS > Date.now()
  ) {
    return cache.token;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const authUrl = `${config.baseUrl}/api/v2/auth/login`;
    const response = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        Username: config.usuario,
        Password: config.senha,
      }),
      signal: controller.signal,
    });

    const bodyPreview = response.ok ? "" : await safeResponseText(response);


    if (response.status === 401 || response.status === 403) {
      throw integracaoIndisponivel(
        "O PIER recusou o usuário e a senha configurados. Revise as credenciais de integração.",
      );
    }
    if (!response.ok) {
      throw integracaoFalhou(
        "Não foi possível autenticar no PIER.",
        `HTTP ${response.status}: ${bodyPreview || "sem corpo"}`,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const token = extractToken(payload);
    if (!token) {
      throw integracaoFalhou(
        "O PIER não retornou um token de acesso válido.",
        `campos: ${Object.keys(payload).join(", ")}`,
      );
    }

    const expiraEm = extractExpiration(payload);
    cache = {
      chave,
      token,
      expiraEm: Number.isFinite(expiraEm) ? expiraEm : Date.now() + 30 * 60_000,
    };
    return cache.token;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    throw integracaoFalhou(
      "Não foi possível falar com o PIER agora.",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Testa a conectividade e autenticação com o PIER sem realizar alterações. */
export async function testarConexaoPier(): Promise<{
  ok: boolean;
  status?: number;
  detalhe?: string;
}> {
  const resolved = readPierConfig();
  if (!resolved.ok) return { ok: false, detalhe: resolved.reason };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const authUrl = `${resolved.config.baseUrl}/api/v2/auth/login`;
    const response = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        Username: resolved.config.usuario,
        Password: resolved.config.senha,
      }),
      signal: controller.signal,
    });

    const bodyPreview = await safeResponseText(response);
    return {
      ok: response.ok,
      status: response.status,
      detalhe: bodyPreview || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      detalhe: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** GET autenticado no PIER com timeout, retry com backoff e renovação de token em 401. */
export async function pierGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const resolved = readPierConfig();
  if (!resolved.ok) throw integracaoIndisponivel(resolved.reason);
  const { config } = resolved;

  const url = new URL(`${config.baseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && `${value}` !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let lastDetail = "";
  let renovou = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const token = await autenticar(config, renovou);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });





      if (response.status === 401 && !renovou) {
        renovou = true;
        cache = null;
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw integracaoIndisponivel(
          "O PIER recusou a credencial configurada. Revise a chave de integração.",
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

/**
 * POST autenticado no PIER. Não faz retry cego: um POST repetido pode duplicar
 * postagem ou finalização. Só repete quando o token precisou ser renovado (401).
 */
export async function pierPost<T>(path: string, body?: unknown): Promise<T> {
  const resolved = readPierConfig();
  if (!resolved.ok) throw integracaoIndisponivel(resolved.reason);
  const { config } = resolved;

  const url = `${config.baseUrl}${path}`;
  let renovou = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const token = await autenticar(config, renovou);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });

      if (response.status === 401 && !renovou && attempt === 1) {
        renovou = true;
        cache = null;
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw integracaoIndisponivel(
          "O PIER recusou a credencial configurada para esta ação.",
        );
      }

      if (!response.ok) {
        throw integracaoFalhou(
          `O PIER respondeu com erro em ${path}.`,
          `HTTP ${response.status}: ${await safeResponseText(response)}`,
        );
      }

      const texto = await response.text();
      if (!texto.trim()) return null as T;
      try {
        return JSON.parse(texto) as T;
      } catch {
        return texto as unknown as T;
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) throw error;
      throw integracaoFalhou(
        `Não foi possível concluir a ação no PIER (${path}).`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw integracaoFalhou(`Não foi possível concluir a ação no PIER (${path}).`);
}

/** Baixa um arquivo por URL temporária. A URL nunca é registrada em log/auditoria. */
export async function pierDownload(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 3);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok)
      throw integracaoFalhou(
        "Não foi possível baixar o arquivo da solicitação.",
        `HTTP ${response.status}`,
      );
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    throw integracaoFalhou(
      "Não foi possível baixar o arquivo da solicitação.",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
}
