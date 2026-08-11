import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

export interface LinhaImportacaoEquipe {
  nome: string;
  tipo?: string | null;
  email?: string | null;
  departamento?: string | null;
  status?: string | null;
}

function validarLinhas(input: { rows: LinhaImportacaoEquipe[] }) {
  if (!input?.rows?.length) throw new Error("VALIDACAO::Nenhuma linha encontrada na planilha.");
  if (input.rows.length > 5000)
    throw new Error("VALIDACAO::A planilha excede o limite de 5.000 linhas.");
  return {
    rows: input.rows.map((r) => ({
      nome: String(r.nome ?? "").trim(),
      tipo: r.tipo ? String(r.tipo).trim() : null,
      email: r.email ? String(r.email).trim() : null,
      departamento: r.departamento ? String(r.departamento).trim() : null,
      status: r.status ? String(r.status).trim() : null,
    })),
  };
}

export const listarEquipeCompleta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/equipe.service");
      return service.listarEquipeCompleta(ctx);
    }),
  );

export const previsualizarImportacaoEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarLinhas)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/equipe.service");
      return service.previsualizarImportacaoEquipe(ctx, data.rows);
    }),
  );

export const aplicarImportacaoEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarLinhas)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/gestao/equipe.service");
      return service.aplicarImportacaoEquipe(ctx, data.rows);
    }),
  );
