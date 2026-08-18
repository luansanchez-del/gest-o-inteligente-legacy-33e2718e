import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

type IndiceInput = {
  competenciaInicio: string;
  competenciaFim: string;
  recorte: "GERAL" | "EMPRESA" | "RESPONSAVEL" | "TIPO" | "SITUACAO";
  empresaId?: string;
  responsavel?: string;
  departamentoId?: string;
};

function validar(input: IndiceInput) {
  if (!/^\d{4}-\d{2}$/.test(input?.competenciaInicio ?? ""))
    throw new Error("VALIDACAO::Informe a competência inicial no formato AAAA-MM.");
  if (!/^\d{4}-\d{2}$/.test(input?.competenciaFim ?? ""))
    throw new Error("VALIDACAO::Informe a competência final no formato AAAA-MM.");
  if (input.competenciaInicio > input.competenciaFim)
    throw new Error("VALIDACAO::A competência inicial não pode ser posterior à final.");
  return input;
}

export const apurarIndice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validar)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/entrega/indice.service");
      return service.apurarIndice(ctx, data);
    }),
  );

export const detalharIndicador = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: IndiceInput & { codigo: string }) => {
    validar(input);
    if (!input.codigo) throw new Error("VALIDACAO::Indicador não informado.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/entrega/indice.service");
      return service.detalharIndicador(ctx, data);
    }),
  );
