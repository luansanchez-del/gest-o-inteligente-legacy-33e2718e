import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";

const PAGINA = 1000;

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

function grupoKey(v: unknown) {
  return texto(v).toLowerCase().replace(/\s+/g, " ").trim();
}

function documento(v: unknown) {
  return texto(v).replace(/\D/g, "");
}

function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = texto(v).replace(/\s/g, "");
  if (!s) return null;
  const pt = s.includes(",");
  const limpo = pt ? s.replace(/\./g, "").replace(",", ".") : s.replace(/[^0-9.-]/g, "");
  const n = Number(limpo.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function grupo(v: unknown) {
  const g = texto(v);
  if (!g || ["sem grupo definido", "[sem grupo definido]", "36"].includes(normalizar(g))) return null;
  return g;
}

function chaveCliente(input: { externalId?: string | null; document?: string | null; name: string }) {
  const doc = documento(input.document);
  if (doc) return `doc:${doc}`;
  if (input.externalId) return `pier:${input.externalId}`;
  return `nome:${normalizar(input.name)}`;
}

async function carregarTudo<T>(
  buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const out: T[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await buscar(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new AppError("INESPERADO", "Não foi possível importar a Carteira Inteligente.", error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

export type LinhaImportacao = {
  cliente?: string;
  razaoSocial?: string;
  cnpj?: string;
  documento?: string;
  responsavel?: string;
  regime?: string;
  segmento?: string;
  grupo?: string;
  status?: string;
  honorario?: string | number;
  valorBpo?: string | number;
  peso?: string | number;
  observacao?: string;
  tipoImportacao?: "HONORARIOS_GRUPOS" | "CARTEIRA_BPO" | string;
};

async function reconciliarRepassesGrupo(ctx: AppContext) {
  const atuais = await carregarTudo<any>((de, ate) => (ctx.db as any).from("portfolio_assignment")
    .select("id,group_name,official_responsible_external_id,official_responsible_name,bpo_budget,active")
    .eq("organization_id", ctx.organizationId)
    .eq("active", true)
    .range(de, ate));

  const buckets = new Map<string, any[]>();
  for (const a of atuais) {
    if (!a.group_name || !a.official_responsible_name) continue;
    const key = `${grupoKey(a.group_name)}|${normalizar(a.official_responsible_name)}`;
    const arr = buckets.get(key) ?? [];
    arr.push(a);
    buckets.set(key, arr);
  }

  const groupPayload: any[] = [];
  const clearIds: string[] = [];
  const gruposIndividuais: Array<{ groupKey: string; responsavel: string }> = [];

  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const positivos = members.filter((m) => Number(m.bpo_budget ?? 0) > 0);
    const zerados = members.filter((m) => Number(m.bpo_budget ?? 0) === 0);
    const primeiro = members[0];

    if (positivos.length === 1 && zerados.length >= 1) {
      groupPayload.push({
        organization_id: ctx.organizationId,
        group_key: grupoKey(primeiro.group_name),
        group_name: primeiro.group_name,
        responsible_external_id: primeiro.official_responsible_external_id ?? null,
        responsible_name: primeiro.official_responsible_name,
        monthly_amount: Number(positivos[0].bpo_budget),
        source: "PLANILHA_GRUPO_DETECTADO",
        active: true,
        updated_by: ctx.userId,
        created_by: ctx.userId,
      });
      clearIds.push(...members.map((m) => m.id));
    } else if (positivos.length > 1) {
      gruposIndividuais.push({
        groupKey: grupoKey(primeiro.group_name),
        responsavel: primeiro.official_responsible_name,
      });
    }
  }

  if (groupPayload.length) {
    const { error } = await (ctx.db as any).from("bpo_group_payment").upsert(groupPayload, {
      onConflict: "organization_id,group_key,responsible_name",
    });
    if (error) throw new AppError("INESPERADO", "Não foi possível consolidar os repasses BPO por grupo.", error.message);
  }

  for (let i = 0; i < clearIds.length; i += 200) {
    const { error } = await (ctx.db as any).from("portfolio_assignment")
      .update({ bpo_budget: null, updated_by: ctx.userId })
      .eq("organization_id", ctx.organizationId)
      .in("id", clearIds.slice(i, i + 200));
    if (error) throw new AppError("INESPERADO", "Não foi possível remover a duplicidade do repasse por grupo.", error.message);
  }

  for (const g of gruposIndividuais) {
    const { error } = await (ctx.db as any).from("bpo_group_payment")
      .update({ active: false, updated_by: ctx.userId })
      .eq("organization_id", ctx.organizationId)
      .eq("group_key", g.groupKey)
      .eq("responsible_name", g.responsavel);
    if (error) throw new AppError("INESPERADO", "Não foi possível atualizar a regra de repasse BPO.", error.message);
  }

  return { gruposConsolidados: groupPayload.length, clientesMovidosParaGrupo: clearIds.length };
}

export async function importarCarteiraSeguro(ctx: AppContext, rows: LinhaImportacao[]) {
  assertCanWrite(ctx);
  if (!Array.isArray(rows) || rows.length === 0)
    throw new AppError("VALIDACAO", "A planilha não possui linhas para importar.");
  if (rows.length > 5000)
    throw new AppError("VALIDACAO", "Importe no máximo 5.000 clientes por vez.");

  const [clientesPier, usuariosPier, assignments] = await Promise.all([
    carregarTudo<any>((de, ate) => ctx.db.from("pier_client")
      .select("external_id,name,document,status,tax_regime,responsible_name")
      .eq("organization_id", ctx.organizationId)
      .range(de, ate)),
    carregarTudo<any>((de, ate) => ctx.db.from("pier_user")
      .select("external_id,name,email,status,kind")
      .eq("organization_id", ctx.organizationId)
      .range(de, ate)),
    carregarTudo<any>((de, ate) => (ctx.db as any).from("portfolio_assignment")
      .select("id,client_key,client_external_id,client_document,client_name,official_responsible_external_id,official_responsible_name,tax_regime,segment,monthly_fee,monthly_fee_source,bpo_budget,complexity_points,source,notes,group_name,fee_in_group,active,created_by")
      .eq("organization_id", ctx.organizationId)
      .range(de, ate)),
  ]);

  const pierPorDoc = new Map(clientesPier.map((c: any) => [documento(c.document), c]).filter(([d]) => d));
  const pierPorNome = new Map(clientesPier.map((c: any) => [normalizar(c.name), c]));
  const userPorNome = new Map(usuariosPier.map((u: any) => [normalizar(u.name), u]));
  const aPorExt = new Map(assignments.filter((a: any) => a.client_external_id).map((a: any) => [a.client_external_id, a]));
  const aPorDoc = new Map(assignments.filter((a: any) => documento(a.client_document)).map((a: any) => [documento(a.client_document), a]));
  const aPorKey = new Map(assignments.map((a: any) => [a.client_key, a]));

  const payload: any[] = [];
  const falhas: Array<{ linha: number; motivo: string }> = [];
  let ignoradasInativas = 0;
  let financeiras = 0;
  let carteirasBpo = 0;

  rows.forEach((r, idx) => {
    const status = normalizar(r.status);
    if (status && status !== "ativo") {
      ignoradasInativas += 1;
      return;
    }

    const nome = texto(r.cliente || r.razaoSocial);
    const doc = documento(r.cnpj || r.documento);
    if (!nome && !doc) {
      falhas.push({ linha: idx + 2, motivo: "Cliente/CNPJ não informado" });
      return;
    }

    const pier = (doc && pierPorDoc.get(doc)) || pierPorNome.get(normalizar(nome)) || null;
    const nomeFinal = nome || pier?.name || doc;
    const keyCalculada = chaveCliente({ externalId: pier?.external_id, document: doc || pier?.document, name: nomeFinal });
    const existente = (pier?.external_id && aPorExt.get(pier.external_id)) || (doc && aPorDoc.get(doc)) || aPorKey.get(keyCalculada) || null;
    const financeOnly = r.tipoImportacao === "HONORARIOS_GRUPOS";
    const respNome = texto(r.responsavel);
    const usuario = respNome ? userPorNome.get(normalizar(respNome)) : null;
    const fee = numero(r.honorario);
    const bpo = numero(r.valorBpo);
    const nomeGrupo = grupo(r.grupo);
    const peso = numero(r.peso);

    if (financeOnly) financeiras += 1;
    else carteirasBpo += 1;

    payload.push({
      organization_id: ctx.organizationId,
      client_key: existente?.client_key ?? keyCalculada,
      client_external_id: pier?.external_id ?? existente?.client_external_id ?? null,
      client_document: doc || documento(pier?.document) || existente?.client_document || null,
      client_name: nomeFinal || existente?.client_name,
      official_responsible_external_id: financeOnly
        ? existente?.official_responsible_external_id ?? null
        : usuario?.external_id ?? existente?.official_responsible_external_id ?? null,
      official_responsible_name: financeOnly
        ? existente?.official_responsible_name ?? null
        : respNome || existente?.official_responsible_name || null,
      tax_regime: texto(r.regime) || existente?.tax_regime || pier?.tax_regime || null,
      segment: texto(r.segmento) || existente?.segment || null,
      monthly_fee: financeOnly ? fee ?? existente?.monthly_fee ?? null : existente?.monthly_fee ?? null,
      monthly_fee_source: financeOnly && fee != null ? "PLANILHA_FALLBACK" : existente?.monthly_fee_source ?? "PLANILHA",
      bpo_budget: financeOnly ? existente?.bpo_budget ?? null : bpo ?? existente?.bpo_budget ?? null,
      complexity_points: Math.max(0.5, Math.min(peso ?? Number(existente?.complexity_points ?? 1), 20)),
      group_name: nomeGrupo ?? existente?.group_name ?? null,
      fee_in_group: financeOnly
        ? Boolean((fee ?? Number(existente?.monthly_fee ?? 0)) === 0 && nomeGrupo)
        : Boolean(existente?.fee_in_group ?? false),
      source: existente?.source ?? (financeOnly ? "HONORARIOS_PLANILHA" : "PLANILHA_BPO"),
      notes: texto(r.observacao) || existente?.notes || null,
      active: true,
      updated_by: ctx.userId,
      created_by: existente?.created_by ?? ctx.userId,
    });
  });

  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await (ctx.db as any).from("portfolio_assignment").upsert(payload.slice(i, i + 200), {
      onConflict: "organization_id,client_key",
    });
    if (error) throw new AppError("INESPERADO", "Não foi possível importar a carteira.", error.message);
  }

  const repasses = await reconciliarRepassesGrupo(ctx);

  await audit(ctx, {
    action: "IMPORTAR_CARTEIRA_INTELIGENTE",
    entity: "portfolio_assignment",
    after: {
      recebidas: rows.length,
      importadas: payload.length,
      ignoradasInativas,
      financeiras,
      carteirasBpo,
      ...repasses,
      falhas: falhas.slice(0, 50),
    },
  });

  return {
    recebidas: rows.length,
    importadas: payload.length,
    ignoradasInativas,
    financeiras,
    carteirasBpo,
    ...repasses,
    falhas,
  };
}
