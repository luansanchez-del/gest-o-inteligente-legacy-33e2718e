import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

type Filtros = {
  busca?: string;
  situacao?: "TODOS" | "VINCULADO" | "NAO_VINCULADO" | "REVISAO";
  status?: string;
  regime?: string;
};

export const previsualizarVinculoAutomatico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira/carteira.service");
      return service.previsualizarVinculoAutomatico(ctx);
    }),
  );

export const vincularCarteiraAutomaticamente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira/carteira.service");
      return service.vincularCarteiraAutomaticamente(ctx);
    }),
  );


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

export const vincularClientesEmLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pierClientIds: string[] }) => {
    if (!input?.pierClientIds?.length) throw new Error("VALIDACAO::Nenhum cliente selecionado.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira/carteira.service");
      return service.vincularClientesEmLote(ctx, data.pierClientIds);
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
