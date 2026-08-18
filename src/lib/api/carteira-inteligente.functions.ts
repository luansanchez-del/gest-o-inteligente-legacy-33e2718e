import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comContexto, emailDoToken } from "./contexto";

export const listarCarteiraInteligente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira-inteligente/carteira-inteligente.service");
      return service.listarCarteiraInteligente(ctx);
    }),
  );

export const importarCarteiraInteligente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: Array<Record<string, unknown>> }) => {
    if (!Array.isArray(input?.rows) || !input.rows.length)
      throw new Error("VALIDACAO::Nenhuma linha encontrada para importar.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira-inteligente/carteira-inteligente.service");
      return service.importarCarteira(ctx, data.rows as any[]);
    }),
  );

export const sincronizarPerfisBpoPier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira-inteligente/carteira-inteligente.service");
      return service.sincronizarPerfisPier(ctx);
    }),
  );

export const salvarPerfilBpo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    pierUserExternalId?: string | null;
    nome: string;
    email?: string | null;
    senioridade?: string | null;
    capacidade?: number;
    valorAlvo?: number | null;
    regimes?: string[];
    segmentos?: string[];
    sistemas?: string[];
    competencias?: string[];
    curriculoTexto?: string | null;
    resumoCurriculo?: string | null;
  }) => {
    if (!input?.nome?.trim()) throw new Error("VALIDACAO::Informe o nome do profissional.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira-inteligente/carteira-inteligente.service");
      return service.salvarPerfilBpo(ctx, data);
    }),
  );

export const sugerirDistribuicaoCarteira = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientKey: string }) => {
    if (!input?.clientKey) throw new Error("VALIDACAO::Cliente não informado.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira-inteligente/carteira-inteligente.service");
      return service.sugerirDistribuicao(ctx, data);
    }),
  );

export const atribuirClienteCarteira = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientKey: string; profileId: string | null }) => {
    if (!input?.clientKey) throw new Error("VALIDACAO::Cliente não informado.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/carteira-inteligente/carteira-inteligente-write.service");
      return service.atribuirClienteSeguro(ctx, data);
    }),
  );
