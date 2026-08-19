import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";

const PAGINA = 1000;
const DEPARTAMENTOS_PERMITIDOS = new Set([
  "contabilidade legacy",
  "contabilidade bpo",
]);

function texto(v: unknown) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function normalizar(v: unknown) {
  return texto(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function carregarTudo<T>(
  buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const out: T[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await buscar(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new AppError("INESPERADO", "Não foi possível sincronizar os BPO CB do PIER.", error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

export async function sincronizarSomenteBpoCb(ctx: AppContext) {
  assertCanWrite(ctx);

  const [departamentos, usuarios, perfisPierAtivos] = await Promise.all([
    carregarTudo<any>((de, ate) => ctx.db.from("pier_department")
      .select("external_id,name")
      .eq("organization_id", ctx.organizationId)
      .range(de, ate)),
    carregarTudo<any>((de, ate) => ctx.db.from("pier_user")
      .select("external_id,name,email,status,kind,department_external_id")
      .eq("organization_id", ctx.organizationId)
      .range(de, ate)),
    carregarTudo<any>((de, ate) => ctx.db.from("bpo_profile")
      .select("id,pier_user_external_id,name,active")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .range(de, ate)),
  ]);

  const departamentosPermitidos = new Set(
    departamentos
      .filter((d: any) => DEPARTAMENTOS_PERMITIDOS.has(normalizar(d.name)))
      .map((d: any) => String(d.external_id)),
  );

  if (!departamentosPermitidos.size) {
    throw new AppError(
      "VALIDACAO",
      "Os departamentos CONTABILIDADE LEGACY e CONTABILIDADE BPO não foram localizados no cache do PIER.",
    );
  }

  const selecionados = usuarios.filter((u: any) => {
    const nome = normalizar(u.name);
    const status = normalizar(u.status);
    const departamento = u.department_external_id == null ? "" : String(u.department_external_id);
    return status === "ativo"
      && departamentosPermitidos.has(departamento)
      && nome.startsWith("bpo cb ")
      && !nome.includes("mayana");
  });

  const idsSelecionados = new Set(selecionados.map((u: any) => String(u.external_id)));
  const perfisParaDesativar = perfisPierAtivos
    .filter((p: any) => p.pier_user_external_id && !idsSelecionados.has(String(p.pier_user_external_id)))
    .map((p: any) => p.id);

  for (let i = 0; i < perfisParaDesativar.length; i += 200) {
    const { error } = await ctx.db.from("bpo_profile")
      .update({ active: false, updated_by: ctx.userId })
      .eq("organization_id", ctx.organizationId)
      .in("id", perfisParaDesativar.slice(i, i + 200));
    if (error) throw new AppError("INESPERADO", "Não foi possível retirar perfis que não são BPO CB.", error.message);
  }

  const payload = selecionados.map((u: any) => ({
    organization_id: ctx.organizationId,
    profile_key: `pier:${u.external_id}`,
    pier_user_external_id: u.external_id,
    name: u.name,
    email: u.email,
    active: true,
    updated_by: ctx.userId,
    created_by: ctx.userId,
  }));

  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await ctx.db.from("bpo_profile").upsert(payload.slice(i, i + 200), {
      onConflict: "organization_id,profile_key",
      ignoreDuplicates: false,
    });
    if (error) throw new AppError("INESPERADO", "Não foi possível trazer os BPO CB do PIER.", error.message);
  }

  await audit(ctx, {
    action: "SINCRONIZAR_BPO_CB_PIER",
    entity: "bpo_profile",
    after: {
      total: payload.length,
      desativados: perfisParaDesativar.length,
      departamentos: Array.from(departamentosPermitidos),
      regra: "Somente BPO CB ativos de CONTABILIDADE LEGACY/CONTABILIDADE BPO; Mayana excluída",
    },
  });

  return {
    total: payload.length,
    desativados: perfisParaDesativar.length,
    nomes: selecionados.map((u: any) => u.name),
  };
}
