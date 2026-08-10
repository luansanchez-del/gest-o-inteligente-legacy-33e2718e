// Cliente HTTP do backend da Gestão Inteligente para as ferramentas MCP.
// Import-safe: nenhuma leitura de env em escopo de módulo.

type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  return (globalThis as RuntimeGlobals).process?.env?.[name]?.trim() || undefined;
}

export function backendBaseUrl(): string {
  const url = runtimeEnv("API_URL") ?? runtimeEnv("VITE_API_URL");
  if (!url) {
    throw new Error(
      "API da Gestão Inteligente não configurada. Defina VITE_API_URL (ou API_URL) no ambiente do projeto.",
    );
  }
  return url.replace(/\/+$/, "");
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** GET no backend da Gestão Inteligente. O PIER nunca é chamado diretamente. */
export async function backendGet<T>(path: string): Promise<T> {
  const url = `${backendBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { "Content-Type": "application/json" } });
  } catch {
    throw new Error(`Não foi possível conectar à API da Gestão Inteligente (${url}).`);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Erro ${response.status} em ${path}${body ? `: ${body}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}
