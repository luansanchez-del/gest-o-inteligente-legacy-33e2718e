import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";

function doc(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

async function localizarClientePier(ctx: AppContext, clientKey: string) {
  if (clientKey.startsWith("pier:")) {
    const externalId = clientKey.slice(5);
    const { data } = await ctx.db.from("pier_client")
      .select("external_id,name,document,tax_regime")
      .eq("organization_id", ctx.organizationId)
      .eq("external_id", externalId)
      .maybeSingle();
    return data ?? null;
  }

  const alvoDoc = clientKey.startsWith("doc:") ? clientKey.slice(4) : null;
  if (!alvoDoc) return null;
  for (let p = 0; p < 10; p++) {
    const { data, error } = await ctx.db.from("pier_client")
      .select("external_id,name,document,tax_regime")
      .eq("organization_id", ctx.organizationId)
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new AppError("INESPERADO", "Não foi possível localizar o cliente no PIER.", error.message);
    const encontrado = (data ?? []).find((c) => doc(c.document) === alvoDoc);
    if (encontrado) return encontrado;
    if (!data || data.length < 1000) break;
  }
  return null;
}

export async function atribuirClienteSeguro(
  ctx: AppContext,
  input: { clientKey: string; profileId: string | null },
) {
  assertCanWrite(ctx);

  let responsavel: { id: string; pier_user_external_id: string | null; name: string } | null = null;
  if (input.profileId) {
    const { data, error } = await (ctx.db as any).from("bpo_profile")
      .select("id,pier_user_external_id,name")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.profileId)
      .maybeSingle();
    if (error || !data) throw new AppError("VALIDACAO", "Perfil BPO não encontrado.");
    responsavel = data;
  }

  const db = ctx.db as any;
  const { data: existente, error: existingError } = await db.from("portfolio_assignment")
    .select("id,client_key")
    .eq("organization_id", ctx.organizationId)
    .eq("client_key", input.clientKey)
    .maybeSingle();
  if (existingError) throw new AppError("INESPERADO", "Não foi possível consultar a carteira.", existingError.message);

  if (existente) {
    const { error } = await db.from("portfolio_assignment").update({
      official_responsible_external_id: responsavel?.pier_user_external_id ?? null,
      official_responsible_name: responsavel?.name ?? null,
      source: "GESTOR",
      updated_by: ctx.userId,
    }).eq("organization_id", ctx.organizationId).eq("id", existente.id);
    if (error) throw new AppError("INESPERADO", "Não foi possível atualizar a distribuição.", error.message);
  } else {
    const pier = await localizarClientePier(ctx, input.clientKey);
    if (!pier) throw new AppError("VALIDACAO", "Cliente não localizado no catálogo PIER. Importe a planilha para criar a carteira deste cliente.");
    const { error } = await db.from("portfolio_assignment").insert({
      organization_id: ctx.organizationId,
      client_key: input.clientKey,
      client_external_id: pier.external_id,
      client_document: doc(pier.document) || null,
      client_name: pier.name,
      tax_regime: pier.tax_regime,
      official_responsible_external_id: responsavel?.pier_user_external_id ?? null,
      official_responsible_name: responsavel?.name ?? null,
      complexity_points: 1,
      source: "GESTOR",
      active: true,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
    if (error) throw new AppError("INESPERADO", "Não foi possível criar a distribuição do cliente.", error.message);
  }

  await audit(ctx, {
    action: "ATRIBUIR_CARTEIRA",
    entity: "portfolio_assignment",
    entityId: input.clientKey,
    after: {
      profileId: input.profileId,
      responsavel: responsavel?.name ?? null,
      alteraPier: false,
    },
  });
  return { ok: true, responsavel: responsavel?.name ?? null };
}
