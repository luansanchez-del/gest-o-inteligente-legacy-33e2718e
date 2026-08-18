import type { AppContext } from "../../lib/context";
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
    if (error) throw new AppError("INESPERADO", "Não foi possível carregar a Carteira Inteligente.", error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

export async function listarCarteiraInteligenteAtiva(ctx: AppContext) {
  const [clientesPier, assignments, profiles] = await Promise.all([
    carregarTudo<any>((de, ate) => ctx.db.from("pier_client")
      .select("external_id,name,document,status,tax_regime,responsible_name,synced_at")
      .eq("organization_id", ctx.organizationId)
      .eq("status", "Ativo")
      .range(de, ate)),
    carregarTudo<any>((de, ate) => (ctx.db as any).from("portfolio_assignment")
      .select("id,client_key,client_external_id,client_document,client_name,official_responsible_external_id,official_responsible_name,tax_regime,segment,monthly_fee,bpo_budget,complexity_points,source,notes,group_name,fee_in_group,active,updated_at")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .range(de, ate)),
    carregarTudo<any>((de, ate) => ctx.db.from("bpo_profile")
      .select("id,profile_key,pier_user_external_id,name,email,seniority,max_capacity_points,target_monthly_value,tax_regimes,sectors,systems,skills,curriculum_summary,active,updated_at")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .range(de, ate)),
  ]);

  const aPorExt = new Map(assignments.filter((a: any) => a.client_external_id).map((a: any) => [a.client_external_id, a]));
  const aPorDoc = new Map(assignments.filter((a: any) => documento(a.client_document)).map((a: any) => [documento(a.client_document), a]));

  const linhas = clientesPier.map((p: any) => {
    const a = aPorExt.get(p.external_id) || aPorDoc.get(documento(p.document)) || null;
    return {
      clientKey: a?.client_key ?? chaveCliente({ externalId: p.external_id, document: p.document, name: p.name }),
      externalId: p.external_id,
      nome: p.name,
      documento: p.document,
      statusPier: p.status,
      regime: a?.tax_regime ?? p.tax_regime,
      segmento: a?.segment ?? null,
      grupo: a?.group_name ?? null,
      honorarioCobertoPorGrupo: Boolean(a?.fee_in_group),
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

  const totalPorGrupo = new Map<string, number>();
  for (const l of linhas) {
    if (!l.grupo) continue;
    const k = normalizar(l.grupo);
    totalPorGrupo.set(k, (totalPorGrupo.get(k) ?? 0) + Math.max(0, l.honorario ?? 0));
  }
  const linhasComGrupo = linhas.map((l) => ({
    ...l,
    honorarioGrupo: l.grupo ? totalPorGrupo.get(normalizar(l.grupo)) ?? 0 : null,
  }));

  const cargaPorNome = new Map<string, { clientes: number; pontos: number; honorarios: number; bpo: number }>();
  for (const l of linhasComGrupo) {
    if (!l.responsavelCarteira) continue;
    const k = normalizar(l.responsavelCarteira);
    const c = cargaPorNome.get(k) ?? { clientes: 0, pontos: 0, honorarios: 0, bpo: 0 };
    c.clientes += 1;
    c.pontos += l.peso;
    c.honorarios += l.honorario ?? 0;
    c.bpo += l.valorBpo ?? 0;
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

  const totalHonorarios = linhasComGrupo.reduce((s, l) => s + Math.max(0, l.honorario ?? 0), 0);
  const totalBpo = linhasComGrupo.reduce((s, l) => s + Math.max(0, l.valorBpo ?? 0), 0);
  const grupos = new Set(linhasComGrupo.map((l) => l.grupo ? normalizar(l.grupo) : "").filter(Boolean));

  return {
    resumo: {
      clientes: linhasComGrupo.length,
      comCarteira: linhasComGrupo.filter((l) => !l.semCarteira).length,
      semCarteira: linhasComGrupo.filter((l) => l.semCarteira).length,
      divergenciasPier: linhasComGrupo.filter((l) => l.divergencia).length,
      honorarios: totalHonorarios,
      valorBpo: totalBpo,
      margemBrutaCarteira: totalHonorarios - totalBpo,
      perfisBpo: perfis.length,
      grupos: grupos.size,
      clientesInclusosEmGrupo: linhasComGrupo.filter((l) => l.honorarioCobertoPorGrupo && l.grupo).length,
      semHonorarioLocalizado: linhasComGrupo.filter((l) => (l.honorario ?? 0) <= 0 && !l.grupo).length,
    },
    linhas: linhasComGrupo.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    perfis: perfis.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

export async function sugerirDistribuicaoAtiva(ctx: AppContext, input: { clientKey: string }) {
  const dados = await listarCarteiraInteligenteAtiva(ctx);
  const cliente = dados.linhas.find((l) => l.clientKey === input.clientKey);
  if (!cliente) throw new AppError("VALIDACAO", "Cliente ativo não encontrado na carteira.");

  const n = (v: string | null | undefined) => normalizar(v);
  const candidatos = dados.perfis.map((p) => {
    let score = 0;
    const motivos: string[] = [];
    const restante = Math.max(0, p.capacidade - p.pontosUsados);
    const disponibilidade = p.capacidade > 0 ? restante / p.capacidade : 0;
    score += Math.min(35, disponibilidade * 35);
    motivos.push(`capacidade disponível ${Math.round(disponibilidade * 100)}%`);

    if (cliente.regime && p.regimes.some((r: string) => n(r) === n(cliente.regime))) {
      score += 25;
      motivos.push(`experiência em ${cliente.regime}`);
    }
    if (cliente.segmento && p.segmentos.some((s: string) => n(s) === n(cliente.segmento))) {
      score += 20;
      motivos.push(`experiência no segmento ${cliente.segmento}`);
    }
    const senior = /senior|sênior|coorden|especialista/i.test(p.senioridade ?? "");
    if (cliente.peso >= 4 && senior) {
      score += 10;
      motivos.push("senioridade compatível com alta complexidade");
    }
    if (cliente.peso < 4) score += 5;
    if (p.utilizacao > 100) {
      score -= 30;
      motivos.push("carteira atual acima da capacidade");
    } else if (p.utilizacao > 85) {
      score -= 12;
      motivos.push("carteira atual próxima da capacidade");
    }

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

  return {
    cliente,
    candidatos: candidatos.slice(0, 8),
    criterio: "Somente clientes ativos. Critérios profissionais: capacidade, regime, segmento, complexidade e senioridade. A decisão final é do gestor.",
  };
}
