import type { AppContext } from "@/server/lib/context";

/** Carrega o contexto da organização e converte erros para a fronteira RPC. */
export async function comContexto<T>(
  userId: string,
  email: string | undefined,
  run: (ctx: AppContext) => Promise<T>,
): Promise<T> {
  const { loadContext } = await import("@/server/lib/context");
  const { toClientError } = await import("@/server/lib/errors");
  try {
    return await run(await loadContext(userId, email));
  } catch (error) {
    throw toClientError(error);
  }
}

export function emailDoToken(claims: Record<string, unknown>): string | undefined {
  return typeof claims["email"] === "string" ? (claims["email"] as string) : undefined;
}
