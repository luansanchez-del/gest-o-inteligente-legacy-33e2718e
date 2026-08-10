import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const obterSessao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadContext } = await import("@/server/lib/context");
    const { toClientError } = await import("@/server/lib/errors");
    try {
      const ctx = await loadContext(
        context.userId,
        typeof context.claims["email"] === "string" ? (context.claims["email"] as string) : undefined,
      );
      return {
        organizacao: { id: ctx.organizationId, nome: ctx.organizationName },
        papeis: ctx.roles,
        podeEscrever: ctx.canWrite,
        administrador: ctx.isAdmin,
      };
    } catch (error) {
      throw toClientError(error);
    }
  });
