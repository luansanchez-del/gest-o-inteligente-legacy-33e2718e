import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { comContexto, emailDoToken } from "./contexto";

const COMPETENCIA = /^\d{4}-\d{2}$/;

function validarFiltro(input: {
  competencia: string;
  competenciaFim?: string | null;
  revisaoCompetencia?: boolean;
  departamentoId?: string | null;
  responsavelId?: string | null;
  categoria?:
    | "TODAS"
    | "ICMS"
    | "SPED_ICMS_IPI"
    | "ISS"
    | "PIS_COFINS"
    | "SPED_CONTRIBUICOES"
    | "IRPJ_CSLL"
    | "SIMPLES_DAS"
    | "OUTRA"
    | null;
  statusPier?: "PENDENTES" | "FINALIZADAS" | "TODOS" | null;
  statusResposta?:
    | "TODAS"
    | "SEM_RESPOSTA"
    | "RESPONDIDAS"
    | "NAO_VERIFICADAS"
    | null;
  statusValidacao?:
    | "TODOS"
    | "NAO_VALIDADA"
    | "DOCUMENTOS_OK_REVISAR"
    | "BLOQUEADA"
    | "REVISAO_HUMANA"
    | "ERRO"
    | null;
  anexo?: "COM_ANEXO" | "SEM_ANEXO" | null;
  busca?: string | null;
}) {
  if (!input?.revisaoCompetencia && !COMPETENCIA.test(input?.competencia ?? ""))
    throw new Error("VALIDACAO::Informe a competência no formato AAAA-MM.");
  if (input.competenciaFim && !COMPETENCIA.test(input.competenciaFim))
    throw new Error("VALIDACAO::Informe a competência final no formato AAAA-MM.");
  return input;
}

export const listarEquipeFiscal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal.service");
      return service.listarEquipeFiscal(ctx);
    }),
  );

export const sincronizarSolicitacoesFiscais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: { statusPier?: "PENDENTES" | "FINALIZADAS" | "TODOS" }) =>
      input ?? {},
  )
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal.service");
      return service.sincronizarSolicitacoesFiscais(ctx, data);
    }),
  );

export const montarPainelFiscal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validarFiltro)
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal.service");
      return service.montarPainelFiscal(ctx, data);
    }),
  );

export const validarSolicitacoesFiscais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacoes: string[] }) => {
    const solicitacoes = [
      ...new Set((input?.solicitacoes ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    if (!solicitacoes.length)
      throw new Error("VALIDACAO::Selecione ao menos uma solicitação fiscal.");
    if (solicitacoes.length > 100)
      throw new Error("VALIDACAO::Valide no máximo 100 solicitações por lote.");
    return { solicitacoes };
  })
  .handler(async ({ data, context }) =>
    comContexto(context.userId, emailDoToken(context.claims), async (ctx) => {
      const service = await import("@/server/domain/fiscal/fiscal.service");
      return service.validarSolicitacoesFiscais(ctx, data);
    }),
  );
