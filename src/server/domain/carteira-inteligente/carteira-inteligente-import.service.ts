import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { localizarPerfilBpo } from "./bpo-name-match";

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

export async function importarCarteiraSeguro(ctx: AppContext, rows: LinhaImportacao[]) {
  assertCanWrite(ctx);
  if (!Array.isArray(rows) || rows.length === 0)
    throw new AppError("VALIDACAO", "A planilha não possui linhas para importar.");
  if (rows.length > 5000)
    throw new AppError("VALIDACAO", "Importe no máximo 5.000 clientes por vez.");

  const [clientesPier, perfisBpo, assignments] = await Promise.all([
    carregarTudo<any>((de, ate) => ctx.db.from("pier_client")
      .select("external_id,name,document,status,tax_regime,responsible_name")
      .eq("organization_id", ctx.organizationId)
      .range(de, ate)),
    carregarTudo<any>((de, ate) => ctx.db.from("bpo_profile")
      .select("id,pier_user_external_id,name,email,active")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .range(de, ate)),
    carregarTudo<any>((de, ate) => (ctx.db as any).from("portfolio_assignment")
      .select("id,client_key,client_external_id,client_document,client_name,official_responsible_external_id,official_responsible_name,tax_regime,segment,monthly_fee,bpo_budget,complexity_points,source,notes,group_name,fee_in_group,active")
      .eq("organization_id", ctx.organizationId)
      .range(de, ate)),
  ]);

  const pierPorDoc = new Map(clientesPier.map((c: any) => [documento(c.document), c] as [any, any]).filter(([d]) => d));
  const pierPorNome = new Map(clientesPier.map((c: any) => [normalizar(c.name), c]));
  const aPorExt = new Map(assignments.filter((a: any) => a.client_external_id).map((a: any) => [a.client_external_id, a]));
  const aPorDoc = new Map(assignments.filter((a: any) => documento(a.client_document)).map((a: any) => [documento(a.client_document), a]));
  const aPorKey = new Map(assignments.map((a: any) => [a.client_key, a]));

  const payload: any[] = [];
  const falhas: Array<{ linha: number; motivo: string }> = [];
  let ignoradasInativas = 0;
  let financeiras = 0;
  let carteirasBpo = 0;
  let responsaveisNormalizados = 0;
  let responsaveisNaoLocalizados = 0;

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
    const respNomePlanilha = texto(r.responsavel);
    const perfilBpo = !financeOnly && respNomePlanilha ? localizarPerfilBpo(perfisBpo, respNomePlanilha) : null;
    const fee = numero(r.honorario);
    const bpo = numero(r.valorBpo);
    const nomeGrupo = grupo(r.grupo);
    const peso = numero(r.peso);

    if (financeOnly) financeiras += 1;
    else carteirasBpo += 1;

    if (!financeOnly && respNomePlanilha) {
      if (perfilBpo) responsaveisNormalizados += 1;
      else responsaveisNaoLocalizados += 1;
    }

    const responsavelExternalId = financeOnly
      ? existente?.official_responsible_external_id ?? null
      : perfilBpo?.pier_user_external_id ?? (respNomePlanilha ? null : existente?.official_responsible_external_id ?? null);
    const responsavelNome = financeOnly
      ? existente?.official_responsible_name ?? null
      : perfilBpo?.name ?? (respNomePlanilha || existente?.official_responsible_name || null);

    payload.push({
      organization_id: ctx.organizationId,
      client_key: existente?.client_key ?? keyCalculada,
      client_external_id: pier?.external_id ?? existente?.client_external_id ?? null,
      client_document: doc || documento(pier?.document) || existente?.client_document || null,
      client_name: nomeFinal || existente?.client_name,
      official_responsible_external_id: responsavelExternalId,
      official_responsible_name: responsavelNome,
      tax_regime: texto(r.regime) || existente?.tax_regime || pier?.tax_regime || null,
      segment: texto(r.segmento) || existente?.segment || null,
      monthly_fee: fee ?? existente?.monthly_fee ?? null,
      bpo_budget: financeOnly ? existente?.bpo_budget ?? null : bpo ?? existente?.bpo_budget ?? null,
      complexity_points: Math.max(0.5, Math.min(peso ?? Number(existente?.complexity_points ?? 1), 20)),
      group_name: nomeGrupo ?? existente?.group_name ?? null,
      fee_in_group: financeOnly
        ? Boolean((fee ?? Number(existente?.monthly_fee ?? 0)) === 0 && nomeGrupo)
        : Boolean(existente?.fee_in_group ?? false),
      source: financeOnly ? "HONORARIOS_PLANILHA" : "PLANILHA_BPO",
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

  await audit(ctx, {
    action: "IMPORTAR_CARTEIRA_INTELIGENTE",
    entity: "portfolio_assignment",
    after: {
      recebidas: rows.length,
      importadas: payload.length,
      ignoradasInativas,
      financeiras,
      carteirasBpo,
      responsaveisNormalizados,
      responsaveisNaoLocalizados,
      regraResponsavel: "Para CARTEIRA_BPO, a planilha é a fonte oficial do responsável; o PIER é apenas referência cadastral.",
      falhas: falhas.slice(0, 50),
    },
  });

  return {
    recebidas: rows.length,
    importadas: payload.length,
    ignoradasInativas,
    financeiras,
    carteirasBpo,
    responsaveisNormalizados,
    responsaveisNaoLocalizados,
    falhas,
  };
}
