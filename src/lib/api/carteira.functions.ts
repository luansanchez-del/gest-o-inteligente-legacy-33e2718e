import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

type Filtros = {
  busca?: string;
  situacao?: "TODOS" | "VINCULADO" | "NAO_VINCULADO";
  status?: string;
};

export const listarCarteira = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Filtros) => input ?? {})
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira/carteira.service");
      return service.listarCarteira(ctx, data);
    }),
  );

export const sincronizarCarteira = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira/carteira.service");
      return service.sincronizarCarteira(ctx);
    }),
  );

export const diagnosticarConexaoPier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { testarConexaoPier } = await import("@/server/integrations/pier/pier.http");
    return testarConexaoPier();
  });

export const vincularCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pierClientId: string }) => {
    if (!input?.pierClientId) throw new Error("VALIDACAO::Cliente não informado.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira/carteira.service");
      return service.vincularCliente(ctx, data.pierClientId);
    }),
  );

export const desvincularCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pierClientId: string }) => {
    if (!input?.pierClientId) throw new Error("VALIDACAO::Cliente não informado.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira/carteira.service");
      return service.desvincularCliente(ctx, data.pierClientId);
    }),
  );
