import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

/**
 * A carteira do PIER é catálogo de leitura. As antigas rotas de vínculo
 * (previsualizarVinculoAutomatico, vincularCarteiraAutomaticamente, vincularCliente,
 * vincularClientesEmLote, desvincularCliente) foram REMOVIDAS de propósito:
 * chamadas por URL antiga passam a falhar, e nada aqui escreve em company/company_pier_link.
 */

type Filtros = {
  busca?: string;
  status?: string;
  regime?: string;
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

export const listarSolicitacoesDoCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientExternalId?: string | null; documento?: string | null }) => {
    if (!input?.clientExternalId && !input?.documento)
      throw new Error("VALIDACAO::Informe o cliente do PIER ou o CNPJ/CPF.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira/carteira.service");
      return service.listarSolicitacoesDoCliente(ctx, data);
    }),
  );

export const diagnosticarConexaoPier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { testarConexaoPier } = await import("@/server/integrations/pier/pier.http");
    return testarConexaoPier();
  });
