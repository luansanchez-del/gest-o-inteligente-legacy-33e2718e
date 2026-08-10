// Ponto único de resolução da URL do backend da Gestão Inteligente.
// Nunca chamar o PIER direto do navegador: tudo passa por este backend.

export class ApiConfigError extends Error {
  constructor() {
    super("API da Gestão Inteligente não configurada. Defina VITE_API_URL.");
    this.name = "ApiConfigError";
  }
}

export class ApiNetworkError extends Error {
  constructor(
    readonly endpoint: string,
    readonly cause?: unknown,
  ) {
    super(
      `Não foi possível conectar à API da Gestão Inteligente (${endpoint}). Verifique se o backend está acessível a partir deste ambiente.`,
    );
    this.name = "ApiNetworkError";
  }
}

export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    readonly body: string,
  ) {
    super(`Erro ${status} em ${endpoint}${body ? `: ${body}` : ""}`);
    this.name = "ApiHttpError";
  }
}

/** Fallback para localhost só vale em desenvolvimento local (vite dev na própria máquina). */
function isLocalDevelopment() {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

/** Lança ApiConfigError quando VITE_API_URL não está definida fora do dev local. */
export function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured && configured.trim()) return configured.trim().replace(/\/+$/, "");
  if (isLocalDevelopment()) return "http://localhost:3000";
  throw new ApiConfigError();
}

export function isApiConfigured(): boolean {
  try {
    resolveApiUrl();
    return true;
  } catch {
    return false;
  }
}

/** Mensagem pronta para a interface, preservando status/endpoint quando houver resposta HTTP. */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiConfigError) return error.message;
  if (error instanceof ApiNetworkError) return error.message;
  if (error instanceof ApiHttpError) return error.message;
  if (error instanceof Error) return error.message;
  return "Falha inesperada ao consultar a API da Gestão Inteligente.";
}
