import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

export const obterConfiguracoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/configuracoes/configuracoes.service");
      return service.obterConfiguracoes(ctx);
    }),
  );

export const salvarConfiguracoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      prazoDiasPadrao?: number;
      confiancaMinima?: number;
      competenciaPadrao?: string;
    }) => input ?? {},
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/configuracoes/configuracoes.service");
      return service.salvarConfiguracoes(ctx, data);
    }),
  );
