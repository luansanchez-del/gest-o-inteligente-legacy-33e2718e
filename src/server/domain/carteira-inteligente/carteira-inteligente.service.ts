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

function lista(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(texto).filter(Boolean);
  return texto(v)
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function carregarTudo<T>(
  buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const out: T[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await buscar(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new AppError("INESPERADO", "Não foi possível carregar a Carteira Inteligente.", error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

function chaveCliente(input: { externalId?: string | null; document?: string | null; name: string }) {
  const doc = documento(input.document);
  if (doc) return `doc:${doc}`;
  if (input.externalId) return `pier:${input.externalId}`;
  return `nome:${normalizar(input.name)}`;
}

export type LinhaImportacaoCarteira = {
  cliente?: string;
  razaoSocial?: string;
  cnpj?: string;
  documento?: string;
  responsavel?: string;
  regime?: string;
  segmento?: string;
  honorario?: string | number;
  valorBpo?: string | number;
  peso?: string | number;
  observacao?: string;
};

export async function importarCarteira(ctx: AppContext, rows: LinhaImportacaoCarteira[]) {
  assertCanWrite(ctx);
  if (!Array.isArray(rows) || rows.length === 0)
    throw new AppError("VALIDACAO", "A planilha não possui linhas para importar.");
  if (rows.length > 5000)
    throw new AppError("VALIDACAO", "Importe no máximo 5.000 clientes por vez.");

  const [clientesPier, usuariosPier] = await Promise.all([
    carregarTudo<any>((de, ate) =>
      ctx.db.from("pier_client")
        .select("external_id,name,document,tax_regime,responsible_name")
        .eq("organization_id", ctx.organizationId).range(de, ate),
    ),
    carregarTudo<any>((de, ate) =>
      ctx.db.from("pier_user")
        .select("external_id,name,email,status,kind")
        .eq("organization_id", ctx.organizationId).range(de, ate),
    ),
  ]);

  const pierPorDoc = new Map(clientesPier.map((c: any) => [documento(c.document), c]).filter(([d]) => d));
  const pierPorNome = new Map(clientesPier.map((c: any) => [normalizar(c.name), c]));
  const userPorNome = new Map(usuariosPier.map((u: any) => [normalizar(u.name), u]));

  const payload: any[] = [];
  const falhas: Array<{ linha: number; motivo: string }> = [];

  rows.forEach((r, idx) => {
    const nome = texto(r.cliente || r.razaoSocial);
    const doc = documento(r.cnpj || r.documento);
    if (!nome && !doc) {
      falhas.push({ linha: idx + 2, motivo: "Cliente/CNPJ não informado" });
      return;
    }
    const pier = (doc && pierPorDoc.get(doc)) || pierPorNome.get(normalizar(nome)) || null;
    const nomeFinal = nome || pier?.name || doc;
    const respNome = texto(r.responsavel);
    const usuario = respNome ? userPorNome.get(normalizar(respNome)) : null;
    const fee = numero(r.honorario);
    const bpo = numero(r.valorBpo);
    const peso = numero(r.peso) ?? 1;
    payload.push({
      organization_id: ctx.organizationId,
      client_key: chaveCliente({ externalId: pier?.external_id, document: doc || pier?.document, name: nomeFinal }),
      client_external_id: pier?.external_id ?? null,
      client_document: doc || documento(pier?.document) || null,
      client_name: nomeFinal,
      official_responsible_external_id: usuario?.external_id ?? null,
      official_responsible_name: respNome || null,
      tax_regime: texto(r.regime) || pier?.tax_regime || null,
      segment: texto(r.segmento) || null,
      monthly_fee: fee,
      bpo_budget: bpo,
      complexity_points: Math.max(0.5, Math.min(peso, 20)),
      source: "PLANILHA",
      notes: texto(r.observacao) || null,
      active: true,
      updated_by: ctx.userId,
      created_by: ctx.userId,
    });
  });

  for (let i = 0; i < payload.length; i += 250) {
    const { error } = await ctx.db.from("portfolio_assignment").upsert(payload.slice(i, i + 250), {
      onConflict: "organization_id,client_key",
    });
    if (error) throw new AppError("INESPERADO", "Não foi possível importar a carteira.", error.message);
  }

  await audit(ctx, {
    action: "IMPORTAR_CARTEIRA_INTELIGENTE",
    entity: "portfolio_assignment",
    after: { recebidas: rows.length, importadas: payload.length, falhas: falhas.slice(0, 50) },
  });
  return { recebidas: rows.length, importadas: payload.length, falhas };
}

export async function sincronizarPerfisPier(ctx: AppContext) {
  assertCanWrite(ctx);
  const usuarios = await carregarTudo<any>((de, ate) =>
    ctx.db.from("pier_user")
      .select("external_id,name,email,status,kind")
      .eq("organization_id", ctx.organizationId).range(de, ate),
  );
  const internos = usuarios.filter((u: any) => {
    const kind = normalizar(u.kind);
    const status = normalizar(u.status);
    return ["colaborador", "encarregado", "gestor"].includes(kind) && (!status || status === "ativo");
  });
  const payload = internos.map((u: any) => ({
    organization_id: ctx.organizationId,
    profile_key: `pier:${u.external_id}`,
    pier_user_external_id: u.external_id,
    name: u.name,
    email: u.email,
    active: true,
    updated_by: ctx.userId,
    created_by: ctx.userId,
  }));
  for (let i = 0; i < payload.length; i += 250) {
    const { error } = await ctx.db.from("bpo_profile").upsert(payload.slice(i, i + 250), {
      onConflict: "organization_id,profile_key",
      ignoreDuplicates: false,
    });
    if (error) throw new AppError("INESPERADO", "Não foi possível trazer a equipe do PIER.", error.message);
  }
  await audit(ctx, { action: "SINCRONIZAR_PERFIS_BPO", entity: "bpo_profile", after: { total: payload.length } });
  return { total: payload.length };
}

export async function salvarPerfilBpo(ctx: AppContext, input: {
  id?: string;
  pierUserExternalId?: string | null;
  nome: string;
  email?: string | null;
  senioridade?: string | null;
  capacidade?: number;
  valorAlvo?: number | null;
  regimes?: string[];
  segmentos?: string[];
  sistemas?: string[];
  competencias?: string[];
  curriculoTexto?: string | null;
  resumoCurriculo?: string | null;
}) {
  assertCanWrite(ctx);
  const nome = texto(input.nome);
  if (!nome) throw new AppError("VALIDACAO", "Informe o nome do profissional.");
  const profileKey = input.pierUserExternalId ? `pier:${input.pierUserExternalId}` : `nome:${normalizar(nome)}`;
  const row = {
    organization_id: ctx.organizationId,
    profile_key: profileKey,
    pier_user_external_id: input.pierUserExternalId || null,
    name: nome,
    email: texto(input.email) || null,
    seniority: texto(input.senioridade) || null,
    max_capacity_points: Math.max(1, Number(input.capacidade ?? 60)),
    target_monthly_value: input.valorAlvo == null ? null : Math.max(0, Number(input.valorAlvo)),
    tax_regimes: lista(input.regimes),
    sectors: lista(input.segmentos),
    systems: lista(input.sistemas),
    skills: lista(input.competencias),
    curriculum_text: texto(input.curriculoTexto) || null,
    curriculum_summary: texto(input.resumoCurriculo) || null,
    active: true,
    updated_by: ctx.userId,
    created_by: ctx.userId,
  };
  const { data, error } = await ctx.db.from("bpo_profile").upsert(row, {
    onConflict: "organization_id,profile_key",
  }).select("id").single();
  if (error) throw new AppError("INESPERADO", "Não foi possível salvar o perfil BPO.", error.message);
  await audit(ctx, { action: "SALVAR_PERFIL_BPO", entity: "bpo_profile", entityId: data.id, after: { nome, profileKey } });
  return { id: data.id };
}

export async function atribuirCliente(ctx: AppContext, input: { clientKey: string; profileId: string | null }) {
  assertCanWrite(ctx);
  let responsavel: any = null;
  if (input.profileId) {
    const { data, error } = await ctx.db.from("bpo_profile")
      .select("id,pier_user_external_id,name")
      .eq("organization_id", ctx.organizationId).eq("id", input.profileId).maybeSingle();
    if (error || !data) throw new AppError("VALIDACAO", "Perfil BPO não encontrado.");
    responsavel = data;
  }
  const { error } = await ctx.db.from("portfolio_assignment").update({
    official_responsible_external_id: responsavel?.pier_user_external_id ?? null,
    official_responsible_name: responsavel?.name ?? null,
    source: "GESTOR",
    updated_by: ctx.userId,
  }).eq("organization_id", ctx.organizationId).eq("client_key", input.clientKey);
  if (error) throw new AppError("INESPERADO", "Não foi possível atualizar a distribuição.", error.message);
  await audit(ctx, { action: "ATRIBUIR_CARTEIRA", entity: "portfolio_assignment", entityId: input.clientKey, after: { profileId: input.profileId, responsavel: responsavel?.name ?? null } });
  return { ok: true };
}

export async function listarCarteiraInteligente(ctx: AppContext) {
  const [clientesPier, assignments, profiles] = await Promise.all([
    carregarTudo<any>((de, ate) => ctx.db.from("pier_client")
      .select("external_id,name,document,status,tax_regime,responsible_name,synced_at")
      .eq("organization_id", ctx.organizationId).range(de, ate)),
    carregarTudo<any>((de, ate) => ctx.db.from("portfolio_assignment")
      .select("id,client_key,client_external_id,client_document,client_name,official_responsible_external_id,official_responsible_name,tax_regime,segment,monthly_fee,bpo_budget,complexity_points,source,notes,active,updated_at")
      .eq("organization_id", ctx.organizationId).eq("active", true).range(de, ate)),
    carregarTudo<any>((de, ate) => ctx.db.from("bpo_profile")
      .select("id,profile_key,pier_user_external_id,name,email,seniority,max_capacity_points,target_monthly_value,tax_regimes,sectors,systems,skills,curriculum_summary,active,updated_at")
      .eq("organization_id", ctx.organizationId).eq("active", true).range(de, ate)),
  ]);

  const aPorExt = new Map(assignments.filter((a: any) => a.client_external_id).map((a: any) => [a.client_external_id, a]));
  const aPorDoc = new Map(assignments.filter((a: any) => documento(a.client_document)).map((a: any) => [documento(a.client_document), a]));
  const usados = new Set<string>();
  const linhas = clientesPier.map((p: any) => {
    const a = aPorExt.get(p.external_id) || aPorDoc.get(documento(p.document)) || null;
    if (a) usados.add(a.id);
    const key = a?.client_key ?? chaveCliente({ externalId: p.external_id, document: p.document, name: p.name });
    return {
      clientKey: key,
      externalId: p.external_id,
      nome: p.name,
      documento: p.document,
      statusPier: p.status,
      regime: a?.tax_regime ?? p.tax_regime,
      segmento: a?.segment ?? null,
      responsavelPier: p.responsible_name ?? null,
      responsavelCarteira: a?.official_responsible_name ?? null,
      responsavelCarteiraId: a?.official_responsible_external_id ?? null,
      honorario: a?.monthly_fee == null ? null : Number(a.monthly_fee),
      valorBpo: a?.bpo_budget == null ? null : Number(a.bpo_budget),
      peso: Number(a?.complexity_points ?? 1),
      source: a?.source ?? "PIER",
      divergencia: Boolean(a?.official_responsible_name && normalizar(a.official_responsible_name) !== normalizar(p.responsible_name)),
      semCarteira: !a?.official_responsible_name,
    };
  });
  for (const a of assignments) {
    if (usados.has(a.id)) continue;
    linhas.push({
      clientKey: a.client_key,
      externalId: a.client_external_id,
      nome: a.client_name,
      documento: a.client_document,
      statusPier: null,
      regime: a.tax_regime,
      segmento: a.segment,
      responsavelPier: null,
      responsavelCarteira: a.official_responsible_name,
      responsavelCarteiraId: a.official_responsible_external_id,
      honorario: a.monthly_fee == null ? null : Number(a.monthly_fee),
      valorBpo: a.bpo_budget == null ? null : Number(a.bpo_budget),
      peso: Number(a.complexity_points ?? 1),
      source: a.source,
      divergencia: false,
      semCarteira: !a.official_responsible_name,
    });
  }

  const cargaPorNome = new Map<string, { clientes: number; pontos: number; honorarios: number; bpo: number }>();
  for (const l of linhas) {
    if (!l.responsavelCarteira) continue;
    const k = normalizar(l.responsavelCarteira);
    const c = cargaPorNome.get(k) ?? { clientes: 0, pontos: 0, honorarios: 0, bpo: 0 };
    c.clientes += 1; c.pontos += l.peso; c.honorarios += l.honorario ?? 0; c.bpo += l.valorBpo ?? 0;
    cargaPorNome.set(k, c);
  }
  const perfis = profiles.map((p: any) => {
    const c = cargaPorNome.get(normalizar(p.name)) ?? { clientes: 0, pontos: 0, honorarios: 0, bpo: 0 };
    const capacidade = Number(p.max_capacity_points ?? 60);
    return {
      id: p.id,
      pierUserExternalId: p.pier_user_external_id,
      nome: p.name,
      email: p.email,
      senioridade: p.seniority,
      capacidade,
      pontosUsados: c.pontos,
      utilizacao: capacidade > 0 ? Math.round((c.pontos / capacidade) * 100) : 0,
      clientes: c.clientes,
      honorarios: c.honorarios,
      valorBpo: c.bpo,
      regimes: Array.isArray(p.tax_regimes) ? p.tax_regimes : [],
      segmentos: Array.isArray(p.sectors) ? p.sectors : [],
      sistemas: Array.isArray(p.systems) ? p.systems : [],
      competencias: Array.isArray(p.skills) ? p.skills : [],
      resumoCurriculo: p.curriculum_summary,
    };
  });

  const totalHonorarios = linhas.reduce((s, l) => s + (l.honorario ?? 0), 0);
  const totalBpo = linhas.reduce((s, l) => s + (l.valorBpo ?? 0), 0);
  return {
    resumo: {
      clientes: linhas.length,
      comCarteira: linhas.filter((l) => !l.semCarteira).length,
      semCarteira: linhas.filter((l) => l.semCarteira).length,
      divergenciasPier: linhas.filter((l) => l.divergencia).length,
      honorarios: totalHonorarios,
      valorBpo: totalBpo,
      margemBrutaCarteira: totalHonorarios - totalBpo,
      perfisBpo: perfis.length,
    },
    linhas: linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    perfis: perfis.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

export async function sugerirDistribuicao(ctx: AppContext, input: { clientKey: string }) {
  const dados = await listarCarteiraInteligente(ctx);
  const cliente = dados.linhas.find((l) => l.clientKey === input.clientKey);
  if (!cliente) throw new AppError("VALIDACAO", "Cliente não encontrado na carteira.");

  const n = (v: string | null | undefined) => normalizar(v);
  const candidatos = dados.perfis.map((p) => {
    let score = 0;
    const motivos: string[] = [];
    const restante = Math.max(0, p.capacidade - p.pontosUsados);
    const disponibilidade = p.capacidade > 0 ? restante / p.capacidade : 0;
    score += Math.min(35, disponibilidade * 35);
    motivos.push(`capacidade disponível ${Math.round(disponibilidade * 100)}%`);

    if (cliente.regime && p.regimes.some((r: string) => n(r) === n(cliente.regime))) {
      score += 25; motivos.push(`experiência em ${cliente.regime}`);
    }
    if (cliente.segmento && p.segmentos.some((s: string) => n(s) === n(cliente.segmento))) {
      score += 20; motivos.push(`experiência no segmento ${cliente.segmento}`);
    }
    const senior = /senior|sênior|coorden|especialista/i.test(p.senioridade ?? "");
    if (cliente.peso >= 4 && senior) { score += 10; motivos.push("senioridade compatível com alta complexidade"); }
    if (cliente.peso < 4) score += 5;
    if (p.utilizacao > 100) { score -= 30; motivos.push("carteira atual acima da capacidade"); }
    else if (p.utilizacao > 85) { score -= 12; motivos.push("carteira atual próxima da capacidade"); }

    return {
      profileId: p.id,
      nome: p.nome,
      aderencia: Math.max(0, Math.min(100, Math.round(score))),
      utilizacaoAtual: p.utilizacao,
      clientesAtuais: p.clientes,
      pontosAtuais: p.pontosUsados,
      capacidade: p.capacidade,
      motivos,
    };
  }).sort((a, b) => b.aderencia - a.aderencia);

  return { cliente, candidatos: candidatos.slice(0, 8), criterio: "Somente critérios profissionais: capacidade, regime, segmento, complexidade e senioridade. A decisão final é do gestor." };
}
