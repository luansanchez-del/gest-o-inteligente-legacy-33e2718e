import { audit } from "../../lib/audit";
import { assertAdmin, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";

export interface Configuracoes {
  prazoDiasPadrao: number;
  confiancaMinima: number;
  competenciaPadrao: string;
}

const PADRAO: Configuracoes = {
  prazoDiasPadrao: 20,
  confiancaMinima: 0.8,
  competenciaPadrao: new Date().toISOString().slice(0, 7),
};

export async function obterConfiguracoes(ctx: AppContext) {
  const { data } = await ctx.db
    .from("app_setting")
    .select("key, value")
    .eq("organization_id", ctx.organizationId);

  const mapa = new Map((data ?? []).map((s) => [s.key, s.value as unknown]));
  const configuracoes: Configuracoes = {
    prazoDiasPadrao: Number(mapa.get("prazoDiasPadrao") ?? PADRAO.prazoDiasPadrao),
    confiancaMinima: Number(mapa.get("confiancaMinima") ?? PADRAO.confiancaMinima),
    competenciaPadrao: String(mapa.get("competenciaPadrao") ?? PADRAO.competenciaPadrao),
  };

  const status = await pierAdapter.status();
  const { data: credencial } = await ctx.db
    .from("integration_credential_ref")
    .select("integration, secret_name, configured, last_checked_at")
    .eq("organization_id", ctx.organizationId);

  return {
    configuracoes,
    integracoes: (credencial ?? []).map((c) => ({
      integracao: c.integration,
      // Apenas o NOME da credencial. O valor nunca sai do servidor.
      nomeDoSegredo: c.secret_name,
      configurada: c.integration === "PIER" ? status.available : c.configured,
      motivo: c.integration === "PIER" ? (status.reason ?? null) : null,
      verificadaEm: c.last_checked_at,
    })),
    organizacao: { id: ctx.organizationId, nome: ctx.organizationName },
    papeis: ctx.roles,
  };
}

export async function salvarConfiguracoes(ctx: AppContext, input: Partial<Configuracoes>) {
  assertAdmin(ctx);

  const entradas = Object.entries(input).filter(([, value]) => value !== undefined);
  for (const [key, value] of entradas) {
    const { error } = await ctx.db.from("app_setting").upsert(
      {
        organization_id: ctx.organizationId,
        key,
        value: value as never,
      },
      { onConflict: "organization_id,key" },
    );
    if (error)
      throw new AppError("INESPERADO", "Não foi possível salvar as configurações.", error.message);
  }

  await audit(ctx, { action: "SALVAR_CONFIGURACOES", entity: "app_setting", after: input });
  return { ok: true };
}
