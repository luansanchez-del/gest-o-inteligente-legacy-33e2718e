import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { departamentosFiscais } from "./fiscal-gestao.service";

const TIPOS_INTERNOS = new Set(["colaborador", "gestor", "encarregado"]);
const NOMES_PADRAO: Record<string, string> = {
  "16103": "TRIBUTARIO BPO",
  "9624": "TRIBUTARIO LEGACY",
};

export async function sincronizarEquipeFiscal(ctx: AppContext) {
  assertCanWrite(ctx);

  const departamentosIds = new Set(await departamentosFiscais(ctx));
  const usuariosPier = await pierAdapter.listUsers({ status: "Todos" });
  const agora = new Date().toISOString();

  const usuariosFiscais = usuariosPier.filter(
    (u) =>
      Boolean(u.departmentExternalId && departamentosIds.has(u.departmentExternalId)) &&
      TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase()),
  );

  let processados = 0;
  let falhas = 0;
  const LOTE = 250;

  for (let inicio = 0; inicio < usuariosFiscais.length; inicio += LOTE) {
    const lote = usuariosFiscais.slice(inicio, inicio + LOTE);
    const { error } = await ctx.db.from("pier_user").upsert(
      lote.map((u) => ({
        organization_id: ctx.organizationId,
        external_id: u.externalId,
        name: u.name,
        kind: u.kind,
        login: u.login,
        email: u.email,
        status: u.status,
        department_external_id: u.departmentExternalId,
        raw: u.raw as never,
        synced_at: agora,
      })),
      { onConflict: "organization_id,external_id" },
    );

    if (error) falhas += lote.length;
    else processados += lote.length;
  }

  const { data: departamentosExistentes, error: erroDepartamentos } = await ctx.db
    .from("pier_department")
    .select("external_id,name")
    .eq("organization_id", ctx.organizationId)
    .in("external_id", [...departamentosIds]);

  if (erroDepartamentos)
    throw new AppError(
      "INESPERADO",
      "Não foi possível atualizar os departamentos fiscais.",
      erroDepartamentos.message,
    );

  const nomePorId = new Map(
    (departamentosExistentes ?? []).map((d) => [d.external_id, d.name]),
  );
  const contagem = new Map<string, number>();
  for (const u of usuariosFiscais) {
    if (!u.departmentExternalId) continue;
    contagem.set(
      u.departmentExternalId,
      (contagem.get(u.departmentExternalId) ?? 0) + 1,
    );
  }

  const departamentosPayload = [...departamentosIds].map((id) => ({
    organization_id: ctx.organizationId,
    external_id: id,
    name: nomePorId.get(id) ?? NOMES_PADRAO[id] ?? `Departamento Fiscal ${id}`,
    user_count: contagem.get(id) ?? 0,
    synced_at: agora,
  }));

  if (departamentosPayload.length) {
    const { error } = await ctx.db.from("pier_department").upsert(departamentosPayload, {
      onConflict: "organization_id,external_id",
    });
    if (error)
      throw new AppError(
        "INESPERADO",
        "Não foi possível atualizar os departamentos fiscais.",
        error.message,
      );
  }

  await audit(ctx, {
    action: "SINCRONIZAR_EQUIPE_FISCAL",
    entity: "pier_user",
    after: {
      departamentos: [...departamentosIds],
      usuariosFiscais: usuariosFiscais.length,
      processados,
      falhas,
      regra: "TRIBUTARIO BPO + TRIBUTARIO LEGACY",
    },
  });

  return {
    totalFiscal: usuariosFiscais.length,
    processados,
    falhas,
    departamentos: departamentosPayload.map((d) => ({
      id: d.external_id,
      nome: d.name,
      totalUsuarios: d.user_count,
    })),
  };
}
