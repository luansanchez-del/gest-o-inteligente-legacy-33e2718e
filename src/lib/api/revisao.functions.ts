import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

export const listarFilaRevisao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/revisao/revisao.service");
      return service.listarFilaRevisao(ctx);
    }),
  );

export const decidirRevisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tarefaId: string; decisao: "APPROVED" | "RETURNED" | "IGNORED"; notas?: string }) => {
      if (!input?.tarefaId || !input?.decisao)
        throw new Error("VALIDACAO::Informe a tarefa e a decisão.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/revisao/revisao.service");
      return service.decidirRevisao(ctx, data);
    }),
  );
